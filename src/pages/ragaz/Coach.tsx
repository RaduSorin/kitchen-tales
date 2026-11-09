import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Sheet from '../../components/Sheet'
import { Loading } from '../../components/LoadState'
import { showToast } from '../../lib/toast'
import {
  chat, contextText, getChat, getNote, getSettings, IMPORT_PROMPT, noteFromImport, parseImport, proposeMemory, saveChat, saveNote, saveSettings,
  type ChatMessage, type CoachSettings, type ContextLevel, type ImportSection,
} from '../../lib/mind/coach'
import '../../ragaz.css'

const LEVELS: [ContextLevel, string][] = [['chat', 'Doar conversația'], ['intention', '+ intenția lunii'], ['month', '+ cifrele lunii']]

/** "Ce știe Claude despre mine": a note the person sees and edits; it goes with every message. */
function NoteSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState<string>()
  useEffect(() => { getNote().then(setText) }, [])
  return (
    <Sheet title="Ce știe Claude despre mine" onClose={onClose}>
      <div className="settings rg-form">
        <p className="set-hint">Notița pleacă la Claude cu fiecare mesaj, ca să nu o iei de la capăt. Scrie doar ce vrei să știe. Stă criptată pe telefon.</p>
        {text === undefined ? <Loading /> : <textarea className="cs-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: Lucrez mult de acasă. Mă ajută plimbările scurte. Prefer întrebări simple, nu liste." />}
        <button type="button" className="btn primary" onClick={() => saveNote(text ?? '').then(() => { showToast('Notița e salvată.'); onClose() })}>Salvează</button>
      </div>
    </Sheet>
  )
}

/** Brings context from an existing claude.ai chat: a question to copy there, then its answer pasted here. */
/** `stay`: keep the person where they are (the setup's last card) instead of opening the planner with the intention. */
export function ImportSheet({ onClose, stay }: { onClose: () => void; stay?: boolean }) {
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [parts, setParts] = useState<Partial<Record<ImportSection, string>>>()
  const copy = () => navigator.clipboard?.writeText(IMPORT_PROMPT).then(() => showToast('Întrebarea e copiată. Lipește-o în chatul tău din claude.ai.'), () => showToast('Nu am putut copia.'))
  const save = async () => {
    if (!parts) return
    const note = noteFromImport(parts)
    if (note) {
      const old = await getNote()
      await saveNote(old ? `${old}\n\n${note}` : note)
    }
    showToast('Am pus rezumatul în notiță.')
    onClose()
    if (parts['Intenția'] && !stay) nav(`/ragaz/planifica?intentie=${encodeURIComponent(parts['Intenția'])}`)
  }
  return (
    <Sheet title="Importă din claude.ai" onClose={onClose}>
      <div className="settings rg-form">
        {!parts ? (
          <>
            <p className="set-hint">1. Copiază întrebarea și lipește-o în conversația ta din claude.ai. 2. Copiază răspunsul lui Claude și lipește-l aici. Vezi și poți schimba tot înainte să se salveze.</p>
            <button type="button" className="btn" onClick={copy}>Copiază întrebarea</button>
            <textarea className="cs-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Lipește aici răspunsul din claude.ai" />
            <button type="button" className="btn primary" disabled={!text.trim()} onClick={() => setParts(parseImport(text))}>Mai departe</button>
          </>
        ) : (
          <>
            {(Object.keys(parts) as ImportSection[]).map((k) => (
              <label className="night-field" key={k}>{k}{k === 'Intenția' && <small> (o folosești la planificarea lunii)</small>}
                <textarea className="cs-text" rows={3} value={parts[k]} onChange={(e) => setParts({ ...parts, [k]: e.target.value })} />
              </label>
            ))}
            <button type="button" className="btn primary" onClick={save}>Salvează</button>
          </>
        )}
      </div>
    </Sheet>
  )
}

