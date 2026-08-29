import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { Interaction } from './types'

export function useNotes() {
  return useQuery({
    queryKey: ['notes'],
    queryFn: () => api.get<Interaction[]>('/api/notes'),
  })
}
