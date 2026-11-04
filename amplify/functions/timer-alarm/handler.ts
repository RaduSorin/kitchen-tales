import { CreateScheduleCommand, DeleteScheduleCommand, SchedulerClient } from '@aws-sdk/client-scheduler'
import type { Context } from 'aws-lambda'
import { sendPush, type PushSubscriptionJson } from './webpush'

const scheduler = new SchedulerClient({})
const ROLE_ARN = process.env.SCHEDULER_ROLE_ARN!
const KEYS = { publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY!, subject: process.env.VAPID_SUBJECT! }
// One schedule per running timer: "kt-<device>-<recipe>-<step>", made by the app.
const ID = /^kt-[A-Za-z0-9_.-]{1,60}$/
const MAX_AHEAD_MS = 24 * 3600_000

type Args = { id?: string | null; endsAt?: string | null; title?: string | null; body?: string | null; url?: string | null; subscription?: string | null }
type Event = { fieldName?: string; arguments?: Args; kind?: 'send'; subscription?: PushSubscriptionJson; data?: object }

function check(id?: string | null) {
  if (!id || !ID.test(id)) throw new Error('Cronometru necunoscut.')
  return id
}

async function cancel(id: string) {
  try { await scheduler.send(new DeleteScheduleCommand({ Name: id })) } catch (err) {
    if ((err as Error).name !== 'ResourceNotFoundException') throw err
  }
}

async function schedule(a: Args, functionArn: string) {
  const id = check(a.id)
  const end = new Date(a.endsAt ?? '')
  const ms = end.getTime() - Date.now()
  if (!isFinite(ms) || ms > MAX_AHEAD_MS) throw new Error('Ora de final nu e bună.')
  const sub = JSON.parse(a.subscription ?? 'null') as PushSubscriptionJson | null
  if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error('Notificările nu sunt pornite pe acest telefon.')
  const data = { title: (a.title ?? 'Cronometrul').slice(0, 80), body: (a.body ?? 'E gata!').slice(0, 200), tag: id, url: a.url?.startsWith('/') ? a.url : '/' }
  // Already over (or within a few seconds): send right away.
  if (ms < 3000) { await sendPush(sub, data, KEYS); return true }
  await cancel(id) // a timer started again replaces its earlier alarm
  await scheduler.send(new CreateScheduleCommand({
    Name: id,
    ScheduleExpression: `at(${end.toISOString().slice(0, 19)})`,
    ScheduleExpressionTimezone: 'UTC',
    FlexibleTimeWindow: { Mode: 'OFF' },
    ActionAfterCompletion: 'DELETE',
    Target: { Arn: functionArn, RoleArn: ROLE_ARN, Input: JSON.stringify({ kind: 'send', subscription: sub, data }), RetryPolicy: { MaximumRetryAttempts: 2, MaximumEventAgeInSeconds: 300 } },
  }))
  return true
}

export const handler = async (event: Event, context: Context) => {
  // From EventBridge Scheduler: the timer is over, notify the phone.
  if (event.kind === 'send' && event.subscription && event.data) {
    const status = await sendPush(event.subscription, event.data, KEYS)
    // 404/410: the phone unsubscribed; nothing to retry.
    if (status >= 500 || status === 429) throw new Error(`push service ${status}`)
    return { status }
  }
  if (event.fieldName === 'scheduleTimerAlarm') return schedule(event.arguments ?? {}, context.invokedFunctionArn)
  if (event.fieldName === 'cancelTimerAlarm') { await cancel(check(event.arguments?.id)); return true }
  throw new Error(`Unknown field ${event.fieldName}`)
}
