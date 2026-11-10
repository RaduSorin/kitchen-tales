import { defineFunction } from '@aws-amplify/backend'

// Error reports from the family's phones: the app sends what broke (page, message, iOS version)
// and this function writes it to its CloudWatch log, so a bug on the iPhone shows up without
// anyone having to describe it. See src/lib/errorReport.ts.
export const clientLog = defineFunction({
  name: 'client-log',
  entry: './handler.ts',
  timeoutSeconds: 5,
  memoryMB: 128,
  logging: { retention: '3 months' },
})
