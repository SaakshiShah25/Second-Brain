import { useMutation } from '@tanstack/react-query'
import { api } from './client'
import type { AskResult, Candidate, ChatMessage } from './types'

export function useAsk() {
  return useMutation({
    mutationFn: ({ query, history }: { query: string; history: ChatMessage[] }) =>
      api.post<AskResult>('/api/ask', { query, history }),
  })
}

export interface AskConfirmBody {
  query: string
  parsed: Record<string, unknown>
  candidates: Candidate[]
  choice: number | null
}

export function useAskConfirm() {
  return useMutation({
    mutationFn: (body: AskConfirmBody) => api.post<AskResult>('/api/ask/confirm', body),
  })
}
