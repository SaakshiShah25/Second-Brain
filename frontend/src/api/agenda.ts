import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { Agenda } from './types'

// Tasks by deadline day between two days, inclusive.
export function useAgenda(start: string, end: string) {
  return useQuery({
    queryKey: ['agenda', start, end],
    queryFn: () => api.get<Agenda>(`/api/agenda?start=${start}&end=${end}`),
  })
}
