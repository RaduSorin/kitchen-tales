import { defineFunction, secret } from '@aws-amplify/backend'
import { MODEL_ID } from '../../shared/model'

// Writes a children's story with Claude (or takes the user's own text)
// and reads it aloud in Romanian: with ElevenLabs in the voice the family picked,
// or with Amazon Polly (no voice picked yet, no key, or ElevenLabs failed).
// The ElevenLabs key is an Amplify secret: Amplify console > Hosting > Secrets > ELEVENLABS_API_KEY.
export const generateStory = defineFunction({
  name: 'generate-story',
  entry: './handler.ts',
  timeoutSeconds: 180,
  memoryMB: 512,
  environment: {
    MODEL_ID,
    VOICE_ID: 'Carmen',
    ELEVENLABS_API_KEY: secret('ELEVENLABS_API_KEY'),
    ELEVENLABS_MODEL: 'eleven_multilingual_v2',
  },
})
