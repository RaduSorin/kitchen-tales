import { defineFunction, secret } from '@aws-amplify/backend'
import { VAPID_PUBLIC_KEY } from '../../shared/push'

// Răgaz's reminders (Friday's theme, Monday morning): one recurring EventBridge Scheduler
// schedule per person and rhythm, which invokes this function to send the Web Push notification.
// What it needs (the times, the Friday theme names, the phones' push subscriptions) sits in
// mind/<sub>/push.json in the files bucket; nothing the person wrote ever reaches it.
// In the data stack, like the files function, because it reads that bucket (see backend.ts).
export const mindPush = defineFunction({
  name: 'mind-push',
  entry: './handler.ts',
  timeoutSeconds: 30,
  resourceGroupName: 'data',
  environment: {
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: secret('VAPID_PRIVATE_KEY'),
    VAPID_SUBJECT: 'https://main.d1b5q3cpreuzof.amplifyapp.com',
  },
})
