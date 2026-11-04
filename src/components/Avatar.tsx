import { initialOf, loadMyName, useMyName } from '../lib/me'
import { useEffect } from 'react'

/** The signed-in person's initial in a round badge (Profile tab, Profile page). */
export default function Avatar({ size = 26 }: { size?: number }) {
  const name = useMyName()
  useEffect(() => { loadMyName() }, [])
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.46 }} aria-hidden="true">{initialOf(name)}</span>
}
