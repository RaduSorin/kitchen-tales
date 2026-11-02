import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listStories } from '../lib/db'
import type { Story } from '../lib/types'

export default function StoryList() {
  const [stories, setStories] = useState<Story[]>([])
  useEffect(() => { listStories().then(setStories) }, [])
  return (
    <section className="stories">
      <div className="row between">
        <h1>Povești</h1>
        <Link to="/povesti/adauga" className="btn primary">+ Adaugă</Link>
      </div>
      {stories.length === 0 ? (
        <p className="empty">Nicio poveste încă. Încarcă un MP3 sau înregistrează una cu vocea ta!</p>
      ) : (
        <div className="story-grid">
          {stories.map((s) => (
            <Link key={s.id} to={`/povesti/${s.id}`} className="story-tile">
              <span className="story-emoji">{s.emoji}</span>
              <span className="story-title">{s.title}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
