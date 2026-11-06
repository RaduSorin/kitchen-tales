/**
 * The sign-in screen's scene (design "Seară de lux", login concept 4): the app icon floating in a
 * soft gold glow with a few stars, the name under it. The form itself is Amplify's, styled in
 * stories-a.css as a dark sheet rising from the bottom.
 */
export function AuthHeader() {
  return (
    <div className="auth-scene">
      <svg className="auth-stars" viewBox="0 0 100 100" aria-hidden="true">
        {Array.from({ length: 16 }, (_, i) => (
          <circle key={i} cx={(i * 37 + 11) % 100} cy={((i * 53 + 7) % 60) + 4} r={(i % 3) * 0.35 + 0.6} fill="#fff" opacity={0.35 + (i % 3) * 0.2} />
        ))}
      </svg>
      <img className="auth-icon" src="/icon.svg" alt="" width={112} height={112} />
      <h1 className="auth-brand">Bucătăria cu povești</h1>
      <p className="auth-tagline">Rețete și povești pentru acasă</p>
    </div>
  )
}

export function AuthFooter() {
  return <p className="auth-note">Doar cu invitație. Cere-i lui Sorin un cont.</p>
}
