import { QueryClient } from '@tanstack/react-query'

export function getQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false },
    },
  })
}
