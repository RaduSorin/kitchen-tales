// Răgaz encryption. One random data key (DEK) encrypts everything the person writes. The DEK is
// never stored as is: it is kept "wrapped" (encrypted) twice, once with a key from the passkey's
// PRF secret (Face ID) and once with a key from the backup code. Changing the code or adding a
// phone only wraps the DEK again; the data itself is never encrypted again.

const enc = new TextEncoder()
const dec = new TextDecoder()

/** PBKDF2 rounds for the backup code (OWASP 2023 figure for SHA-256). */
export const CODE_ITERATIONS = 600_000

export const b64 = (b: ArrayBuffer | Uint8Array) => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n))

/** Encrypted bytes and the nonce they were encrypted with, both base64. */
export type Sealed = { iv: string; data: string }

/** A data key that can still be wrapped again (for a new code or a new phone). */
export const newDataKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']) as Promise<CryptoKey>

/** The wrapping key from a passkey's PRF secret. */
export async function keyFromPrf(secret: ArrayBuffer | Uint8Array) {
  const base = await crypto.subtle.importKey('raw', secret as BufferSource, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('kt-ragaz'), info: enc.encode('wrap-dek-v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey'],
  )
}

/** The wrapping key from the backup code. Slow on purpose (about a second on a phone). */
export async function keyFromCode(code: string, salt: Uint8Array, iterations = CODE_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey'],
  )
}

export async function wrap(dek: CryptoKey, kek: CryptoKey): Promise<Sealed> {
  const iv = randomBytes(12)
  const data = await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv })
  return { iv: b64(iv), data: b64(data) }
}

/** The data key, or an error when the wrapping key is the wrong one (wrong code, other passkey). */
export function unwrap(sealed: Sealed, kek: CryptoKey) {
  return crypto.subtle.unwrapKey('raw', unb64(sealed.data), kek, { name: 'AES-GCM', iv: unb64(sealed.iv) },
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function seal(dek: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = randomBytes(12)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, enc.encode(JSON.stringify(value)))
  return { iv: b64(iv), data: b64(data) }
}

export async function open<T>(dek: CryptoKey, sealed: Sealed): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, dek, unb64(sealed.data))
  return JSON.parse(dec.decode(plain)) as T
}
