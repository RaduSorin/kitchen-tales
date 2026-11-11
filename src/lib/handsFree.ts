// Hands-free cooking: the phone reads each step aloud and listens for a few Romanian commands
// ("următorul", "înapoi", "repetă", "pornește timerul"…), so wet or floury hands never touch the
// screen. Listening goes through the same Amazon Transcribe streaming as the dictation button;
// speaking uses the phone's own Romanian voice.
import { useEffect, useRef, useState } from 'react'
import { dictationError, openMic, startDictation, type Dictation, type Mic } from './dictation'

export type Command =
  | { kind: 'next' } | { kind: 'prev' } | { kind: 'repeat' } | { kind: 'ingredients' }
  | { kind: 'timer' } | { kind: 'pause' } | { kind: 'step'; n: number } | { kind: 'stop' }

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

const NUMBERS: Record<string, number> = {
  unu: 1, unul: 1, primul: 1, doi: 2, doilea: 2, trei: 3, treilea: 3, patru: 4, patrulea: 4, cinci: 5, cincilea: 5,
  sase: 6, saselea: 6, sapte: 7, saptelea: 7, opt: 8, optulea: 8, noua: 9, noualea: 9, zece: 10, zecelea: 10,
  unsprezece: 11, doisprezece: 12, treisprezece: 13, paisprezece: 14, cincisprezece: 15,
}

/** The command in a phrase, or undefined. The last command said wins ("nu, înapoi"). */
export function parseCommand(said: string): Command | undefined {
  const t = ` ${plain(said)} `
  const step = t.match(/ pasul (?:al )?(\d+|[a-z]+) /)
  if (step) {
    const n = /^\d+$/.test(step[1]) ? +step[1] : NUMBERS[step[1].replace(/^(al|a) /, '')]
    if (n) return { kind: 'step', n }
  }
  const rules: [Command['kind'], RegExp][] = [
    ['stop', / (nu mai asculta|opreste ascultarea|gata cu vocea|stop ascultare) /],
    ['pause', / (opreste|pauza|stop) (timerul|cronometrul|alarma)? ?/],
    ['timer', / (porneste|start|da drumul la|pune) (timerul|cronometrul|alarma|minutarul)? ?|^ (timerul|timer|cronometrul|minutarul) $| continua (timerul|cronometrul|minutarul) /],
    ['ingredients', / (ingredientele|ingrediente|ce ingrediente|ce imi trebuie) /],
    ['repeat', / (repeta|din nou|inca o data|ce ai zis|citeste) /],
    ['prev', / (inapoi|anterior|pasul anterior|precedent) /],
    ['next', / (urmatorul|urmatoru|urmatorul pas|pasul urmator|urmatoarea|mai departe|inainte|continua|continuam|hai mai departe|next|am terminat|gata) /],
  ]
  let best: { kind: Command['kind']; at: number } | undefined
  for (const [kind, re] of rules) {
    const g = new RegExp(re.source, 'g')
    for (const m of t.matchAll(g)) if (!best || m.index! > best.at) best = { kind, at: m.index! }
  }
  return best ? ({ kind: best.kind } as Command) : undefined
}

let voice: SpeechSynthesisVoice | undefined | null
function romanianVoice() {
  if (voice !== undefined && voice !== null) return voice
  voice = window.speechSynthesis?.getVoices().find((v) => v.lang.toLowerCase().startsWith('ro')) ?? null
  return voice ?? undefined
}

/** Whether the phone can read aloud in Romanian. */
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window

/** Reads `text` aloud with the phone's Romanian voice; resolves when it is done. */
export function speak(text: string) {
  return new Promise<void>((done) => {
    try {
      const synth = window.speechSynthesis
      if (!synth || !text.trim()) { done(); return }
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'ro-RO'
      u.rate = 0.95
      const v = romanianVoice()
      if (v) u.voice = v
      let poll: ReturnType<typeof setInterval> | undefined
      const finish = () => { clearInterval(poll); clearTimeout(guess); done() }
      u.onend = finish
      u.onerror = finish
      synth.speak(u)
      // Safari sometimes never fires onend (often once the microphone is on): watch the voice itself,
      // and as a last resort give up after a generous guess.
      const guess = setTimeout(finish, 2000 + text.length * 90)
      setTimeout(() => { poll = setInterval(() => { if (!synth.speaking && !synth.pending) finish() }, 250) }, 800)
    } catch { done() }
  })
}

