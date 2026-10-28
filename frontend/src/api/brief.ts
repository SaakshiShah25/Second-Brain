import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { MorningBrief } from './types'

export function useMorningBrief() {
  return useQuery({
    queryKey: ['brief', 'morning'],
    queryFn: () => api.get<MorningBrief>('/api/brief/morning'),
    // The server keeps one brief per day; no need to ask again on every tab switch.
    staleTime: 10 * 60 * 1000,
  })
}

export function useSendBriefEmail() {
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean; sent_to: string }>('/api/brief/send-email'),
  })
}

// Writes a fresh brief from the current state of things and shows it. The brief is
// otherwise a snapshot of the morning that does not change as the day goes on.
export function useRefreshBrief() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.get<MorningBrief>('/api/brief/morning?refresh=true'),
    onSuccess: (fresh) => queryClient.setQueryData(['brief', 'morning'], fresh),
  })
}
