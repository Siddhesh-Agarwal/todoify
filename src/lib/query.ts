import { QueryClient, isServer } from '@tanstack/react-query'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false },
    },
  })
}

let browserClient: QueryClient | null = null

// Server: fresh client per request (avoid cross-request state leaks across
// Cloudflare Worker isolates). Browser: one singleton for the session.
export function getQueryClient() {
  if (isServer) return makeClient()
  if (!browserClient) browserClient = makeClient()
  return browserClient
}
