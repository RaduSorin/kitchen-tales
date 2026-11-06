// Small gold line drawings with a touch of colour for the ways to add a story or a recipe
// (design "Desene mici"). Fixed SVG markup, drawn in a 0-100 box.
export type AddArtKind = 'create' | 'record' | 'upload' | 'pen' | 'link' | 'cam' | 'fridge' | 'gen' | 'text'

const G = '#f2c879', L = '#ffe3a3'
const ART: Record<AddArtKind, string> = {
 create:`<circle cx="70" cy="28" r="20" fill="${G}" opacity=".18"/><path d="M18 72q16-10 32 0q16-10 32 0V40q-16-10-32 0q-16-10-32 0z" fill="#2a2244" stroke="${G}" stroke-width="2.4" stroke-linejoin="round"/><path d="M50 40v32" stroke="${G}" stroke-width="2.4"/><path d="M66 14l2.5 6.5L75 23l-6.5 2.5L66 32l-2.5-6.5L57 23l6.5-2.5z" fill="${L}"/><path d="M38 20l1.5 4L44 25.5l-4.5 1.5L38 31l-1.5-4L32 25.5l4.5-1.5z" fill="${L}" opacity=".8"/><circle cx="82" cy="44" r="1.8" fill="#fff"/><circle cx="26" cy="34" r="1.4" fill="#fff" opacity=".7"/>`,
 record:`<path d="M66 18a16 16 0 1 0 12 28a13 13 0 0 1-12-28z" fill="${G}" opacity=".9"/><rect x="30" y="34" width="18" height="30" rx="9" fill="#3a2440" stroke="${G}" stroke-width="2.4"/><path d="M22 54a17 17 0 0 0 34 0M39 71v10M31 81h16" fill="none" stroke="${G}" stroke-width="2.4" stroke-linecap="round"/><path d="M62 60q4 6 0 12M70 56q7 10 0 20" fill="none" stroke="${L}" stroke-width="2.2" stroke-linecap="round" opacity=".8"/>`,
 upload:`<path d="M28 70a14 14 0 0 1 2-28a20 20 0 0 1 38-4a15 15 0 0 1 4 32z" fill="#1d3442" stroke="${G}" stroke-width="2.4" stroke-linejoin="round"/><path d="M50 64V44M42 52l8-8 8 8" fill="none" stroke="${L}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="80" cy="24" r="1.8" fill="#fff"/><circle cx="20" cy="28" r="1.4" fill="#fff" opacity=".7"/>`,
 pen:`<path d="M20 78h60" stroke="${G}" stroke-width="2" opacity=".5"/><rect x="24" y="22" width="40" height="52" rx="4" fill="#2a2521" stroke="${G}" stroke-width="2.2"/><path d="M32 34h24M32 44h24M32 54h14" stroke="${G}" stroke-width="2" opacity=".7" stroke-linecap="round"/><path d="M58 64l20-20 6 6-20 20h-6z" fill="${L}"/>`,
 link:`<rect x="30" y="14" width="40" height="70" rx="8" fill="#2a2521" stroke="${G}" stroke-width="2.2"/><path d="M44 52a7 7 0 0 0 10 0l5-5a7 7 0 0 0-10-10l-2 2M56 44a7 7 0 0 0-10 0l-5 5a7 7 0 0 0 10 10l2-2" fill="none" stroke="${L}" stroke-width="2.4" stroke-linecap="round"/>`,
 cam:`<path d="M18 36a5 5 0 0 1 5-5h9l4-7h28l4 7h9a5 5 0 0 1 5 5v34a5 5 0 0 1-5 5H23a5 5 0 0 1-5-5z" fill="#2a2521" stroke="${G}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="50" cy="52" r="13" fill="none" stroke="${L}" stroke-width="2.4"/><circle cx="50" cy="52" r="5" fill="${G}" opacity=".6"/>`,
 fridge:`<rect x="30" y="12" width="40" height="76" rx="6" fill="#2a2521" stroke="${G}" stroke-width="2.2"/><path d="M30 40h40M38 22v8M38 48v12" stroke="${G}" stroke-width="2.4" stroke-linecap="round"/><circle cx="78" cy="30" r="6" fill="#e0714f"/><path d="M78 24q2-4 5-4" stroke="#7bbf6a" stroke-width="2" fill="none"/>`,
 gen:`<path d="M26 70h48l-4 10H30z" fill="#2a2521" stroke="${G}" stroke-width="2.2" stroke-linejoin="round"/><path d="M28 70a22 22 0 0 1 44 0" fill="#2a2521" stroke="${G}" stroke-width="2.2"/><path d="M50 14l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="${L}"/><path d="M72 30l1.8 4.5L78 36l-4.2 1.5L72 42l-1.8-4.5L66 36l4.2-1.5z" fill="${L}" opacity=".8"/>`,
 text:`<path d="M24 20h36l14 14v46H24z" fill="#2a2521" stroke="${G}" stroke-width="2.2" stroke-linejoin="round"/><path d="M60 20v14h14" fill="none" stroke="${G}" stroke-width="2.2"/><path d="M32 44h30M32 54h30M32 64h18" stroke="${G}" stroke-width="2" opacity=".7" stroke-linecap="round"/><path d="M66 60q5 5 0 10M72 56q8 9 0 18" fill="none" stroke="${L}" stroke-width="2" stroke-linecap="round"/>`,
}

export default function AddArt({ kind }: { kind: AddArtKind }) {
  // Constant markup from this file only, never user input.
  return <svg className="add-art" viewBox="0 0 100 100" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ART[kind] }} />
}
