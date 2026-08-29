import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Initiative } from './types'

export function useInitiatives() {
  return useQuery({
    queryKey: ['initiatives'],
    queryFn: () => api.get<Initiative[]>('/api/initiatives'),
  })
}

export function useCreateInitiative() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; color?: string }) => api.post<Initiative>('/api/initiatives', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['initiatives'] }),
  })
}

export function useUpdateInitiative() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, fields }: { id: number; fields: Partial<Pick<Initiative, 'name' | 'color'>> }) =>
      api.patch<Initiative>(`/api/initiatives/${id}`, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['initiatives'] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

export function useDeleteInitiative() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/initiatives/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['initiatives'] })
      // Notes previously tagged with the deleted initiative now show
      // Uncategorized - refetch so the Notes page reflects that.
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}
