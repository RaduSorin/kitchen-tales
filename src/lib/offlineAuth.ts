// Lets the app open without internet. Cognito access tokens last one hour; after that,
// Amplify refreshes them over the network before it treats anyone as signed in, so
// offline the app fell back to the sign-in screen. This token provider wraps Amplify's
// own: when the refresh fails only because there is no connection, it hands back the
// session saved on this device, so stories and recipes kept here stay reachable.
// Requests made with it simply fail offline (and fall back to the device copy); the
// next request once online refreshes the tokens as usual. A real sign-in problem
// (revoked or expired session) is never masked: Amplify clears the saved tokens then.
import { decodeJWT, type AuthTokens, type JWT, type TokenProvider } from 'aws-amplify/auth'
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito'
import outputs from '../../amplify_outputs.json'

const isNetworkError = (err: unknown) =>
  !navigator.onLine || (err as { name?: string } | null)?.name === 'NetworkError'

function decodeJwt(token: string | null): JWT | undefined {
  try { return token ? decodeJWT(token) : undefined } catch { return undefined }
}

/** The session Amplify saved on this device, read without any network call. */
function savedTokens(): AuthTokens | undefined {
  try {
    const prefix = `CognitoIdentityServiceProvider.${outputs.auth.user_pool_client_id}`
    const username = localStorage.getItem(`${prefix}.LastAuthUser`)
    if (!username) return undefined
    const key = `${prefix}.${username}`
    // Without a refresh token the session could never be renewed, so it does not count.
    if (!localStorage.getItem(`${key}.refreshToken`)) return undefined
    const accessToken = decodeJwt(localStorage.getItem(`${key}.accessToken`))
    if (!accessToken) return undefined
    const idToken = decodeJwt(localStorage.getItem(`${key}.idToken`))
    const details = localStorage.getItem(`${key}.signInDetails`)
    return { accessToken, idToken, ...(details ? { signInDetails: JSON.parse(details) } : {}) }
  } catch {
    return undefined
  }
}

export const offlineFirstTokenProvider: TokenProvider = {
  async getTokens(options) {
    try {
      return await cognitoUserPoolsTokenProvider.getTokens(options)
    } catch (err) {
      const saved = isNetworkError(err) ? savedTokens() : undefined
      if (saved) return saved
      throw err
    }
  },
}
