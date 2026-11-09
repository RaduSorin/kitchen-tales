import { ConflictException, CreateScheduleCommand, DeleteScheduleCommand, SchedulerClient, UpdateScheduleCommand, type CreateScheduleCommandInput } from '@aws-sdk/client-scheduler'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { Context } from 'aws-lambda'
import { sendPush, type PushSubscriptionJson } from '../timer-alarm/webpush'
import { DEFAULT_RHYTHMS, RHYTHM_DAY, TIME, mindPushPath, type PushSave, type PushState, type Rhythm } from '../../shared/mindPush'

const s3 = new S3Client({})
const scheduler = new SchedulerClient({})
const BUCKET = process.env.BUCKET_NAME!
const ROLE_ARN = process.env.SCHEDULER_ROLE_ARN!
const KEYS = { publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY!, subject: process.env.VAPID_SUBJECT! }
const TZ = 'Europe/Bucharest'
const RHYTHMS = Object.keys(DEFAULT_RHYTHMS) as Rhythm[]
// A reminder still worth showing a few hours late (phone off, Focus), but not the next day.
const TTL = 6 * 3600

type Event = {
  fieldName?: string
  arguments?: { op?: string; data?: string | null }
  identity?: { sub?: string }
  kind?: 'fire'
  sub?: string
  rhythm?: Rhythm
}

const scheduleName = (sub: string, r: Rhythm) => `ktm-${sub}-${r}`

async function load(sub: string): Promise<PushState> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: mindPushPath(sub) }))
    const s = JSON.parse(await res.Body!.transformToString()) as Partial<PushState>
    return { rhythms: { ...DEFAULT_RHYTHMS, ...s.rhythms }, months: s.months ?? {}, devices: s.devices ?? {}, updatedAt: s.updatedAt }
  } catch (err) {
    if ((err as { name?: string }).name === 'NoSuchKey') return { rhythms: DEFAULT_RHYTHMS, months: {}, devices: {} }
    throw err
  }
}

async function store(sub: string, s: PushState) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: mindPushPath(sub), ContentType: 'application/json', Body: JSON.stringify({ ...s, updatedAt: new Date().toISOString() }) }))
}

/** Today in Bucharest, YYYY-MM-DD, and the day of the month. */
function localToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return { date: `${get('year')}-${get('month')}-${get('day')}`, day: Number(get('day')) }
}

/** Creates, changes or removes the person's schedules so they match the rhythms. */
async function sync(sub: string, s: PushState, functionArn: string) {
  for (const r of RHYTHMS) {
    const name = scheduleName(sub, r)
    const set = s.rhythms[r]
    if (!set?.on || !Object.keys(s.devices).length) {
      try { await scheduler.send(new DeleteScheduleCommand({ Name: name })) } catch (err) {
        if ((err as Error).name !== 'ResourceNotFoundException') throw err
      }
      continue
    }
    const [h, m] = set.time.split(':').map(Number)
    const input: CreateScheduleCommandInput = {
      Name: name,
      ScheduleExpression: `cron(${m} ${h} ? * ${RHYTHM_DAY[r]} *)`,
      ScheduleExpressionTimezone: TZ,
      FlexibleTimeWindow: { Mode: 'OFF' },
      Target: { Arn: functionArn, RoleArn: ROLE_ARN, Input: JSON.stringify({ kind: 'fire', sub, rhythm: r }), RetryPolicy: { MaximumRetryAttempts: 2, MaximumEventAgeInSeconds: 3600 } },
    }
    try { await scheduler.send(new CreateScheduleCommand(input)) } catch (err) {
      if (!(err instanceof ConflictException) && (err as Error).name !== 'ConflictException') throw err
      await scheduler.send(new UpdateScheduleCommand(input))
    }
  }
}

/** Sends to every phone of the person; drops the ones whose subscription is gone. Returns how many got it. */
async function sendAll(sub: string, s: PushState, data: object) {
  let sent = 0
  let dropped = false
  for (const [id, device] of Object.entries(s.devices)) {
    const status = await sendPush(device as PushSubscriptionJson, data, KEYS, TTL).catch(() => 0)
    if (status === 404 || status === 410) { delete s.devices[id]; dropped = true }
    else if (status >= 200 && status < 300) sent++
  }
  if (dropped) await store(sub, s)
  return sent
}

