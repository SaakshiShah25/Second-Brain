import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Interaction } from './types'

export function useNotes() {
  return useQuery({
    queryKey: ['notes'],
    queryFn: () => api.get<Interaction[]>('/api/notes'),
  })
}

export function useCreateNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { raw_text: string; initiative_id: number | null }) => api.post<{ id: number }>('/api/notes', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  })
}

export function useUpdateInteraction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ interactionId, fields }: { interactionId: number; fields: Record<string, unknown> }) =>
      api.patch(`/api/notes/${interactionId}`, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useDeleteInteraction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (interactionId: number) => api.delete(`/api/notes/${interactionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
