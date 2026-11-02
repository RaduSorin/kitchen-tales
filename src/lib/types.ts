export interface Recipe {
  id: string
  title: string
  category: string
  servings?: number
  minutes?: number
  ingredients: string[]
  steps: string[]
  notes?: string
  photo?: Blob
  sourceUrl?: string
  createdAt: number
  updatedAt: number
}

export type StorySource = 'upload' | 'recording' | 'generated'

export interface Story {
  id: string
  title: string
  emoji: string
  source: StorySource
  audio: Blob
  durationSec?: number
  createdAt: number
}
