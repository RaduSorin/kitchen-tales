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
  source: StorySource
  audioKey: string
  durationSec?: number
  text?: string
  createdAt?: string
}
