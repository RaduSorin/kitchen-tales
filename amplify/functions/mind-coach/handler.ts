import { BedrockRuntimeClient, ConverseCommand, type Message, type SystemContentBlock } from '@aws-sdk/client-bedrock-runtime'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { MODEL_ID } from '../../shared/model'
import { MAX_MESSAGE, MAX_NOTE, MONTHLY_LIMIT, mindUsagePath, type CoachInput, type CoachMessage, type CoachOutput } from '../../shared/mindCoach'

const bedrock = new BedrockRuntimeClient({})
const s3 = new S3Client({})
const BUCKET = process.env.BUCKET_NAME!

type Event = { fieldName?: string; arguments?: { input?: string }; identity?: { sub?: string } }

const COACH = `Ești Claude, în modulul „Răgaz” al aplicației de familie „Bucătăria cu povești”. Vorbești în română, cald, simplu și practic, ca un coach blând pentru grija de sine.
- Răspunsuri scurte (cel mult 120–180 de cuvinte), cu cel mult o întrebare la final.
- Pași mici și concreți. Fără liste lungi, fără jargon, fără vinovăție, fără streak-uri sau punctaje.
- Nu pui diagnostice, nu faci terapie și nu interpretezi psihologic. Nu dai sfaturi medicale.
- Dacă textul sună a suferință mare, a pericol sau a gânduri de a-și face rău: nu propui exerciții. Răspunzi blând, validezi, și o încurajezi să vorbească acum cu o persoană apropiată sau cu un specialist; în pericol imediat, 112.
- Ce știi despre persoană e doar în notița de mai jos și în conversație. Nu inventa amintiri.`

const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n)

/** Counts the call against the person's monthly limit; throws when it is used up. */
async function count(sub: string) {
  const month = new Date().toISOString().slice(0, 7)
  let used = 0
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: mindUsagePath(sub) }))
    const u = JSON.parse(await res.Body!.transformToString()) as { month?: string; count?: number }
    if (u.month === month) used = u.count ?? 0
  } catch (err) {
    if ((err as { name?: string }).name !== 'NoSuchKey') throw err
  }
  if (used >= MONTHLY_LIMIT) throw new Error(`Ai folosit cele ${MONTHLY_LIMIT} de mesaje către Claude din luna asta. Se reiau pe 1.`)
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: mindUsagePath(sub), ContentType: 'application/json', Body: JSON.stringify({ month, count: used + 1 }) }))
  return used + 1
}

async function ask(system: SystemContentBlock[], messages: Message[], maxTokens: number, temperature = 0.7) {
  const res = await bedrock.send(new ConverseCommand({ modelId: MODEL_ID, system, messages, inferenceConfig: { maxTokens, temperature } }))
  console.log('mind-coach', { in: res.usage?.inputTokens, out: res.usage?.outputTokens, cacheRead: res.usage?.cacheReadInputTokens, ms: res.metrics?.latencyMs })
  return res.output?.message?.content?.map((c) => c.text ?? '').join('').trim() ?? ''
}

/** The conversation for Bedrock: alternating turns, starting and ending with the person. */
function turns(list: CoachMessage[]): Message[] {
  const out: Message[] = []
  for (const m of list.slice(-30)) {
    const text = clip(m.text, MAX_MESSAGE).trim()
    if (!text) continue
    const role = m.role === 'assistant' ? 'assistant' : 'user'
    const last = out[out.length - 1]
    if (last?.role === role) last.content!.push({ text })
    else out.push({ role, content: [{ text }] })
  }
  while (out[0]?.role === 'assistant') out.shift()
  if (out[out.length - 1]?.role !== 'user') throw new Error('Scrie un mesaj.')
  return out
}

function json<T>(text: string): T {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('Claude nu a răspuns cum trebuia. Încearcă din nou.')
  return JSON.parse(m[0]) as T
}

