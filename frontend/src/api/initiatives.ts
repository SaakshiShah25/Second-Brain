import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Initiative } from './types'
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

// The user's own order. Saved on the server (initiative.position) and
// also on this device, so it works before schema.sql section 34 has run.
const ORDER_KEY = 'confia.initiativeOrder'

function applyLocalOrder(list: Initiative[]): Initiative[] {
  let order: number[] = []
  try {
    order = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]')
  } catch {
    return list
  }
  if (!Array.isArray(order) || order.length === 0) return list
  const rank = new Map(order.map((id, i) => [id, i]))
  // Ones not in the saved order (new) keep the server's order, after the rest.
  return list
    .map((item, i) => ({ item, key: rank.get(item.id) ?? order.length + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item)
}

export function useReorderInitiatives() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: number[]) => api.put<{ saved: boolean }>('/api/initiatives/order', { ids }),
    onMutate: (ids) => {
      try {
        localStorage.setItem(ORDER_KEY, JSON.stringify(ids))
      } catch {
        // the server copy still holds it
      }
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
