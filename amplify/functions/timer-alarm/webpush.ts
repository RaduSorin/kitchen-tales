// Web Push without a library: payload encryption (RFC 8291, aes128gcm) and VAPID (RFC 8292).
import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign, type ECDH } from 'node:crypto'

export interface PushSubscriptionJson { endpoint: string; keys: { p256dh: string; auth: string } }

const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest()
const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, length: number) =>
  hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).subarray(0, length)

/** Encrypts the payload for one browser subscription (one record, aes128gcm). */
export function encrypt(payload: Buffer, sub: PushSubscriptionJson, salt = randomBytes(16), ecdh?: ECDH) {
  const uaPublic = Buffer.from(sub.keys.p256dh, 'base64url')
  const authSecret = Buffer.from(sub.keys.auth, 'base64url')
  if (!ecdh) { ecdh = createECDH('prime256v1'); ecdh.generateKeys() }
  const asPublic = ecdh.getPublicKey()
  const shared = ecdh.computeSecret(uaPublic)
  const ikm = hkdf(authSecret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32)
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12)
  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const header = Buffer.alloc(21)
  salt.copy(header, 0)
  header.writeUInt32BE(4096, 16)
  header.writeUInt8(asPublic.length, 20)
  return Buffer.concat([header, asPublic, body])
}

/** The VAPID Authorization header for a push service (its origin is the token's audience). */
export function vapidAuth(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const pub = Buffer.from(publicKey, 'base64url')
  const key = createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: privateKey, x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33, 65).toString('base64url') },
    format: 'jwk',
  })
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })}`
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  return `vapid t=${unsigned}.${signature}, k=${publicKey}`
}

/** Sends one notification. Returns the push service's HTTP status (404/410: the subscription is gone). */
export async function sendPush(sub: PushSubscriptionJson, data: object, keys: { publicKey: string; privateKey: string; subject: string }) {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidAuth(sub.endpoint, keys.publicKey, keys.privateKey, keys.subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '600',
      Urgency: 'high',
    },
    body: encrypt(Buffer.from(JSON.stringify(data)), sub),
    signal: AbortSignal.timeout(10_000),
  })
  return res.status
}
