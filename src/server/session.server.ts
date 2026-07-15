import { getRequest } from '@tanstack/react-start/server'
import { createAuth } from '@/lib/auth'
import { env } from 'cloudflare:workers'

// Plain async helper — callable from other server fns without an extra hop.
// D1/auth bindings only exist inside the request handler, so createAuth() is
// built per-request here (never at module scope).
export async function getCurrentSession() {
  const auth = createAuth(env)
  const request = getRequest()
  return auth.api.getSession({ headers: request.headers })
}

// Returns the authenticated user's id, or throws if there is no session.
// Server fns use this to scope every query by owner_id.
export async function requireUserId(): Promise<string> {
  const session = await getCurrentSession()
  if (!session) throw new Error('Unauthorized')
  return session.user.id
}
