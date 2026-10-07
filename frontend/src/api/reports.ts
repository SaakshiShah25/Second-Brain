import { useMutation } from '@tanstack/react-query'
import { api } from './client'

export type ReportReason = 'incorrect' | 'offensive' | 'irrelevant' | 'other'

export interface ReportBody {
  kind: 'answer' | 'capture'
  reason: ReportReason
  question: string
  answer: string
  details: string
  source_interaction_ids: number[]
}

export function useReportAnswer() {
  return useMutation({
    mutationFn: (body: ReportBody) => api.post<{ ok: boolean; id: number }>('/api/reports', body),
  })
}
