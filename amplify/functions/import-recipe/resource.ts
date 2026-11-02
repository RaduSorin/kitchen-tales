import { defineFunction } from '@aws-amplify/backend'

export const MODEL_ID = 'eu.anthropic.claude-sonnet-4-6'

// Reads a recipe from a web page or from a photo (printed or handwritten)
// and returns it as structured fields, in Romanian.
export const importRecipe = defineFunction({
  name: 'import-recipe',
  entry: './handler.ts',
  timeoutSeconds: 90,
  memoryMB: 512,
  environment: { MODEL_ID },
})
