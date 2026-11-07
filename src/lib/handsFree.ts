// Hands-free cooking: the phone reads each step aloud and listens for a few Romanian commands
// ("următorul", "înapoi", "repetă", "pornește timerul"…), so wet or floury hands never touch the
// screen. Listening goes through the same Amazon Transcribe streaming as the dictation button;
// speaking uses the phone's own Romanian voice.
import { useEffect, useRef, useState } from 'react'
import { startDictation, type Dictation } from './dictation'

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
    ['timer', / (porneste|start|da drumul la|pune) (timerul|cronometrul|alarma|minutarul)? ?|^ (timerul|timer|cronometrul|minutarul) $/],
    ['ingredients', / (ingredientele|ingrediente|ce ingrediente|ce imi trebuie) /],
    ['repeat', / (repeta|din nou|inca o data|ce ai zis|citeste) /],
    ['prev', / (inapoi|anterior|pasul anterior|precedent) /],
    ['next', / (urmatorul|urmatorul pas|mai departe|inainte|next|am terminat|gata) /],
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
      u.onend = () => done()
      u.onerror = () => done()
      synth.speak(u)
      // Safari sometimes never fires onend: give up after a generous guess.
      setTimeout(done, 2000 + text.length * 90)
    } catch { done() }
  })
}

export const stopSpeaking = () => { try { window.speechSynthesis?.cancel() } catch { /* nothing to stop */ } }

export type HandsFreeState = { listening: boolean; heard: string; error: string }

/**
 * While `on`, listens and calls `onCommand` for each command heard. What is said while the phone
 * itself is speaking is ignored (it would hear its own voice). Restarts by itself after a dropped
 * connection, a few times; a new `attempt` starts over after it gave up.
 */
export function useHandsFree(on: boolean, attempt: number, onCommand: (c: Command) => void, speaking: () => boolean): HandsFreeState {
  const [state, setState] = useState<HandsFreeState>({ listening: false, heard: '', error: '' })
  const cmd = useRef(onCommand)
  const busy = useRef(speaking)
  useEffect(() => { cmd.current = onCommand; busy.current = speaking })

  useEffect(() => {
    if (!on) { setState({ listening: false, heard: '', error: '' }); return }
    let session: Dictation | undefined
    let cancelled = false
    let failures = 0
    let restart: ReturnType<typeof setTimeout> | undefined
    const begin = async () => {
      let used = 0
      try {
        session = await startDictation({
          onText: (segments) => {
            for (; used < segments.length; used++) {
              const said = segments[used]
              if (busy.current()) continue
              setState((s) => ({ ...s, heard: said }))
              const c = parseCommand(said)
              if (c) cmd.current(c)
            }
          },
          onEnd: (err) => {
            session = undefined
            if (cancelled) return
            failures = err ? failures + 1 : 0
            if (failures >= 3) { setState({ listening: false, heard: '', error: 'Nu te mai aud. Apasă din nou pe microfon.' }); return }
            restart = setTimeout(begin, 800)
          },
        })
        if (cancelled) { session.stop(); return }
        setState({ listening: true, heard: '', error: '' })
      } catch (err) {
        const e = err as Error
        setState({ listening: false, heard: '', error: e?.name === 'NotAllowedError' ? 'Am nevoie de microfon. Permite-l din setările telefonului.' : 'Nu pot porni microfonul.' })
      }
    }
    begin()
    return () => { cancelled = true; clearTimeout(restart); session?.stop() }
  }, [on, attempt])
  return state
}

/** "10 minute", "1 minut și 30 de secunde", "45 de secunde": a timer as it is said aloud. */
export function spokenDuration(sec: number) {
  const n = (k: number, one: string, many: string) => (k === 1 ? `1 ${one}` : `${k}${k % 100 >= 20 || k % 100 === 0 ? ' de' : ''} ${many}`)
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  return [h && n(h, 'oră', 'ore'), m && n(m, 'minut', 'minute'), s && n(s, 'secundă', 'secunde')].filter(Boolean).join(' și ') || '0 secunde'
}
