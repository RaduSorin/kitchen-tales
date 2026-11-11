import { fetchAuthSession } from 'aws-amplify/auth'
import outputs from '../../amplify_outputs.json'

// Live Romanian dictation: microphone -> 16 kHz PCM -> Amazon Transcribe streaming (WebSocket).
// The Transcribe SDK is loaded only when the mic is first used, to keep the app bundle small.

const RATE = 16_000
const CHUNK_SAMPLES = RATE / 10 // ~100 ms of audio per message

export type DictationHandlers = {
  /**
   * Called on every update: `segments` are the settled phrases so far (Transcribe closes one at each pause),
   * `partial` the words still being recognised.
   */
  onText: (segments: string[], partial: string) => void
  /** Microphone loudness, 0..1, for the button animation. */
  onLevel?: (level: number) => void
  /** Called once when the session ends; `error` is set when it ended on a failure. */
  onEnd: (error?: Error) => void
  /** While this returns true, silence is sent instead of the microphone (the phone is speaking). */
  muted?: () => boolean
}

export type Dictation = { stop: () => void }

/** What went wrong, in words, plus the technical name and message (small, to tell us). */
export function dictationError(err: unknown): { text: string; detail?: string } {
  const e = err as (Error & { $metadata?: { websocketSynthetic500Error?: boolean; httpStatusCode?: number }; type?: string }) | undefined
  // The SDK rejects with a bare object when the WebSocket doesn't open in time, and with an Event
  // when the socket fails; give both a readable name.
  if (e?.$metadata?.websocketSynthetic500Error) return { text: 'Nu mă pot conecta la serviciul de dictare. Încearcă din nou.', detail: 'WebSocket: conexiunea nu s-a deschis la timp' }
  const name = e?.name ?? (e?.type ? `WebSocket ${e.type}` : '')
  const msg = e?.message ?? (e?.type ? '' : String(err ?? ''))
  const detail = [name, msg].filter(Boolean).join(': ').slice(0, 160) || undefined
  if (name === 'NotAllowedError' || name === 'SecurityError') return { text: 'Nu am acces la microfon. Permite-l din Setări › Safari › Microfon.' }
  if (name === 'NotFoundError') return { text: 'Nu găsesc niciun microfon.' }
  if (name === 'AudioBlockedError') return { text: 'Telefonul nu a pornit microfonul. Atinge din nou butonul de microfon.', detail }
  if (name === 'NoAudioError') return { text: 'Microfonul nu trimite sunet. Închide alte aplicații care îl folosesc (un apel, o înregistrare) și încearcă din nou.', detail }
  if (/no new audio|timed out/i.test(msg)) return { text: 'Dictarea s-a oprit pentru că n-a mai auzit nimic. Apasă microfonul și vorbește din nou.', detail }
  if (/Expired|UnrecognizedClient|InvalidSignature|AccessDenied|not authorized|Nu ești conectat/i.test(name + msg)) return { text: 'Sesiunea a expirat. Ieși din cont și intră din nou, apoi încearcă iar.', detail }
  if (/LimitExceeded|Throttl/i.test(name + msg)) return { text: 'Serviciul de dictare e ocupat acum. Încearcă din nou peste câteva secunde.', detail }
  if (/socket|network|fetch|connect/i.test(name + msg)) return { text: 'Nu mă pot conecta la serviciul de dictare. Unele rețele mobile îl blochează: încearcă pe Wi‑Fi.', detail }
  return { text: 'Dictarea s-a oprit. Încearcă din nou.', detail }
}

// Runs on the audio thread: forwards each block of samples to the page.
const WORKLET = `class Tap extends AudioWorkletProcessor {
  process(inputs) { const c = inputs[0] && inputs[0][0]; if (c) this.port.postMessage(c.slice(0)); return true }
}
registerProcessor('kt-tap', Tap)`

/** Averages samples down to 16 kHz and converts them to 16-bit little-endian PCM. */
function toPcm16(input: Float32Array, fromRate: number, carry: { buf: number[] }): Uint8Array[] {
  const ratio = fromRate / RATE
  const out = carry.buf
  for (let i = 0; i < Math.floor(input.length / ratio); i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    out.push(sum / Math.max(1, end - start))
  }
  const chunks: Uint8Array[] = []
  while (out.length >= CHUNK_SAMPLES) {
    const part = out.splice(0, CHUNK_SAMPLES)
    const bytes = new DataView(new ArrayBuffer(part.length * 2))
    part.forEach((v, k) => bytes.setInt16(k * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true))
    chunks.push(new Uint8Array(bytes.buffer))
  }
  return chunks
}

/**
 * An open microphone feeding an audio graph. Dictation opens one per session; hands-free cooking
 * opens one on the tap and keeps it for every Transcribe stream after that, because on iOS a
 * microphone or AudioContext opened later, without a touch, can stay silent.
 */
export type Mic = {
  /** Receives each block of samples (at `rate`); `undefined` stops listening. */
  listen: (fn: ((samples: Float32Array) => void) | undefined) => void
  rate: number
  /** Whether the microphone is still live (not ended by iOS, not closed). */
  ok: () => boolean
  /** Restarts the audio graph if iOS suspended or interrupted it (another sound, a call). */
  wake: () => void
  close: () => void
}

/** Rejects with a named error when `p` takes longer than `ms` (iOS can leave a resume pending forever). */
function within<T>(p: Promise<T>, ms: number, name: string, message: string) {
  return new Promise<T>((ok, fail) => {
    const t = setTimeout(() => { const e = new Error(message); e.name = name; fail(e) }, ms)
    p.then((v) => { clearTimeout(t); ok(v) }, (e) => { clearTimeout(t); fail(e) })
  })
}

