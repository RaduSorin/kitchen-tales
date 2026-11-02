import { defineFunction } from '@aws-amplify/backend'
import { MODEL_ID } from '../../shared/model'

// Writes a children's story with Claude (or takes the user's own text)
// and reads it aloud in Romanian with Amazon Polly.
export const generateStory = defineFunction({
  name: 'generate-story',
  entry: './handler.ts',
  timeoutSeconds: 180,
  memoryMB: 512,
  environment: { MODEL_ID, VOICE_ID: 'Carmen' },
})
