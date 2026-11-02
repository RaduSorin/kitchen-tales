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
  updatedAt?: string
}

export type StorySource = 'upload' | 'recording' | 'generated'

export interface Story {
  id: string
  title: string
  emoji: string
  /** Cover picture in S3 (from the audio file's tags or chosen by a parent); emoji is the fallback. */
  coverKey?: string
  /** Shelf folder for a set of stories added together; without it the folder follows `source`. */
  collection?: string
  source: StorySource
  audioKey: string
  durationSec?: number
  text?: string
  createdAt?: string
}

/** A recipe planned for a day of the week. `day` is a local date, YYYY-MM-DD. */
export interface PlanEntry {
  id: string
  day: string
  recipeId: string
  servings?: number
}

export interface ShoppingItem {
  id: string
  text: string
  checked: boolean
  recipeId?: string
  recipeTitle?: string
  createdAt?: string
}
