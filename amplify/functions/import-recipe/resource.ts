import { defineFunction } from '@aws-amplify/backend'
import { IMAGE_MODEL_ID, IMAGE_MODEL_REGION, MODEL_ID } from '../../shared/model'

// Reads a recipe from a web page or from a photo (printed or handwritten)
// and returns it as structured fields, in Romanian.
export const importRecipe = defineFunction({
  name: 'import-recipe',
  entry: './handler.ts',
  timeoutSeconds: 120,
  memoryMB: 512,
  environment: { MODEL_ID, IMAGE_MODEL_ID, IMAGE_MODEL_REGION },
})
