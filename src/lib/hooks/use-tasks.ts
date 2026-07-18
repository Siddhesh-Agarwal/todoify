import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listTasks, createTaskFromQuickAdd } from '@/server/tasks'
import { listProjects } from '@/server/projects'
import { listTags } from '@/server/tags'
import { getTaskStats } from '@/server/stats'
import { parseQuickAdd } from '@/lib/schemas/quick-add'
import { priorityToWeight } from '@/lib/schemas/priority'
import type { TaskListQuery } from '@/lib/schemas/task'
import type { Task } from '@/lib/db/schema'

export function useTasks(search: TaskListQuery) {
  return useQuery({
    queryKey: ['tasks', search],
    queryFn: () => listTasks({ data: search }),
    placeholderData: (prev) => prev,
  })
}

export function useTaskStats(search: TaskListQuery) {
  return useQuery({
    queryKey: ['stats', search],
    queryFn: () => getTaskStats({ data: search }),
    placeholderData: (prev) => prev,
  })
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects({ data: {} }),
    staleTime: 60_000,
  })
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => listTags({ data: undefined }),
    staleTime: 60_000,
  })
}

// Immediate-save quick-add. Optimistic insert into the active tasks cache;
// invalidate tasks + stats on success; rollback on error.
export function useCreateQuickAdd(search: TaskListQuery) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (text: string) => {
      const parsed = parseQuickAdd(text)
      const created = await createTaskFromQuickAdd({
        data: {
          title: parsed.title,
          projectName: parsed.projectName,
          tags: parsed.tags,
          priority: parsed.priority,
          dueDate: parsed.dueDate,
        },
      })
      return { created, warnings: parsed.warnings }
    },
    onMutate: async (text: string) => {
      const parsed = parseQuickAdd(text)
      await qc.cancelQueries({ queryKey: ['tasks', search] })
      const prev = qc.getQueryData<{ items: Task[]; total: number; page: number; pageSize: number }>([
        'tasks',
        search,
      ])
      const placeholder: Task = {
        id: `optimistic-${Date.now()}`,
        title: parsed.title,
        description: null,
        status: 'PLANNING',
        priority: parsed.priority,
        priority_weight: priorityToWeight(parsed.priority),
        project_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        due_date: parsed.dueDate ?? null,
        owner_id: '',
        is_trashed: false,
        trashed_at: null,
      }
      if (prev) {
        qc.setQueryData(['tasks', search], { ...prev, items: [placeholder, ...prev.items], total: prev.total + 1 })
      }
      return { prev }
    },
    onError: (_err, _text, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tasks', search], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}
