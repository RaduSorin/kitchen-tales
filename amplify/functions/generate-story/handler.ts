import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { PollyClient, SynthesizeSpeechCommand, type VoiceId } from '@aws-sdk/client-polly'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { Schema } from '../../data/resource'

const bedrock = new BedrockRuntimeClient({})
const polly = new PollyClient({})
const s3 = new S3Client({})
const BUCKET = process.env.kitchenTalesFiles_BUCKET_NAME!
const MODEL_ID = process.env.MODEL_ID!
const VOICE_ID = process.env.VOICE_ID as VoiceId

const MAX_TEXT_CHARS = 12_000
// Polly bills and limits on text characters; keep each SSML request well under 3000.
const CHUNK_CHARS = 2400

const SYSTEM = `Ești un povestitor pentru copii mici (3–7 ani). Scrii povești de seară în limba română, cu diacritice.
- Lungime: 400–700 de cuvinte.
- Ton cald, liniștitor, potrivit înainte de culcare. Fără violență, fără frică, fără mesaje de marketing.
- Fraze scurte și clare, ușor de citit cu voce tare. Dialoguri simple.
- Un mic mesaj frumos la final (prietenie, curaj, bunătate), fără să fie moralizator.
- Răspunde doar cu textul poveștii, fără titlu și fără alte comentarii.`

async function writeStory(title: string, prompt: string) {
  const res = await bedrock.send(new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: SYSTEM }],
    messages: [{ role: 'user', content: [{ text: `Titlul poveștii: ${title}\nDespre ce să fie: ${prompt || 'alege tu o idee frumoasă'}` }] }],
    inferenceConfig: { maxTokens: 3000, temperature: 0.9 },
  }))
  const text = res.output?.message?.content?.map((c) => c.text ?? '').join('').trim()
  if (!text) throw new Error('Nu am reușit să scriu povestea. Încearcă din nou.')
  return text
}

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Splits text into Polly-sized chunks at paragraph, then sentence, boundaries.
export function chunkText(text: string, max = CHUNK_CHARS): string[] {
  const sentences = text
    .split(/\n\s*\n/)
    .flatMap((para) => (para.match(/[^.!?…]+[.!?…]+["”»]?\s*|[^.!?…]+$/g) ?? [para]).map((s, i, all) => (i === all.length - 1 ? `${s.trim()}\n\n` : s)))
  const chunks: string[] = []
  let cur = ''
  for (const s of sentences) {
    if (cur && (cur + s).length > max) { chunks.push(cur.trim()); cur = '' }
    if (s.length > max) { for (let i = 0; i < s.length; i += max) chunks.push(s.slice(i, i + max).trim()); continue }
    cur += s
  }
  if (cur.trim()) chunks.push(cur.trim())
  return chunks
}

export function toSsml(chunk: string) {
  const body = chunk.split(/\n\s*\n/).map((p) => escapeXml(p.trim())).filter(Boolean).join('<break time="700ms"/>')
  return `<speak><prosody rate="90%">${body}</prosody></speak>`
}

async function speak(text: string): Promise<Buffer> {
  const parts: Buffer[] = []
  for (const chunk of chunkText(text)) {
    const res = await polly.send(new SynthesizeSpeechCommand({
      Text: toSsml(chunk), TextType: 'ssml', VoiceId: VOICE_ID, Engine: 'standard', OutputFormat: 'mp3', LanguageCode: 'ro-RO',
    }))
    parts.push(Buffer.from(await res.AudioStream!.transformToByteArray()))
  }
  // MP3 frames are self-contained, so the chunks can be joined back to back.
  return Buffer.concat(parts)
}

export const handler: Schema['generateStory']['functionHandler'] = async (event) => {
  const title = event.arguments.title.trim()
  const ownText = event.arguments.text?.trim()
  if (!title) throw new Error('Povestea are nevoie de un titlu.')
  const text = (ownText || (await writeStory(title, event.arguments.prompt?.trim() ?? ''))).slice(0, MAX_TEXT_CHARS)

  const audio = await speak(text)
  const audioKey = `stories/${crypto.randomUUID()}.mp3`
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: audioKey, Body: audio, ContentType: 'audio/mpeg' }))
  return { text, audioKey }
}
