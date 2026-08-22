/**
 * Google Authentication utility for Scoundrel.
 *
 * Uses Google Identity Services (GIS) loaded via CDN by the LoginModal.
 * Requires VITE_GOOGLE_CLIENT_ID to be set in your .env.local file:
 *   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
 *
 * To set up:
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a project → APIs & Services → Credentials → OAuth 2.0 Client ID
 * 3. Set Authorized JavaScript origins to your domain (e.g. http://localhost:5173)
 * 4. Copy the Client ID into your .env.local file
 */

const STORAGE_KEY = 'scoundrel:user'

function decodeJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function saveUser(user) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
  } catch {
    // ignore
  }
}

export function loadUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const user = JSON.parse(raw)
    if (!user || typeof user !== 'object' || !user.email) return null
    return user
  } catch {
    return null
  }
}

export function clearUser() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Initialize Google Identity Services and render the Sign In button.
 * @param {HTMLElement} buttonEl - container element for the button
 * @param {function} onSuccess - called with (user, credential): the decoded
 *   { name, email, picture, sub } plus the raw id_token. The raw credential is
 *   handed to the server (via cloudSync) to verify the account and mint a
 *   session token for cross-device save sync; it is not persisted here.
 * @param {function} onError - called with error message on failure
 */
export function initGoogleSignIn(buttonEl, onSuccess, onError) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  if (!clientId) {
    onError('Google Client ID not configured. Set VITE_GOOGLE_CLIENT_ID in your .env.local file.')
    return
  }

  if (!window.google?.accounts?.id) {
    onError('Google Identity Services not loaded. Check your network connection.')
    return
  }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => {
      if (!response.credential) {
        onError('No credential returned from Google.')
        return
      }
      const payload = decodeJwt(response.credential)
      if (!payload) {
        onError('Failed to parse Google credential.')
        return
      }
      const user = {
        name: payload.name || payload.email,
        email: payload.email,
        picture: payload.picture || null,
        sub: payload.sub,
      }
      saveUser(user)
      onSuccess(user, response.credential)
    },
  })

  window.google.accounts.id.renderButton(buttonEl, {
    theme: 'filled_black',
    size: 'large',
    text: 'signin_with',
    shape: 'pill',
    logo_alignment: 'left',
    width: 280,
  })
}

export function signOut(onDone) {
  clearUser()
  try {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect()
    }
  } catch {
    // ignore
  }
  if (typeof onDone === 'function') onDone()
}