/** The notification for a rhythm today: its title says what it is, as the lock screen shows only that. */
function message(s: PushState, rhythm: Rhythm) {
  const { date, day } = localToday()
  if (rhythm === 'friday') {
    const title = s.months[date.slice(0, 7)]?.find((f) => f.date === date)?.title
    return { title: title ? `Vineri: ${title}` : 'Vineri: un răgaz pentru tine', body: 'Exercițiul de azi te așteaptă, cu nota de după.', tag: `ragaz-${date}`, url: `/ragaz/vineri/${date}` }
  }
  // The first Monday of the month is the monthly reflection, the others the worry list.
  return day <= 7
    ? { title: 'Reflecția lunii', body: 'Câteva minute pentru luna care a trecut și intenția celei noi.', tag: `ragaz-${date}`, url: '/ragaz/reflectie' }
    : { title: 'Lista de griji', body: 'Ce e piatră și ce e plastilină săptămâna asta?', tag: `ragaz-${date}`, url: '/ragaz/griji' }
}

function cleanSave(raw: string | null | undefined): PushSave {
  const d = JSON.parse(raw ?? '{}') as PushSave
  const out: PushSave = {}
  if (d.rhythms) {
    out.rhythms = { ...DEFAULT_RHYTHMS }
    for (const r of RHYTHMS) {
      const x = d.rhythms[r]
      if (x && typeof x.on === 'boolean' && TIME.test(x.time)) out.rhythms[r] = { on: x.on, time: x.time }
    }
  }
  if (d.month && /^\d{4}-\d{2}$/.test(d.month.id) && Array.isArray(d.month.fridays)) {
    out.month = { id: d.month.id, fridays: d.month.fridays.slice(0, 5).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f.date)).map((f) => ({ date: f.date, title: String(f.title ?? '').slice(0, 80) })) }
  }
  const sub = d.device?.subscription
  if (d.device && /^[\w-]{1,40}$/.test(d.device.id) && sub?.endpoint?.startsWith('https://') && sub.keys?.p256dh && sub.keys?.auth) {
    out.device = { id: d.device.id, subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } } }
  }
  if (d.removeDevice && /^[\w-]{1,40}$/.test(d.removeDevice)) out.removeDevice = d.removeDevice
  return out
}

export const handler = async (event: Event, context: Context) => {
  // From EventBridge Scheduler: a rhythm's time has come.
  if (event.kind === 'fire' && event.sub && event.rhythm) {
    const s = await load(event.sub)
    if (!s.rhythms[event.rhythm]?.on) return { sent: 0 }
    return { sent: await sendAll(event.sub, s, message(s, event.rhythm)) }
  }

  // From the app: always the caller's own state (the sub comes from the token, never an argument).
  const sub = event.identity?.sub
  if (event.fieldName !== 'mindPush' || !sub) throw new Error('Necunoscut.')
  const op = event.arguments?.op
  if (op === 'off') {
    await sync(sub, { rhythms: DEFAULT_RHYTHMS, months: {}, devices: {} }, context.invokedFunctionArn)
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: mindPushPath(sub) }))
    return JSON.stringify({ devices: 0 })
  }
  const s = await load(sub)
  if (op === 'save') {
    const d = cleanSave(event.arguments?.data)
    if (d.rhythms) s.rhythms = d.rhythms
    if (d.month) {
      s.months[d.month.id] = d.month.fridays
      // Keep this month and the ones ahead: past themes are not needed for reminders.
      const now = localToday().date.slice(0, 7)
      for (const k of Object.keys(s.months)) if (k < now) delete s.months[k]
    }
    if (d.device) s.devices[d.device.id] = d.device.subscription
    if (d.removeDevice) delete s.devices[d.removeDevice]
    // A person with many phones over the years: keep the 5 most recent.
    const ids = Object.keys(s.devices)
    for (const id of ids.slice(0, Math.max(0, ids.length - 5))) delete s.devices[id]
    await store(sub, s)
    await sync(sub, s, context.invokedFunctionArn)
  } else if (op === 'test') {
    const sent = await sendAll(sub, s, { title: 'Răgaz', body: 'Notificările merg. Ne auzim vineri.', tag: 'ragaz-test', url: '/ragaz' })
    return JSON.stringify({ devices: Object.keys(s.devices).length, sent })
  } else if (op !== 'status') {
    throw new Error('Necunoscut.')
  }
  return JSON.stringify({ devices: Object.keys(s.devices).length, rhythms: s.rhythms })
}
