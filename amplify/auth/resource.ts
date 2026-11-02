import { defineAuth } from '@aws-amplify/backend'
import { family } from '../functions/family/resource'

const APP_URL = 'https://main.d1b5q3cpreuzof.amplifyapp.com'

// Email login. Self sign-up is disabled in backend.ts: accounts are created
// by family members from the Family screen, so "authenticated" means "family member".
export const auth = defineAuth({
  loginWith: {
    email: {
      // Invitations sent from the Family screen: include the app link, not just the password.
      userInvitation: {
        emailSubject: 'Invitație la Bucătăria cu povești',
        emailBody: (username, code) => [
          'Bună!',
          '',
          'Ai fost invitat(ă) în aplicația familiei, Bucătăria cu povești: rețete și povești audio pentru copii.',
          '',
          `Deschide aplicația: ${APP_URL}`,
          `Email: ${username()}`,
          `Parolă temporară: ${code()}`,
          '',
          'La prima conectare îți alegi o parolă nouă. Pe telefon, din meniul Share al browserului alege „Adaugă pe ecranul principal”, ca s-o ai ca aplicație.',
        ].join('<br>'),
      },
    },
  },
  // The Family screen in Settings lists accounts and sends invitations.
  access: (allow) => [allow.resource(family).to(['listUsers', 'createUser'])],
})
