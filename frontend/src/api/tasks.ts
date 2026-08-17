import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { StalePerson, TaskFilter, TaskOwner, TasksResponse } from './types'

export function useTasks(filter: TaskFilter) {
  return useQuery({
    queryKey: ['tasks', filter],
    queryFn: () => api.get<TasksResponse>(`/api/tasks?status_filter=${filter}`),
  })
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: 'open' | 'done' }) =>
      api.patch(`/api/tasks/${taskId}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useUpdateTaskOwner() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, owner }: { taskId: number; owner: TaskOwner }) =>
      api.patch(`/api/tasks/${taskId}`, { owner }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useStalePeople(thresholdDays: number) {
  return useQuery({
    queryKey: ['people', 'stale', thresholdDays],
    queryFn: () => api.get<StalePerson[]>(`/api/people/stale?threshold_days=${thresholdDays}`),
  })
}

export function useAddTaskToCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskId: number) =>
      api.post<{ calendar_event_id: string; html_link: string | null }>(`/api/tasks/${taskId}/calendar`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useRemoveTaskFromCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (taskId: number) => api.delete(`/api/tasks/${taskId}/calendar`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })
}
