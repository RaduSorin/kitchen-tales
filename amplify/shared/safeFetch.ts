import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * fetch() for addresses that come from users (a recipe link, the photo on that page): only
 * public internet hosts, never this function's own network (localhost, the AWS metadata
 * address 169.254.169.254, private ranges). Redirects are followed by hand, at most 5, and
 * every hop is checked the same way.
 */
export async function safeFetch(raw: string | URL, init: RequestInit = {}, hops = 5): Promise<Response> {
  let url = new URL(raw)
  for (let i = 0; i <= hops; i++) {
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Linkul trebuie să înceapă cu http:// sau https://')
    await assertPublic(url.hostname)
    const res = await fetch(url, { ...init, redirect: 'manual' })
    const to = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (!to) return res
    url = new URL(to, url)
  }
  throw new Error('Linkul trimite prea departe (prea multe redirecționări).')
}

async function assertPublic(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address)
  if (!addresses.length || addresses.some(isPrivate)) throw new Error('Linkul nu duce la un site public.')
}

export function isPrivate(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  }
  const x = ip.toLowerCase()
  return x === '::' || x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') ||
    x.startsWith('fea') || x.startsWith('feb') || x.startsWith('ff')
}
