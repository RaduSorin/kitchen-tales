// Which shop aisle a shopping line belongs to, from the words in it (Romanian, offline, no AI):
// "2 piepți de pui" → Carne și pește. The aisles come in the order you usually walk a supermarket.

export interface Aisle { key: string; name: string; icon: string }

export const AISLES: Aisle[] = [
  { key: 'produce', name: 'Legume și fructe', icon: 'M12 21c-4.5 0-8-3.6-8-8.2C4 8 7.6 5 12 5s8 3 8 7.8c0 4.6-3.5 8.2-8 8.2zM12 5c0-1.6.6-3 2-4' },
  { key: 'bakery', name: 'Pâine și panificație', icon: 'M4 11a4 4 0 0 1 4-4h8a4 4 0 0 1 0 8v4H8v-4a4 4 0 0 1-4-4z' },
  { key: 'meat', name: 'Carne și pește', icon: 'M15.5 4.5a5 5 0 0 1 0 7.1l-6 6a3 3 0 1 1-4.2-4.2l6-6a5 5 0 0 1 4.2-2.9zM6 18l-2 2' },
  { key: 'dairy', name: 'Lactate și ouă', icon: 'M8 3h8M9 3v3l-2 3v12h10V9l-2-3V3M7 13h10' },
  { key: 'frozen', name: 'Congelate', icon: 'M12 2v20M4 7l16 10M20 7L4 17' },
  { key: 'pantry', name: 'Băcănie', icon: 'M6 4h12v4H6zM5 8h14v12H5zM9 12h6' },
  { key: 'spices', name: 'Condimente și sosuri', icon: 'M9 3h6M10 3v4l-3 4v10h10V11l-3-4V3' },
  { key: 'sweets', name: 'Dulciuri și gustări', icon: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z' },
  { key: 'drinks', name: 'Băuturi', icon: 'M7 3h10l-1 18H8zM7.5 8h9' },
  { key: 'home', name: 'Casă și igienă', icon: 'M4 11l8-7 8 7v9H4zM10 20v-5h4v5' },
  { key: 'other', name: 'Altele', icon: 'M5 12h.01M12 12h.01M19 12h.01' },
]

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ş/g, 's').replace(/ţ/g, 't')

