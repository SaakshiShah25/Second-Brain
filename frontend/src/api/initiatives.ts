import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Initiative } from './types'
import { applyLocalOrder, saveLocalOrder } from '../lib/initiativeOrder'
import { colorForNewInitiative, setKnownInitiatives } from '../lib/initiativeStyle'

export function useInitiatives() {
  return useQuery({
    queryKey: ['initiatives'],
    queryFn: async () => {
      const list = applyLocalOrder(await api.get<Initiative[]>('/api/initiatives'))
      setKnownInitiatives(list)
      return list
    },
  })
}

export function useReorderInitiatives() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: number[]) => api.put<{ saved: boolean }>('/api/initiatives/order', { ids }),
    onMutate: (ids) => {
      saveLocalOrder(ids)
      queryClient.setQueryData<Initiative[]>(['initiatives'], (old) => (old ? applyLocalOrder(old) : old))
    },
  })
}

export function useCreateInitiative() {
  const queryClient = useQueryClient()
  return useMutation({
    // Every new initiative is saved with its own color - one no other
    // initiative is using yet - so its tasks and notes are easy to tell apart.
    mutationFn: async (body: { name: string; color?: string }) => {
      const color = body.color ?? colorForNewInitiative(body.name, await api.get<Initiative[]>('/api/initiatives'))
      return api.post<Initiative>('/api/initiatives', { ...body, color })
    },
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

export interface InitiativeDigest {
  sections: { title: string; points: string[] }[]
  note_count: number
  generated_at: string | null
  organised: boolean
}

// An initiative as one page (initiative_digest.py) - 0 = Others. Keyed
// under 'notes' so anything that refetches notes refreshes it too; the
// server only rewrites it when that initiative's notes actually changed.
export function useInitiativeDigest(id: number, enabled = true) {
  return useQuery({
    queryKey: ['notes', 'digest', id],
    queryFn: () => api.get<InitiativeDigest>(`/api/initiatives/${id}/digest`),
    enabled,
    staleTime: 5 * 60_000,
  })
}
