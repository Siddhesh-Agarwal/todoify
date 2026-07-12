import type { IncomingRequestCfProperties } from '@cloudflare/workers-types'
import { betterAuth } from 'better-auth'
import { withCloudflare } from 'better-auth-cloudflare'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../db/schema'

/**
 * Build the better-auth instance for the current request.
 * D1 binding only exists inside the request handler, so this MUST be called
 * per-request with the live env (never at module scope with bindings).
 */
export function createAuth(env?: Env, cf?: IncomingRequestCfProperties) {
  const db = env ? drizzle(env.DB, { schema }) : ({} as never)
  return betterAuth({
    baseURL: env?.BETTER_AUTH_URL ?? 'http://localhost:3000',
    ...withCloudflare(
      {
        autoDetectIpAddress: true,
        geolocationTracking: true,
        cf: cf ?? {},
        d1: env ? { db, options: { usePlural: true, debugLogs: false } } : undefined,
      },
      { emailAndPassword: { enabled: true } },
    ),
    ...(env ? {} : { database: drizzleAdapter({} as never, { provider: 'sqlite', usePlural: true }) }),
    plugins: [tanstackStartCookies()],
  })
}

// CLI-only export (no env): used by `@better-auth/cli generate` to emit auth.schema.ts.
// `usePlural: true` => tables are `users`, `sessions`, `accounts`, `verifications`.
export const auth = createAuth()

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>