async function run(input: CoachInput): Promise<CoachOutput> {
  if (input.kind === 'chat') {
    // The note and the allowed context first, cached: they repeat on every message.
    const system: SystemContentBlock[] = [{ text: COACH }]
    const note = clip(input.note, MAX_NOTE).trim()
    if (note) system.push({ text: `Ce știe Claude despre persoană (notiță scrisă și aprobată de ea):\n${note}` })
    const context = clip(input.context, 3000).trim()
    if (context) system.push({ text: `Din aplicație, cu acordul ei:\n${context}` })
    system.push({ cachePoint: { type: 'default' } })
    return { kind: 'chat', text: await ask(system, turns(input.messages), 700) }
  }
  if (input.kind === 'remember') {
    const convo = turns(input.messages).map((m) => `${m.role === 'user' ? 'Ea' : 'Claude'}: ${m.content!.map((c) => c.text).join(' ')}`).join('\n')
    const text = await ask([{ text: `${COACH}\n\nAcum nu răspunzi în conversație. Propui ce merită adăugat în notița „Ce știe Claude despre mine”: 1–4 rânduri scurte, fapte și preferințe utile pe viitor (ce o ajută, ce evită, unde a rămas). Fără detalii intime inutile, fără diagnostic. Dacă nu e nimic nou față de notiță, răspunde exact: NIMIC.` }],
      [{ role: 'user', content: [{ text: `Notița de acum:\n${clip(input.note, MAX_NOTE) || '(goală)'}\n\nConversația:\n${clip(convo, 20000)}` }] }], 300, 0.3)
    return { kind: 'remember', text: text === 'NIMIC' ? '' : text }
  }
  if (input.kind === 'themes') {
    const bank = input.bank.slice(0, 80).map((b) => `- ${clip(b.title, 120)}${b.category ? ` (${clip(b.category, 60)})` : ''}`).join('\n')
    const text = await ask([{ text: 'Alegi exerciții pentru vinerile unei luni, dintr-o listă dată. Răspunzi doar cu JSON: {"picks": ["titlu exact din listă", ...]}, câte unul pentru fiecare vineri, fără repetări când se poate, potrivite cu intenția. Prima vineri: ceva ușor.' }],
      [{ role: 'user', content: [{ text: `Intenția lunii: ${clip(input.intention, 300)}\nVineri: ${input.fridays.length}\nExerciții disponibile:\n${bank}` }] }], 300, 0.4)
    const titles = new Set(input.bank.map((b) => b.title))
    return { kind: 'themes', picks: (json<{ picks?: string[] }>(text).picks ?? []).filter((p) => titles.has(p)).slice(0, input.fridays.length) }
  }
  if (input.kind === 'sort') {
    const items = input.items.slice(0, 20).map((i) => clip(i, 200))
    const text = await ask([{ text: 'Sortezi o listă de griji în „piatră” (nu depinde de persoană) și „plastilină” (depinde de ea), ca în exercițiul „Ce îți stă pe creier?”. Un element mixt poate apărea în ambele. Propui și un singur pas mic, de cel mult 10 minute, pentru plastilina cea mai mare. Răspunzi doar cu JSON: {"stone": [...], "clay": [...], "step": "..."}, cu elementele scrise exact ca în listă, plastilina ordonată de la cea mai mare la cea mai mică.' }],
      [{ role: 'user', content: [{ text: items.map((i) => `- ${i}`).join('\n') }] }], 400, 0.2)
    const r = json<{ stone?: string[]; clay?: string[]; step?: string }>(text)
    const known = (x: string[] = []) => x.filter((i) => items.includes(i))
    return { kind: 'sort', stone: known(r.stone), clay: known(r.clay), step: r.step ? clip(r.step, 200) : undefined }
  }
  throw new Error('Necunoscut.')
}

export const handler = async (event: Event) => {
  const sub = event.identity?.sub
  if (event.fieldName !== 'mindCoach' || !sub) throw new Error('Necunoscut.')
  const input = JSON.parse(event.arguments?.input ?? '{}') as CoachInput
  await count(sub)
  return JSON.stringify(await run(input))
}