export const stopSpeaking = () => { try { window.speechSynthesis?.cancel() } catch { /* nothing to stop */ } }

export type HandsFreeState = { listening: boolean; heard: string; error: string; detail?: string }

/** Commands safe to act on before the phrase is finished: nothing longer starts with them. */
const QUICK = new Set<Command['kind']>(['next', 'prev', 'repeat', 'ingredients'])

/**
 * Hands-free listening. `start()` must be called straight from a tap: it opens the microphone
 * there and keeps it for the whole session (on iOS one opened later, without a touch, stays
 * silent). Calls `onCommand` for each command heard; while `speaking()` the phone hears silence
 * instead of its own voice. A dropped connection restarts by itself a few times; after that, a
 * new `start()` (another tap) starts over.
 */
export function useHandsFree(onCommand: (c: Command) => void, speaking: () => boolean) {
  const [state, setState] = useState<HandsFreeState>({ listening: false, heard: '', error: '' })
  const cmd = useRef(onCommand)
  const busy = useRef(speaking)
  useEffect(() => { cmd.current = onCommand; busy.current = speaking })
  const run = useRef<() => void>(undefined)

  const stop = () => {
    run.current?.()
    run.current = undefined
    setState({ listening: false, heard: '', error: '' })
  }

  const start = () => {
    run.current?.()
    let cancelled = false
    let mic: Mic | undefined
    let session: Dictation | undefined
    let failures = 0
    let restart: ReturnType<typeof setTimeout> | undefined
    const giveUp = (err: unknown) => {
      const w = dictationError(err)
      console.error('Mâini libere:', err)
      // Let go of the microphone until the next tap opens it again.
      mic?.close(); mic = undefined
      setState({ listening: false, heard: '', error: w.text, detail: w.detail })
    }
    const again = (err: unknown) => {
      failures++
      if (failures >= 3) { giveUp(err); return }
      restart = setTimeout(begin, 800)
    }
    // Everything up to the first await runs inside the tap.
    const begin = async () => {
      let used = 0
      let firedFor = -1
      try {
        if (!mic?.ok()) { mic?.close(); mic = undefined; mic = await openMic() }
        if (cancelled) { mic.close(); return }
        session = await startDictation({
          muted: () => busy.current(),
          onText: (segments, partial) => {
            if (cancelled) return
            if (segments.length || partial) failures = 0 // it hears: a later drop starts the count over
            for (; used < segments.length; used++) {
              const said = segments[used]
              if (busy.current() || firedFor === used) continue
              setState((s) => ({ ...s, heard: said }))
              const c = parseCommand(said)
              if (c) cmd.current(c)
            }
            // Act on a clear command while it is still being said, without waiting for the pause.
            if (partial && !busy.current()) {
              setState((s) => ({ ...s, heard: partial }))
              const c = firedFor === segments.length ? undefined : parseCommand(partial)
              if (c && QUICK.has(c.kind)) { firedFor = segments.length; cmd.current(c) }
            }
          },
          onEnd: (err) => {
            session = undefined
            if (cancelled) return
            if (!err) { failures = 0; restart = setTimeout(begin, 300); return }
            console.warn('Mâini libere, reiau:', err)
            again(err)
          },
        }, mic)
        if (cancelled) { session.stop(); return }
        setState({ listening: true, heard: '', error: '' })
      } catch (err) {
        if (cancelled) return
        const name = (err as Error)?.name
        if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'NotFoundError') giveUp(err)
        else again(err)
      }
    }
    setState({ listening: false, heard: '', error: '' })
    begin()
    run.current = () => { cancelled = true; clearTimeout(restart); session?.stop(); mic?.close() }
  }

  useEffect(() => () => run.current?.(), [])
  return { ...state, start, stop }
}

/** "10 minute", "1 minut și 30 de secunde", "45 de secunde": a timer as it is said aloud. */
export function spokenDuration(sec: number) {
  const n = (k: number, one: string, many: string) => (k === 1 ? `1 ${one}` : `${k}${k % 100 >= 20 || k % 100 === 0 ? ' de' : ''} ${many}`)
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  return [h && n(h, 'oră', 'ore'), m && n(m, 'minut', 'minute'), s && n(s, 'secundă', 'secunde')].filter(Boolean).join(' și ') || '0 secunde'
}
