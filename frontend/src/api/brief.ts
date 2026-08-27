import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { MorningBrief } from './types'

export function useMorningBrief() {
  return useQuery({
    queryKey: ['brief', 'morning'],
    queryFn: () => api.get<MorningBrief>('/api/brief/morning'),
  })
}

export function useSendBriefEmail() {
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean; sent_to: string }>('/api/brief/send-email'),
  })
}
