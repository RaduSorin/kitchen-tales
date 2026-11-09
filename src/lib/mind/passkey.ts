// Face ID for Răgaz: a passkey with the PRF extension. Each Face ID with the passkey gives back
// the same 32-byte secret for the same salt; the key that unwraps the data key comes from it
// (crypto.ts). Tested on iOS 18.7 in the Home Screen app on 2026-11-09. Where PRF is missing
// (older iOS, some browsers) Răgaz opens with the backup code only.

import { b64, randomBytes, unb64 } from './crypto'

// The PRF extension's types are not in every TypeScript DOM library yet.
type PrfOutput = { enabled?: boolean; results?: { first?: ArrayBuffer } }
type PrfInput = { prf: { eval: { first: BufferSource } } }
const prfExt = (salt: Uint8Array) => ({ prf: { eval: { first: salt } } } as PrfInput as AuthenticationExtensionsClientInputs)
const prfOf = (cred: PublicKeyCredential) => (cred.getClientExtensionResults() as { prf?: PrfOutput }).prf

/** What the vault keeps about its passkey: which one, and the salt its secret is asked with. */
export type PasskeyRef = { credentialId: string; salt: string }

/** Whether this browser could have Face ID / Touch ID passkeys at all (PRF is only known by trying). */
export async function passkeysAvailable() {
  if (typeof window.PublicKeyCredential !== 'function') return false
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() } catch { return false }
}

/**
 * Creates the passkey and returns its PRF secret: Face ID once, or twice when the phone only
 * gives the secret on sign-in. Undefined secret: the passkey works but has no PRF, so it cannot
 * unlock anything. Call straight from a tap (iOS wants the prompt to come from one).
 */
export async function createPasskey(label: string): Promise<{ ref: PasskeyRef; secret?: ArrayBuffer }> {
  const salt = randomBytes(32)
  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Bucătăria cu povești' },
      user: { id: randomBytes(16), name: label, displayName: `Răgaz · ${label}` },
      challenge: randomBytes(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
      timeout: 60_000,
      extensions: prfExt(salt),
    },
  }) as PublicKeyCredential | null
  if (!cred) throw new Error('Nu s-a creat nicio cheie.')
  const ref = { credentialId: b64(cred.rawId), salt: b64(salt) }
  const prf = prfOf(cred)
  if (prf?.results?.first) return { ref, secret: prf.results.first }
  if (prf?.enabled === false) return { ref }
  return { ref, secret: await passkeySecret(ref) }
}

/** Face ID with the vault's passkey; the PRF secret, or undefined when the phone gives none. */
export async function passkeySecret(ref: PasskeyRef) {
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: unb64(ref.credentialId) }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: prfExt(unb64(ref.salt)),
    },
  }) as PublicKeyCredential | null
  if (!cred) throw new Error('Face ID nu a răspuns.')
  return prfOf(cred)?.results?.first
}

/** A cancelled or timed-out Face ID prompt: nothing to report, the person can try again. */
export const cancelled = (e: unknown) => e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError')
