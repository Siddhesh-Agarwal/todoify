import { createFileRoute } from '@tanstack/react-router'
import { createAuth } from '@/lib/auth'
import { env } from 'cloudflare:workers'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => (await createAuth(env)).handler(request),
      POST: async ({ request }) => (await createAuth(env)).handler(request),
    },
  },
})