export async function openMic(): Promise<Mic> {
  // Created before the first await, while the tap still counts as a user gesture (iOS requires it).
  const ctx = new AudioContext()
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  } catch (err) {
    ctx.close().catch(() => {})
    throw err
  }
  let wake: WakeLockSentinel | undefined
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    stream.getTracks().forEach((t) => t.stop())
    ctx.close().catch(() => {})
    wake?.release().catch(() => {})
  }

  try {
    await within(ctx.resume(), 4000, 'AudioBlockedError', 'AudioContext nu a pornit (fără atingere pe ecran?)')
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    await ctx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
  } catch (err) {
    close()
    throw err
  }
  // Keep the screen on while talking: iOS stops the mic when the phone locks.
  navigator.wakeLock?.request('screen').then((w) => { wake = w }).catch(() => {})

  let fn: ((samples: Float32Array) => void) | undefined
  const source = ctx.createMediaStreamSource(stream)
  const tap = new AudioWorkletNode(ctx, 'kt-tap')
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => { if (!closed) fn?.(e.data) }
  source.connect(tap)
  // Some browsers only pull audio through nodes that reach the output; keep it silent.
  const mute = ctx.createGain()
  mute.gain.value = 0
  tap.connect(mute).connect(ctx.destination)

  const wakeUp = () => { if (!closed && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {}) }
  // iOS puts the context in "interrupted" when something else takes the audio (the phone's own
  // voice reading a step can be enough); start it again as soon as it lets us.
  ctx.onstatechange = wakeUp
  return {
    listen: (f) => { fn = f },
    rate: ctx.sampleRate,
    ok: () => !closed && ctx.state !== 'closed' && stream.getAudioTracks().some((t) => t.readyState === 'live'),
    wake: wakeUp,
    close,
  }
}

/**
 * Streams the microphone to Amazon Transcribe until `stop()`. With `shared`, uses that open
 * microphone and leaves it open at the end; otherwise opens one and closes it.
 */
export async function startDictation(h: DictationHandlers, shared?: Mic): Promise<Dictation> {
  const mic = shared ?? await openMic()
  const own = !shared
  mic.wake()

  // Audio chunks waiting to be sent; `null` marks the end of speech.
  const queue: (Uint8Array | null)[] = []
  let wakeUp: (() => void) | undefined
  const push = (c: Uint8Array | null) => { queue.push(c); wakeUp?.() }
  let stopped = false
  let early: Error | undefined
  const failEarly = (e: Error) => { early = e; stop() }
  const stop = () => {
    if (stopped) return
    stopped = true
    mic.listen(undefined)
    push(null)
    if (own) mic.close()
  }

  const carry = { buf: [] as number[] }
  let heard = false
  mic.listen((samples) => {
    if (stopped) return
    heard = true
    let peak = 0
    for (const v of samples) peak = Math.max(peak, Math.abs(v))
    h.onLevel?.(Math.min(1, peak * 3))
    // Silence instead of what the phone is saying itself: the stream stays open, nothing is heard.
    const send = h.muted?.() ? new Float32Array(samples.length) : samples
    for (const c of toPcm16(send, mic.rate, carry)) push(c)
  })
  // No samples at all after a couple of seconds: the microphone is held by something else (a call,
  // another app) or the audio thread never started. Say so instead of waiting for a timeout.
  const noAudio = setTimeout(() => {
    if (heard || stopped) return
    const e = new Error('Microfonul nu a trimis niciun sunet în 3 secunde'); e.name = 'NoAudioError'
    failEarly(e)
  }, 3000)

  async function* audio() {
    for (;;) {
      while (!queue.length) await new Promise<void>((r) => { wakeUp = r })
      wakeUp = undefined
      const c = queue.shift()!
      if (c === null) return
      yield { AudioEvent: { AudioChunk: c } }
    }
  }

  ;(async () => {
    const segments: string[] = []
    try {
      const { TranscribeStreamingClient, StartStreamTranscriptionCommand } = await import('@aws-sdk/client-transcribe-streaming')
      const client = new TranscribeStreamingClient({
        region: outputs.auth.aws_region,
        // The SDK gives the WebSocket only 3 s to open and then retries with the same audio stream,
        // half used already, which can only fail. On a phone the connection (port 8443) can take
        // longer than that, so: more time to open, and no retries (a new tap starts over cleanly).
        requestHandler: { connectionTimeout: 15_000 },
        maxAttempts: 1,
        credentials: async () => {
          const c = (await fetchAuthSession()).credentials
          if (!c) throw new Error('Nu ești conectat.')
          return c
        },
      })
      const res = await client.send(new StartStreamTranscriptionCommand({
        LanguageCode: 'ro-RO',
        MediaEncoding: 'pcm',
        MediaSampleRateHertz: RATE,
        AudioStream: audio(),
      }))
      for await (const ev of res.TranscriptResultStream ?? []) {
        for (const r of ev.TranscriptEvent?.Transcript?.Results ?? []) {
          const said = r.Alternatives?.[0]?.Transcript?.trim() ?? ''
          if (!said) continue
          if (r.IsPartial) h.onText([...segments], said)
          else { segments.push(said); h.onText([...segments], '') }
        }
      }
      h.onText([...segments], '')
      h.onEnd(early)
    } catch (err) {
      h.onText([...segments], '')
      h.onEnd(early ?? (err as Error))
    } finally {
      clearTimeout(noAudio)
      stopped = true
      mic.listen(undefined)
      if (own) mic.close()
    }
  })()

  return { stop }
}
