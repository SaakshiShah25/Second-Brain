import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { TaskFilter, TaskOwner, TasksResponse } from './types'

export function useTasks(filter: TaskFilter, enabled = true) {
  return useQuery({
    queryKey: ['tasks', filter],
    queryFn: () => api.get<TasksResponse>(`/api/tasks?status_filter=${filter}`),
    enabled,
  })
}

// Edits a task's wording and/or deadline. A field sent as null clears it.
export function useEditTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, ...fields }: { taskId: number; description?: string; due_date?: string | null; due_time?: string | null }) =>
      api.patch(`/api/tasks/${taskId}`, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['agenda'] })
    },
  })
}

// Both mutations below update the cached task list optimistically (flip
// status/owner the instant you click, before the network round-trip even
// resolves) rather than waiting on the server and only then re-rendering -
// otherwise the gap between "click" and "the invalidated query refetches"
// is exactly when the button's disabled/dimmed style shows, which reads as
// "broken" rather than "in progress" for something as quick as a checkbox
// tap. onSettled still invalidates so the real counts (overdue/due soon/
// etc., which aren't worth recomputing client-side) catch up right after.

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: 'open' | 'done' }) =>
      api.patch(`/api/tasks/${taskId}`, { status }),
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const previous = queryClient.getQueriesData<TasksResponse>({ queryKey: ['tasks'] })
      queryClient.setQueriesData<TasksResponse>({ queryKey: ['tasks'] }, (old) =>
        old ? { ...old, tasks: old.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) } : old,
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['agenda'] })
    },
  })
}

export function useUpdateTaskOwner() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, owner }: { taskId: number; owner: TaskOwner }) =>
      api.patch(`/api/tasks/${taskId}`, { owner }),
    onMutate: async ({ taskId, owner }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const previous = queryClient.getQueriesData<TasksResponse>({ queryKey: ['tasks'] })
      queryClient.setQueriesData<TasksResponse>({ queryKey: ['tasks'] }, (old) =>
        old ? { ...old, tasks: old.tasks.map((t) => (t.id === taskId ? { ...t, owner } : t)) } : old,
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['agenda'] })
    },
  })
}
