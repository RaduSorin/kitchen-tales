import { defineFunction } from '@aws-amplify/backend'

// Răgaz's optional Claude: a stateless relay to Bedrock. The conversation, the "what Claude knows
// about me" note and every answer are kept only on the phone; this function stores nothing of them
// and logs only sizes and timings. It keeps a per-person monthly message count (mind/<sub>/usage.json).
export const mindCoach = defineFunction({
  name: 'mind-coach',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 512,
  resourceGroupName: 'data',
})
