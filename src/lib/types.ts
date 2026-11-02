export interface Recipe {
  id: string
  title: string
  category: string
  servings?: number
  minutes?: number
  ingredients: string[]
  steps: string[]
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
  source: StorySource
  audioKey: string
  durationSec?: number
  text?: string
  createdAt?: string
}
