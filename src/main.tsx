import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import { I18n } from 'aws-amplify/utils'
import { Authenticator, ThemeProvider, createTheme } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import outputs from '../amplify_outputs.json'
import './index.css'
import App from './App.tsx'

Amplify.configure(outputs)

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
        10: '#fff7ed', 20: '#ffedd5', 40: '#fdba74', 60: '#ea580c',
        80: '#c2410c', 90: '#9a3412', 100: '#7c2d12',
      },
    },
    radii: { small: '10px', medium: '12px', large: '16px' },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <Authenticator hideSignUp components={{ Header: () => <h1 className="auth-brand">🍲 Kitchen Tales</h1> }}>
        <App />
      </Authenticator>
    </ThemeProvider>
  </StrictMode>,
)
