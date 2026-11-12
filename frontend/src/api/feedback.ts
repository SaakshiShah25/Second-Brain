import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

// Mirrors api/routers/feedback.py.
export type FeedbackKind = 'rating' | 'issue' | 'snooze'

export interface FeedbackBody {
  kind: FeedbackKind
  rating?: number
  tags?: string[]
  message?: string
  screen?: string
  context?: Record<string, string | undefined>
}

// Whether to show the "How is MyConfía working for you?" card now (asked once per account, not per device).
export function useRatingPrompt() {
  return useQuery({
    queryKey: ['feedback', 'prompt'],
    queryFn: () => api.get<{ ask: boolean }>('/api/feedback/prompt'),
    staleTime: Infinity, // decided once per visit; answering it (below) refreshes it
  })
}

export function useSendFeedback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: FeedbackBody) => api.post<{ ok: boolean }>('/api/feedback', body),
    onSuccess: (_, body) => {
      if (body.kind !== 'issue') queryClient.setQueryData(['feedback', 'prompt'], { ask: false })
    },
  })
}
