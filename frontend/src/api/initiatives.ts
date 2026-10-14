import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { suggestColor, suggestIconKey } from '../lib/initiativeStyle'
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
    // Every new initiative is saved with a colour and an icon that no other
    // initiative is using, so creating one never asks the user to choose
    // (they can change either later by clicking it). Whichever screen creates it.
    mutationFn: (body: { name: string; color?: string; icon?: string }) => {
      const existing = queryClient.getQueryData<Initiative[]>(['initiatives']) ?? []
      return api.post<Initiative>('/api/initiatives', {
        ...body,
        color: body.color ?? suggestColor(body.name, existing),
        icon: body.icon ?? suggestIconKey(body.name, existing),
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['initiatives'] }),
  })
}

export function useUpdateInitiative() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, fields }: { id: number; fields: Partial<Pick<Initiative, 'name' | 'color' | 'icon'>> }) =>
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
