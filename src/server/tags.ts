import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, type DB } from '@/lib/db'
import { tag } from '@/lib/db/schema'
import { requireUserId } from './session'

export const listTags = createServerFn({ method: 'GET' })
  .validator(z.void().optional())
  .handler(async () => {
    const userId = await requireUserId()
    const db = getDb()
    return db.select().from(tag).where(eq(tag.owner_id, userId)).orderBy(asc(tag.name))
  })

export const createTag = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().min(1).max(50) }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const id = crypto.randomUUID()
    await db.insert(tag).values({ id, name: data.name, owner_id: userId })
    const [created] = await db.select().from(tag).where(eq(tag.id, id))
    return created
  })

// Plain helper (not a server fn) used by quick-add task creation to resolve
// a tag name to an id. Caller is responsible for batching the insert.
export async function findTagByName(db: DB, userId: string, name: string) {
  const [row] = await db
    .select({ id: tag.id })
    .from(tag)
    .where(and(eq(tag.owner_id, userId), eq(tag.name, name)))
  return row
}
