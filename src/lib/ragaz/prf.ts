// Răgaz keeps its journal encrypted on the device. The plan is to unlock that key with Face ID
// through a passkey's PRF extension: each successful Face ID returns the same 32-byte secret, from
// which the encryption key is derived. This file is the technical test of that path (page
// /ragaz/test): it checks that the Home Screen app on iOS can create such a passkey, read the PRF
// secret back, and decrypt with it what it encrypted before.

const CRED_KEY = 'kt-ragaz-test-cred'
const DATA_KEY = 'kt-ragaz-test-data'

// The PRF extension's types are not in every TypeScript DOM library yet.
type PrfOutput = { enabled?: boolean; results?: { first?: ArrayBuffer } }
type PrfInput = { prf: { eval: { first: BufferSource } } }

const enc = new TextEncoder()
const dec = new TextDecoder()

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** A fixed salt: the same passkey and salt always give the same PRF secret. */
export const testSalt = (): Promise<Uint8Array> =>
  crypto.subtle.digest('SHA-256', enc.encode('kt-ragaz-prf-test-v1')).then((d) => new Uint8Array(d))

export type Environment = {
  standalone: boolean
  ios: string
  webauthn: boolean
  platformAuthenticator: boolean | 'unknown'
  prfCapability: boolean | 'unknown'
}

export async function environment(): Promise<Environment> {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  const ios = /OS (\d+[_.]\d+(?:[_.]\d+)?) like Mac OS X/.exec(navigator.userAgent)?.[1]?.replace(/_/g, '.') ?? '-'
  const webauthn = typeof window.PublicKeyCredential === 'function'
  let platformAuthenticator: Environment['platformAuthenticator'] = 'unknown'
  let prfCapability: Environment['prfCapability'] = 'unknown'
  if (webauthn) {
    try { platformAuthenticator = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() } catch { /* not reported */ }
    const caps = (PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> }).getClientCapabilities
    if (caps) {
      try { const c = await caps.call(PublicKeyCredential); if ('extension:prf' in c) prfCapability = !!c['extension:prf'] } catch { /* not reported */ }
    }
  }
  return { standalone, ios, webauthn, platformAuthenticator, prfCapability }
}

export const hasTestPasskey = () => { try { return !!localStorage.getItem(CRED_KEY) } catch { return false } }

/** Creates the test passkey (Face ID prompt). Call straight from a tap. */
export async function createPasskey(salt: Uint8Array) {
  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Bucătăria cu povești' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'ragaz-test', displayName: 'Răgaz (test)' },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
      timeout: 60_000,
      extensions: { prf: { eval: { first: salt } } } as PrfInput as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential | null
  if (!cred) throw new Error('Nu s-a creat nicio cheie.')
  const prf = (cred.getClientExtensionResults() as { prf?: PrfOutput }).prf
  try { localStorage.setItem(CRED_KEY, b64(cred.rawId)) } catch { /* storage unavailable */ }
  return { prfEnabled: prf?.enabled, secretAtCreate: !!prf?.results?.first }
}

/** Face ID with the test passkey; returns the PRF secret, or undefined when PRF is not supported. */
export async function unlock(salt: Uint8Array) {
  const id = localStorage.getItem(CRED_KEY)
  if (!id) throw new Error('Creează întâi cheia de test.')
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: unb64(id) }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: salt } } } as PrfInput as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential | null
  if (!cred) throw new Error('Face ID nu a răspuns.')
  return (cred.getClientExtensionResults() as { prf?: PrfOutput }).prf?.results?.first
}

async function aesKey(secret: ArrayBuffer) {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('kt-ragaz'), info: enc.encode('journal-key-test') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

/**
 * First run: encrypts a sample text with the key from the PRF secret and keeps it.
 * Later runs: decrypts it, which proves Face ID gives back the same key.
 */
export async function roundTrip(secret: ArrayBuffer): Promise<{ kind: 'saved' } | { kind: 'decrypted'; text: string }> {
  const key = await aesKey(secret)
  const kept = localStorage.getItem(DATA_KEY)
  if (kept) {
    const { iv, data } = JSON.parse(kept) as { iv: string; data: string }
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(data))
    return { kind: 'decrypted', text: dec.decode(plain) }
  }
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const text = `Text de probă criptat la ${new Date().toLocaleString('ro-RO')}`
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text))
  localStorage.setItem(DATA_KEY, JSON.stringify({ iv: b64(iv), data: b64(data) }))
  return { kind: 'saved' }
}

/** Forgets the test passkey id and sample (the passkey itself stays in Passwords until deleted there). */
export function resetTest() {
  try { localStorage.removeItem(CRED_KEY); localStorage.removeItem(DATA_KEY) } catch { /* storage unavailable */ }
}
