import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { Agenda, AgendaEvent } from './types'

// Tasks (by deadline day) and yearly dates between two days, inclusive.
export function useAgenda(start: string, end: string) {
  return useQuery({
    queryKey: ['agenda', start, end],
    queryFn: () => api.get<Agenda>(`/api/agenda?start=${start}&end=${end}`),
  })
}

// The next birthdays / anniversaries, soonest first - the "Coming up" card.
export function useUpcomingEvents(days = 30) {
  return useQuery({
    queryKey: ['agenda', 'upcoming', days],
    queryFn: () => api.get<{ events: AgendaEvent[] }>(`/api/agenda/upcoming?days=${days}`),
    staleTime: 5 * 60 * 1000,
  })
}
