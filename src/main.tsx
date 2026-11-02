import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
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
import './index.css'
import { applyTheme } from './lib/settings'
import App from './App.tsx'

Amplify.configure(outputs)
applyTheme()

I18n.putVocabulariesForLanguage('ro', {
  'Sign In': 'Intră în cont',
  'Sign in': 'Intră în cont',
  'Signing in': 'Se intră în cont',
  Email: 'Email',
  'Enter your Email': 'Adresa de email',
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
        10: '#f2f3ee', 20: '#e3e7de', 40: '#9cbfa9', 60: '#5a8a6e',
        80: '#3e6a51', 90: '#2f5240', 100: '#1f2a24',
      },
    },
    radii: { small: '10px', medium: '12px', large: '16px' },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <Authenticator hideSignUp components={{ Header: () => <h1 className="auth-brand">Bucătăria cu povești</h1> }}>
        <App />
      </Authenticator>
    </ThemeProvider>
  </StrictMode>,
)
