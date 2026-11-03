import { fetchAuthSession } from 'aws-amplify/auth'
import outputs from '../../amplify_outputs.json'

// Live Romanian dictation: microphone -> 16 kHz PCM -> Amazon Transcribe streaming (WebSocket).
// The Transcribe SDK is loaded only when the mic is first used, to keep the app bundle small.

const RATE = 16_000
const CHUNK_SAMPLES = RATE / 10 // ~100 ms of audio per message

export type DictationHandlers = {
  /** Called on every update: `final` is the settled text so far, `partial` the words still being recognised. */
  onText: (final: string, partial: string) => void
  /** Microphone loudness, 0..1, for the button animation. */
  onLevel?: (level: number) => void
  /** Called once when the session ends; `error` is set when it ended on a failure. */
  onEnd: (error?: Error) => void
}

export type Dictation = { stop: () => void }

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

export async function startDictation(h: DictationHandlers): Promise<Dictation> {
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
  const cleanup = () => {
    stream.getTracks().forEach((t) => t.stop())
    ctx.close().catch(() => {})
    wake?.release().catch(() => {})
  }

  try {
    await ctx.resume()
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    await ctx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
  } catch (err) {
    cleanup()
    throw err
  }
  // Keep the screen on while talking: iOS stops the mic when the phone locks.
  navigator.wakeLock?.request('screen').then((w) => { wake = w }).catch(() => {})

  // Audio chunks waiting to be sent; `null` marks the end of speech.
  const queue: (Uint8Array | null)[] = []
  let wakeUp: (() => void) | undefined
  const push = (c: Uint8Array | null) => { queue.push(c); wakeUp?.() }
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    push(null)
    stream.getTracks().forEach((t) => t.stop())
  }

  const source = ctx.createMediaStreamSource(stream)
  const tap = new AudioWorkletNode(ctx, 'kt-tap')
  const carry = { buf: [] as number[] }
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
    if (stopped) return
    let peak = 0
    for (const v of e.data) peak = Math.max(peak, Math.abs(v))
    h.onLevel?.(Math.min(1, peak * 3))
    for (const c of toPcm16(e.data, ctx.sampleRate, carry)) push(c)
  }
  source.connect(tap)
  // Some browsers only pull audio through nodes that reach the output; keep it silent.
  const mute = ctx.createGain()
  mute.gain.value = 0
  tap.connect(mute).connect(ctx.destination)

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
    let final = ''
    try {
      const { TranscribeStreamingClient, StartStreamTranscriptionCommand } = await import('@aws-sdk/client-transcribe-streaming')
      const client = new TranscribeStreamingClient({
        region: outputs.auth.aws_region,
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
          if (r.IsPartial) h.onText(final, said)
          else { final = final ? `${final} ${said}` : said; h.onText(final, '') }
        }
      }
      h.onText(final, '')
      h.onEnd()
    } catch (err) {
      h.onText(final, '')
      h.onEnd(err as Error)
    } finally {
      stopped = true
      cleanup()
    }
  })()

  return { stop }
}
