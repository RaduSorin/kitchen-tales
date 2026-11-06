import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import { cognitoCredentialsProvider } from 'aws-amplify/auth/cognito'
import { I18n } from 'aws-amplify/utils'
import { Authenticator, ThemeProvider, createTheme } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import outputs from '../amplify_outputs.json'
import '@fontsource/figtree/400.css'
import '@fontsource/figtree/500.css'
import '@fontsource/figtree/600.css'
import '@fontsource/figtree/700.css'
import '@fontsource/young-serif/400.css'
import '@fontsource/baloo-2/latin-500.css'
import '@fontsource/baloo-2/latin-ext-500.css'
import '@fontsource/baloo-2/latin-700.css'
import '@fontsource/baloo-2/latin-ext-700.css'
import '@fontsource/baloo-2/latin-800.css'
import '@fontsource/baloo-2/latin-ext-800.css'
import '@fontsource/fraunces/600.css'
import './index.css'
import './stories-a.css'
import { applyTheme } from './lib/settings'
import { offlineFirstTokenProvider } from './lib/offlineAuth'
import App from './App.tsx'
import { AuthFooter, AuthHeader } from './components/AuthScene'

Amplify.configure(outputs)
// Same providers as the default, except that a saved session still opens the app offline.
Amplify.configure(Amplify.getConfig(), {
  Auth: { tokenProvider: offlineFirstTokenProvider, credentialsProvider: cognitoCredentialsProvider },
})
applyTheme()

I18n.putVocabulariesForLanguage('ro', {
  'Sign In': 'Intră în cont',
  'Sign in': 'Intră în cont',
  'Signing in': 'Se intră în cont',
  Email: 'Email',
  'Enter your Email': 'Email',
  Password: 'Parolă',
  'Enter your Password': 'Parola',
  'Forgot your password?': 'Ai uitat parola?',
  'Reset Password': 'Resetează parola',
  'Reset your password': 'Resetează parola',
  'Send code': 'Trimite codul',
  'Back to Sign In': 'Înapoi la autentificare',
  'Change Password': 'Schimbă parola',
  Changing: 'Se schimbă',
  'New password': 'Parolă nouă',
  'Confirm Password': 'Confirmă parola',
  'Please confirm your Password': 'Confirmă parola',
  Code: 'Cod',
  'Code *': 'Cod *',
  'New Password': 'Parolă nouă',
  Submit: 'Trimite',
  'Incorrect username or password.': 'Email sau parolă greșită.',
  'User does not exist.': 'Nu există un cont cu acest email.',
})
I18n.setLanguage('ro')

const theme = createTheme({
  name: 'kitchen-tales',
  tokens: {
    colors: {
      primary: {
        // Gold, from design A.
        10: '#3a3122', 20: '#5a4a2c', 40: '#c99a45', 60: '#e3b665',
        80: '#f2c879', 90: '#ffe3a3', 100: '#fff3d6',
      },
    },
    radii: { small: '12px', medium: '16px', large: '28px' },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <Authenticator hideSignUp components={{ Header: AuthHeader, Footer: AuthFooter }}>
        <App />
      </Authenticator>
    </ThemeProvider>
  </StrictMode>,
)
