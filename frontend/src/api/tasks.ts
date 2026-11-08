import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Repeat, Task, TaskFilter, TaskOwner, TasksResponse } from './types'

export function useTasks(filter: TaskFilter, enabled = true) {
  return useQuery({
    queryKey: ['tasks', filter],
    queryFn: () => api.get<TasksResponse>(`/api/tasks?status_filter=${filter}`),
    enabled,
  })
}

export interface ItemEdit {
  description?: string
  due_date?: string | null
  due_time?: string | null
  repeat?: Repeat | null
  list_id?: number | null
  detail?: string | null
}

// Edits an item's wording, deadline, repeat, list or detail. A field sent as null clears it.
export function useEditTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, ...fields }: { taskId: number } & ItemEdit) => api.patch(`/api/tasks/${taskId}`, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['lists'] })
    },
  })
}

// Typed straight into a list's quick-add box.
export function useCreateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { description: string; list_id: number | null; due_date?: string | null; repeat?: Repeat | null; initiative_id?: number | null }) =>
      api.post<{ id: number }>('/api/tasks', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['lists'] })
    },
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskId: number) => api.delete(`/api/tasks/${taskId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['lists'] })
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

// A repeating item (`repeats`) isn't closed when ticked - the server moves it to its next
// date - so it isn't shown as done in the meantime either; the refetch brings the new date.
export function useUpdateTaskStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: 'open' | 'done'; repeats?: boolean }) =>
      api.patch(`/api/tasks/${taskId}`, { status }),
    onMutate: async ({ taskId, status, repeats }) => {
      if (repeats) return { previous: [] as ReturnType<typeof queryClient.getQueriesData<TasksResponse>> }
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
      queryClient.invalidateQueries({ queryKey: ['lists'] })
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
      queryClient.invalidateQueries({ queryKey: ['lists'] })
    },
  })
}

// Priority, reminder date and category of a task: changed on the card, so the list updates the instant you tap.
export function useUpdateTaskFields() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, fields }: { taskId: number; fields: Partial<Pick<Task, 'priority' | 'remind_on' | 'remind_time' | 'initiative_id'>> }) =>
      api.patch(`/api/tasks/${taskId}`, fields),
    onMutate: async ({ taskId, fields }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const previous = queryClient.getQueriesData<TasksResponse>({ queryKey: ['tasks'] })
      queryClient.setQueriesData<TasksResponse>({ queryKey: ['tasks'] }, (old) =>
        old ? { ...old, tasks: old.tasks.map((t) => (t.id === taskId ? { ...t, ...fields } : t)) } : old,
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['lists'] })
    },
  })
}
