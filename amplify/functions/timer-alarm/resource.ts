import { defineFunction, secret } from '@aws-amplify/backend'
import { VAPID_PUBLIC_KEY } from '../../shared/push'

// Cooking timers: schedules a push notification for the moment a timer ends, so it reaches the
// phone even when the app is closed or the screen is locked (iOS stops web timers then).
export const timerAlarm = defineFunction({
  name: 'timer-alarm',
  entry: './handler.ts',
  timeoutSeconds: 20,
  environment: {
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: secret('VAPID_PRIVATE_KEY'),
    VAPID_SUBJECT: 'https://main.d1b5q3cpreuzof.amplifyapp.com',
  },
})
