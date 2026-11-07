export interface Recipe {
  id: string
  title: string
  category: string
  servings?: number
  minutes?: number
  ingredients: string[]
  steps: string[]
  /** Optional photo per step, aligned with steps by index ('' = no photo). */
  stepPhotoKeys?: string[]
  notes?: string
  sourceUrl?: string
  photoKey?: string
  /** Estimated by AI from the ingredients: values per serving and allergens (src/lib/diet.ts). */
  nutrition?: import('./diet').Nutrition
  allergens?: import('./diet').AllergenHit[]
  createdAt?: string
  updatedAt?: string
  /** Set when read from the cloud: in the signed-in account's space, and shared with every account. */
  mine?: boolean
  shared?: boolean
  /** The owning space's name, shown on something another space shared. */
  spaceName?: string
}

export type StorySource = 'upload' | 'recording' | 'generated'

export interface Story {
  id: string
  title: string
  emoji: string
  /** Colours of the drawn cover (index into SCENES); undefined = picked from the title. */
  scene?: number
  /** Cover picture in S3 (from the audio file's tags or chosen by a parent); emoji is the fallback. */
  coverKey?: string
  /** Shelf folder for a set of stories added together; without it the folder follows `source`. */
  collection?: string
  source: StorySource
  audioKey: string
  durationSec?: number
  text?: string
  /** One of the child's favourites (the "Favorite" tab). */
  favorite?: boolean
  createdAt?: string
  /** Set when read from the cloud; see Recipe. A new story is shared unless `shared` is false. */
  mine?: boolean
  shared?: boolean
  spaceName?: string
}

/** A shelf folder made by the family; its stories have `collection` equal to its name. */
export interface StoryFolder {
  id: string
  name: string
  /** An emoji shown on the folder card, e.g. 🎵. */
  icon?: string
  mine?: boolean
  shared?: boolean
  spaceName?: string
}

/** A recipe planned for a day of the week. `day` is a local date, YYYY-MM-DD. */
export interface PlanEntry {
  id: string
  day: string
  recipeId: string
  servings?: number
  /** Leftovers of this recipe, cooked the evening before: nothing to cook or buy that day. */
  leftovers?: boolean
}

export interface ShoppingItem {
  id: string
  text: string
  checked: boolean
  recipeId?: string
  recipeTitle?: string
  createdAt?: string
}