/** /ragaz/claude: the optional chat. */
export default function Coach() {
  const [settings, setSettings] = useState<CoachSettings>()
  const [list, setList] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState('')
  const [sheet, setSheet] = useState<'note' | 'import' | 'clear'>()
  const [memory, setMemory] = useState<string>()
  const [preview, setPreview] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { Promise.all([getSettings(), getChat()]).then(([s, c]) => { setSettings(s); setList(c) }, (e: Error) => showToast(e.message)) }, [])
  useEffect(() => { if (settings) contextText(settings.level).then(setPreview).catch(() => {}) }, [settings])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [list.length, busy])
  if (!settings) return <Loading />

  const set = (s: CoachSettings) => { setSettings(s); saveSettings(s).catch(() => {}) }
  if (!settings.consent) {
    return (
      <section className="ragaz rg-page">
        <div className="rg-head"><div><span className="cs-kicker">Răgaz</span><h1>Vorbește cu Claude</h1></div></div>
        <ul className="rg-facts">
          <li><b>Opțional.</b> Restul Răgaz merge la fel și fără Claude.</li>
          <li><b>Ce pleacă:</b> mesajul tău, ultimele mesaje din conversație, notița „Ce știe Claude despre mine” și, dacă alegi, intenția lunii. Jurnalul nu pleacă niciodată.</li>
          <li><b>Unde:</b> Claude pe Amazon Bedrock, în Europa. Serverul nostru nu păstrează nimic din conversație; ea rămâne criptată pe acest telefon.</li>
          <li><b>Limită:</b> 200 de mesaje pe lună.</li>
        </ul>
        <div className="rg-warn">Claude nu e terapeut. Dacă îți e foarte greu, vorbește cu cineva apropiat sau cu un specialist; în pericol, sună la 112.</div>
        <button type="button" className="moon-btn rg-wide" onClick={() => set({ ...settings, consent: true })}>Am înțeles, pornește chatul</button>
      </section>
    )
  }

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    const t = text.trim()
    if (!t || busy) return
    const next = [...list, { role: 'user' as const, text: t, at: Date.now() }]
    setList(next)
    setText('')
    setBusy('send')
    try {
      const answer = await chat(next, settings.level)
      const withAnswer = [...next, { role: 'assistant' as const, text: answer, at: Date.now() }]
      setList(withAnswer)
      await saveChat(withAnswer)
    } catch (err) {
      showToast((err as Error).message)
      setText(t)
      setList(list)
    } finally {
      setBusy('')
    }
  }
  const finish = () => {
    setBusy('remember')
    proposeMemory(list).then((m) => { if (m) setMemory(m); else showToast('Nimic nou de adăugat în notiță.') }, (e: Error) => showToast(e.message)).finally(() => setBusy(''))
  }

  return (
    <section className="ragaz rg-page rg-chat">
      <div className="rg-head">
        <div><span className="cs-kicker">Răgaz</span><h1>Claude</h1></div>
        <button type="button" className="btn small" onClick={() => setSheet('note')}>Ce știe despre mine</button>
      </div>
      <div className="night-field">
        <span>Claude mai primește</span>
        <div className="pills" role="radiogroup" aria-label="Ce mai primește Claude">
          {LEVELS.map(([k, l]) => <button type="button" key={k} aria-pressed={settings.level === k} onClick={() => set({ ...settings, level: k })}>{l}</button>)}
        </div>
        {preview && <small className="rg-preview">{preview}</small>}
      </div>

      <div className="rg-msgs">
        {!list.length && (
          <div className="rg-empty">
            <p>Spune-i ce ai pe suflet sau la ce lucrezi luna asta. Dacă ai deja o conversație despre asta în claude.ai, o poți aduce aici.</p>
            <button type="button" className="btn small" onClick={() => setSheet('import')}>Importă din claude.ai</button>
          </div>
        )}
        {list.map((m, i) => <div key={i} className={`rg-msg ${m.role}`}>{m.text}</div>)}
        {busy === 'send' && <div className="rg-msg assistant rg-typing" aria-label="Claude scrie">…</div>}
        <div ref={end} />
      </div>

      <form className="rg-compose" onSubmit={send}>
        <textarea rows={2} value={text} maxLength={4000} aria-label="Mesajul tău" onChange={(e) => setText(e.target.value)} placeholder="Scrie…"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }} />
        <button type="submit" className="moon-btn rg-small" disabled={!text.trim() || !!busy}>Trimite</button>
      </form>
      {list.length > 1 && (
        <div className="rg-row-btns">
          <button type="button" className="btn small" disabled={!!busy} onClick={finish}>{busy === 'remember' ? '…' : 'Încheie și ține minte'}</button>
          <button type="button" className="btn small" onClick={() => setSheet('import')}>Importă</button>
          <button type="button" className="btn danger small" onClick={() => setSheet('clear')}>Șterge conversația</button>
        </div>
      )}

      {sheet === 'note' && <NoteSheet onClose={() => setSheet(undefined)} />}
      {sheet === 'import' && <ImportSheet onClose={() => setSheet(undefined)} />}
      {sheet === 'clear' && (
        <Sheet title="Ștergi conversația?" onClose={() => setSheet(undefined)}>
          <div className="settings rg-form">
            <p className="set-hint">Notița „Ce știe Claude despre mine” rămâne. Dacă vrei să păstrezi ceva din conversație, folosește întâi „Încheie și ține minte”.</p>
            <button type="button" className="btn danger" onClick={() => saveChat([]).then(() => { setList([]); setSheet(undefined) })}>Da, șterge</button>
          </div>
        </Sheet>
      )}
      {memory !== undefined && (
        <Sheet title="Să țin minte?" onClose={() => setMemory(undefined)}>
          <div className="settings rg-form">
            <p className="set-hint">Claude propune să adauge asta în notiță. Schimbă sau șterge ce nu vrei.</p>
            <textarea className="cs-text" rows={6} value={memory} onChange={(e) => setMemory(e.target.value)} />
            <button type="button" className="btn primary" onClick={async () => {
              const old = await getNote()
              await saveNote(old ? `${old}\n${memory}` : memory)
              setMemory(undefined)
              showToast('Am adăugat în notiță.')
            }}>Adaugă în notiță</button>
          </div>
        </Sheet>
      )}
    </section>
  )
}
