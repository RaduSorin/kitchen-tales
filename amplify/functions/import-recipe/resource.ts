import { defineFunction } from '@aws-amplify/backend'
import { MODEL_ID } from '../../shared/model'

// Reads a recipe from a web page or from a photo (printed or handwritten)
// and returns it as structured fields, in Romanian.
export const importRecipe = defineFunction({
  name: 'import-recipe',
  entry: './handler.ts',
  timeoutSeconds: 90,
  memoryMB: 512,
  environment: { MODEL_ID },
})
