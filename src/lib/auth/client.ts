import { createAuthClient } from 'better-auth/client'

// SSR-safe baseURL: in the browser use the page origin; in SSR (no window) use a valid
// absolute URL so better-auth's eager baseURL validation doesn't throw during server render.
// The SSR value is never used for real requests — the client only runs in the browser.
const baseURL =
  typeof window !== 'undefined' ? `${window.location.origin}/api/auth` : 'http://localhost:3000/api/auth'

export const authClient = createAuthClient({ baseURL })

export const { signIn, signOut, signUp, useSession } = authClient
