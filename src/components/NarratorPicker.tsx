import { useEffect, useRef, useState } from 'react'
import { narratorVoices, previewVoice, type NarratorVoice } from '../lib/db'
import { errorText } from '../lib/errors'
import type { Narrator } from '../lib/settings'

// Samples already heard in this session, so playing one again costs no ElevenLabs credits.
const samples = new Map<string, string>()

/**
 * Pick who reads a story: a voice from the family's ElevenLabs account (with a short Romanian
 * sample for each) or Polly (Carmen). Used in Profil > Vocea poveștilor, on the new story page and
 * when reading an existing story again.
 */
export default function NarratorPicker({ value: narrator, onChange, compact }: { value: Narrator; onChange: (v: Narrator) => void; compact?: boolean }) {
  const [voices, setVoices] = useState<NarratorVoice[]>()
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState<string>()
  const [loading, setLoading] = useState<string>()
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    narratorVoices().then(setVoices).catch((err) => { setVoices([]); setError(errorText(err)) })
    return () => { audio.current?.pause() }
  }, [])

  const play = async (id: string) => {
    audio.current?.pause()
    if (playing === id) { setPlaying(undefined); return }
    setError('')
    try {
      let url = samples.get(id)
      if (!url) { setLoading(id); url = await previewVoice(id); samples.set(id, url) }
      const a = new Audio(url)
      audio.current = a
      a.onended = () => setPlaying((p) => (p === id ? undefined : p))
      setPlaying(id)
      await a.play()
    } catch (err) {
      setPlaying(undefined)
      setError(`Nu am putut citi mostra: ${errorText(err)}`)
    } finally {
      setLoading(undefined)
    }
  }

  const pick = (v?: NarratorVoice) => onChange(v ? { id: v.id, name: v.name } : { id: '', name: '' })
  const about = (v: NarratorVoice) => [v.romanian ? 'română' : v.accent, v.gender === 'female' ? 'feminină' : v.gender === 'male' ? 'masculină' : v.gender, v.description].filter(Boolean).join(' · ')
  const ro = voices?.filter((v) => v.romanian) ?? []
  const other = voices?.filter((v) => !v.romanian) ?? []

  const row = (v: NarratorVoice) => (
    <div className="set-row voice-row" key={v.id}>
      <button type="button" className="voice-pick" role="radio" aria-checked={narrator.id === v.id} onClick={() => pick(v)}>
        <span className="voice-check" aria-hidden="true">{narrator.id === v.id ? '✓' : ''}</span>
        <span>{v.name}{about(v) && <small className="set-sub">{about(v)}</small>}</span>
      </button>
      <button type="button" className="btn small voice-play" aria-label={`Ascultă vocea ${v.name}`} onClick={() => play(v.id)} disabled={!!loading && loading !== v.id}>
        {loading === v.id ? '…' : playing === v.id ? 'Stop' : 'Ascultă'}
      </button>
    </div>
  )

  return (
    <>
      <div className="set-group">
        <div className="set-box" role="radiogroup" aria-label="Vocea poveștilor">
          <div className="set-row voice-row">
            <button type="button" className="voice-pick" role="radio" aria-checked={!narrator.id} onClick={() => pick()}>
              <span className="voice-check" aria-hidden="true">{narrator.id ? '' : '✓'}</span>
              <span>Carmen (Amazon Polly)<small className="set-sub">vocea de până acum, gratuită</small></span>
            </button>
          </div>
        </div>
        {!compact && <p className="set-hint">Dacă ElevenLabs nu răspunde sau se termină creditele, poveștile noi se citesc tot cu Carmen.</p>}
      </div>

      <div className="set-group">
        <h2 className="set-label">Voci în română (ElevenLabs)</h2>
        <div className="set-box">
          {!voices && <div className="set-row"><span className="muted">Se încarcă vocile…</span></div>}
          {voices && !ro.length && <div className="set-row"><span className="muted">Nicio voce românească în cont încă.</span></div>}
          {ro.map(row)}
        </div>
        {!compact && <p className="set-hint">Pe elevenlabs.io, în Voice Library, filtrează după limba română și apasă „Add to my voices” la cele care îți plac. Apar aici imediat.</p>}
      </div>

      {other.length > 0 && (
        <div className="set-group">
          <h2 className="set-label">Alte voci (citesc și în română)</h2>
          <div className="set-box">{other.map(row)}</div>
        </div>
      )}
      {error && <p className="set-hint error">{error}</p>}
      {!compact && <p className="set-hint">Fiecare mostră și fiecare poveste nouă consumă credite ElevenLabs (cam un credit pe literă). O poveste deja salvată o poți reciti cu altă voce din meniul ⋯ al poveștii.</p>}
    </>
  )
}
