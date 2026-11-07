// ElevenLabs text to speech: warmer, more natural Romanian narration than Polly.
// The API key is an Amplify secret (ELEVENLABS_API_KEY), read from SSM when the function starts.
// Without it (or when a call fails, e.g. the credits ran out) the stories fall back to Polly.

const API = 'https://api.elevenlabs.io'

/** Multilingual v2 reads Romanian well and is the steadiest for long narration. */
export const DEFAULT_MODEL = 'eleven_multilingual_v2'

export type Voice = { id: string; name: string; description?: string; gender?: string; age?: string; accent?: string; romanian: boolean; category?: string }

/** The key from the secret, or undefined while it is not set (Amplify leaves a placeholder then). */
export function apiKey(): string | undefined {
  const k = process.env.ELEVENLABS_API_KEY?.trim()
  return k && !k.startsWith('<') ? k : undefined
}

async function call(path: string, init: RequestInit & { key: string }) {
  const { key, ...rest } = init
  const res = await fetch(`${API}${path}`, { ...rest, headers: { 'xi-api-key': key, 'content-type': 'application/json', ...rest.headers } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ElevenLabsError(res.status, body.slice(0, 500))
  }
  return res
}

export class ElevenLabsError extends Error {
  constructor(public status: number, public body: string) {
    super(`ElevenLabs ${status}: ${body}`)
  }
  /** The account is out of credits or over its limit. */
  get outOfCredits() { return /quota_exceeded|credit/i.test(this.body) }
}

type ApiVoice = {
  voice_id: string
  name: string
  category?: string
  description?: string | null
  labels?: Record<string, string> | null
  verified_languages?: { language?: string | null }[] | null
}

/** The voices in the account (premade ones plus those added from the Voice Library). */
export async function listVoices(key: string): Promise<Voice[]> {
  const res = await call('/v2/voices?page_size=100', { key })
  const { voices } = (await res.json()) as { voices: ApiVoice[] }
  return voices.map((v) => {
    const l = v.labels ?? {}
    const langs = [l.language, ...(v.verified_languages ?? []).map((x) => x.language)].filter(Boolean)
    return {
      id: v.voice_id,
      name: v.name,
      description: v.description ?? l.descriptive ?? l.description ?? undefined,
      gender: l.gender,
      age: l.age,
      accent: l.accent,
      category: v.category,
      romanian: langs.some((x) => /^ro\b|romanian/i.test(x ?? '')) || /roman/i.test(l.accent ?? ''),
    }
  }).sort((a, b) => Number(b.romanian) - Number(a.romanian) || a.name.localeCompare(b.name))
}

/** Settings for a calm bedtime reading: steady, a little slower than normal speech. */
const VOICE_SETTINGS = { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true, speed: 0.92 }

async function synthesize(key: string, voiceId: string, model: string, text: string, previous?: string, next?: string): Promise<Buffer> {
  const res = await call(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    key,
    method: 'POST',
    headers: { accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: VOICE_SETTINGS,
      // Only the Flash/Turbo models accept a forced language; Multilingual v2 detects it.
      ...(/flash|turbo/.test(model) ? { language_code: 'ro' } : {}),
      ...(previous ? { previous_text: previous.slice(-1000) } : {}),
      ...(next ? { next_text: next.slice(0, 1000) } : {}),
    }),
  })
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Reads the whole story, chunk by chunk (each well under the model's 10,000 character limit), and joins
 * the MP3s (their frames are self-contained). The text before and after goes along with each chunk,
 * so the voice keeps the same tone across the joins.
 */
export async function narrate(key: string, voiceId: string, model: string, chunks: string[]): Promise<Buffer> {
  const parts: Buffer[] = []
  for (let i = 0; i < chunks.length; i++) {
    parts.push(await synthesize(key, voiceId, model, chunks[i], chunks[i - 1], chunks[i + 1]))
  }
  return Buffer.concat(parts)
}

export const PREVIEW_TEXT = 'A fost odată, într-o căsuță de la marginea pădurii, un iepuraș care nu voia să doarmă. Hai să aflăm împreună ce s-a întâmplat!'

/** A short sample in Romanian, so the family can pick a voice by ear. */
export function preview(key: string, voiceId: string, model: string) {
  return synthesize(key, voiceId, model, PREVIEW_TEXT)
}
