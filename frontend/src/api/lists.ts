import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { ItemList } from './types'

export function useLists() {
  return useQuery({
    queryKey: ['lists'],
    queryFn: () => api.get<ItemList[]>('/api/lists'),
  })
}

export function useCreateList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; emoji?: string; initiative_id?: number | null }) => api.post<ItemList>('/api/lists', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lists'] }),
  })
}

export function useUpdateList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ listId, ...fields }: { listId: number; name?: string; emoji?: string }) =>
      api.patch<ItemList>(`/api/lists/${listId}`, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lists'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

// Deletes the list and every item in it.
export function useDeleteList() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (listId: number) => api.delete(`/api/lists/${listId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lists'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