// Word beginnings per aisle. Checked in this order, so the more specific aisles come first
// ("lapte de cocos" is băcănie, "smântână" is lactate, "ardei iute" is legume).
const WORDS: [string, string[]][] = [
  ['pantry', ['lapte de cocos', 'lapte condensat', 'lapte praf', 'rosii decojite', 'rosii in bulion', 'rosii la conserva', 'porumb la conserva', 'fasole la conserva']],
  ['home', ['detergent', 'sapun', 'sampon', 'hartie igienica', 'servet', 'prosop de hartie', 'burete', 'saci de gunoi', 'pasta de dinti', 'scutec', 'folie', 'hartie de copt', 'lavete', 'balsam de rufe', 'solutie']],
  ['frozen', ['congelat', 'inghetat', 'mazare congelata', 'pizza congelata']],
  ['drinks', ['apa minerala', 'apa plata', 'suc', 'bere', 'vin ', 'vin rosu', 'vin alb', 'cafea', 'ceai', 'cola', 'limonada', 'sirop']],
  ['spices', ['sare', 'piper', 'boia', 'oregano', 'cimbru', 'busuioc uscat', 'rozmarin uscat', 'scortisoara', 'curry', 'chimen', 'nucsoara', 'dafin', 'vegeta', 'condiment', 'ketchup', 'mustar', 'maioneza', 'sos de soia', 'sos soia', 'otet', 'bulion', 'pasta de tomate', 'sos de rosii', 'pesto', 'cub de', 'supa la plic', 'ghimbir macinat', 'turmeric', 'paprika', 'chili', 'esenta', 'vanilie', 'drojdie', 'praf de copt', 'bicarbonat']],
  ['sweets', ['ciocolat', 'biscuit', 'napolitan', 'bomboan', 'chips', 'covrig', 'gem', 'dulceata', 'miere', 'nutella', 'cacao', 'frisca spray', 'inghetata']],
  ['dairy', ['lapte', 'smantana', 'iaurt', 'branza', 'telemea', 'cascaval', 'mozzarella', 'parmezan', 'ricotta', 'mascarpone', 'cheddar', 'feta', 'unt', 'frisca', 'kefir', 'sana', 'ou', 'oua', 'cas ', 'urda', 'crema de branza', 'philadelphia']],
  ['meat', ['pui', 'piept', 'pulp', 'aripi', 'carne', 'tocatura', 'porc', 'vita', 'vitel', 'miel', 'curcan', 'rata', 'ficat', 'mici', 'carnat', 'carnati', 'crenvurst', 'sunca', 'bacon', 'kaizer', 'salam', 'costita', 'muschi', 'cotlet', 'snitel', 'peste', 'somon', 'ton proaspat', 'pastrav', 'cod', 'hering', 'macrou', 'creveti', 'fructe de mare', 'midii', 'calamar']],
  ['bakery', ['paine', 'chifl', 'bagheta', 'lipie', 'tortilla', 'franzela', 'cozonac', 'croissant', 'blat', 'foi de placinta', 'aluat', 'pesmet', 'sandvis']],
  ['pantry', ['faina', 'malai', 'gris', 'orez', 'paste', 'spaghete', 'penne', 'fusilli', 'tagliatelle', 'lasagna', 'taitei', 'fidea', 'quinoa', 'cuscus', 'bulgur', 'ovaz', 'fulgi', 'cereale', 'zahar', 'ulei', 'masline', 'conserv', 'ton', 'naut', 'linte', 'fasole', 'mazare', 'porumb', 'lapte de cocos', 'stafide', 'nuci', 'migdale', 'alune', 'seminte', 'susan', 'arahide', 'gelatina', 'amidon', 'pasta de', 'zacusca', 'pateu']],
  ['produce', ['ceapa', 'cepe', 'usturoi', 'morcov', 'cartof', 'rosii', 'rosie', 'tomat', 'castrave', 'ardei', 'dovlec', 'dovleac', 'vinete', 'vanata', 'varz', 'conopid', 'broccoli', 'spanac', 'salata', 'rucola', 'patrunjel', 'marar', 'leustean', 'busuioc', 'rozmarin', 'menta', 'telina', 'praz', 'ciuperci', 'ciuperca', 'sfecla', 'ridichi', 'avocado', 'lamai', 'lamaie', 'lime', 'portocal', 'mere', 'mar ', 'pere', 'banan', 'capsun', 'afine', 'zmeura', 'struguri', 'kiwi', 'ananas', 'mango', 'piersic', 'caise', 'prune', 'cirese', 'visine', 'pepene', 'fructe', 'legume', 'ghimbir', 'ceapa verde', 'usturoi verde', 'fasole verde', 'mazare verde', 'porumb dulce', 'sparanghel', 'nap', 'pastarnac', 'gulie', 'ardei iute']],
]

/** The aisle of a shopping line, by its words (the amount at the start is ignored). */
export function aisleOf(text: string): string {
  const t = ` ${plain(text).replace(/^[\d\s.,/½¼¾-]+/, '').replace(/[^a-z0-9 ]+/g, ' ')} `
  // Fresh herbs and greens win over the dried spice of the same name ("busuioc proaspăt").
  if (/ (proaspat|proaspata|proaspete|verde|verzi) /.test(t) && WORDS.find(([k]) => k === 'produce')![1].some((w) => t.includes(` ${w}`))) return 'produce'
  for (const [key, words] of WORDS) if (words.some((w) => t.includes(` ${w}`))) return key
  return 'other'
}
