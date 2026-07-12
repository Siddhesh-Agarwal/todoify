import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createAuth } from '@/lib/auth'
import { env } from 'cloudflare:workers'

export const getSession = createServerFn({ method: 'GET' }).handler(async () => {
  const auth = createAuth(env)
  const request = getRequest()
  return auth.api.getSession({ headers: request.headers })
})
