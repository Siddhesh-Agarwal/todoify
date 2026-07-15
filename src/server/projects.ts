import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, type DB } from '@/lib/db'
import { project } from '@/lib/db/schema'
import { requireUserId } from './session'

export const createProject = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      color: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const id = crypto.randomUUID()
    await db.insert(project).values({
      id,
      name: data.name,
      description: data.description ?? null,
      color: data.color ?? null,
      owner_id: userId,
      archived: false,
    })
    const [created] = await db.select().from(project).where(eq(project.id, id))
    return created
  })

export const listProjects = createServerFn({ method: 'GET' })
  .validator(z.object({ include_archived: z.boolean().default(false) }).optional())
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const opts = data ?? { include_archived: false }
    const conds = [eq(project.owner_id, userId)]
    if (!opts.include_archived) conds.push(eq(project.archived, false))
    return db.select().from(project).where(and(...conds)).orderBy(asc(project.name))
  })

export const getProject = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const [row] = await db
      .select()
      .from(project)
      .where(and(eq(project.id, data.id), eq(project.owner_id, userId)))
    if (!row) throw new Error('Not found')
    return row
  })

export const updateProject = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.uuid(),
      name: z.string().min(1).max(100).optional(),
      description: z.string().nullable().optional(),
      color: z.string().nullable().optional(),
      archived: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const { id, ...patch } = data
    const [existing] = await db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.id, id), eq(project.owner_id, userId)))
    if (!existing) throw new Error('Not found')
    await db.update(project).set(patch).where(eq(project.id, id))
    const [updated] = await db.select().from(project).where(eq(project.id, id))
    return updated
  })

// Archive (or unarchive) a project. DESIGN §4.5: archive, never delete.
export const archiveProject = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid(), archived: z.boolean() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    await db
      .update(project)
      .set({ archived: data.archived })
      .where(and(eq(project.id, data.id), eq(project.owner_id, userId)))
    return { id: data.id, archived: data.archived }
  })

// Plain helper used by quick-add task creation to resolve a project by name
// (case-insensitive). Caller batches the insert if it is new.
export async function findProjectByName(db: DB, userId: string, name: string) {
  const [row] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.owner_id, userId), sql`lower(${project.name}) = lower(${name})`))
    .limit(1)
  return row
}
