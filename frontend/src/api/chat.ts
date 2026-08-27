import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Candidate, ChatMessage, ChatResult } from './types'

// Invalidated on every successful capture-intent save, since a note can
// create a person/interaction/task the Digest and People pages should
// reflect next time they're viewed - same reasoning as api/capture.ts's
// useInvalidateOnCapture.
function useInvalidateOnCapture() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['people'] })
  }
}

export interface ChatBody {
  text: string
  history: ChatMessage[]
  geoLat?: number | null
  geoLng?: number | null
}

// `signal` lets the caller cancel an in-flight send (the Stop button) -
// see api/client.ts's api.post.
export function useChat() {
  const invalidate = useInvalidateOnCapture()
  return useMutation({
    mutationFn: ({ body, signal }: { body: ChatBody; signal?: AbortSignal }) =>
      api.post<ChatResult>(
        '/api/chat',
        { text: body.text, history: body.history, geo_lat: body.geoLat, geo_lng: body.geoLng },
        signal,
      ),
    onSuccess: (result) => {
      if (result.intent === 'capture' && result.status === 'saved') invalidate()
    },
  })
}

export interface ChatConfirmBody {
  intent: 'capture' | 'ask'
  candidates: Candidate[]
  choice: number | null
  // capture fields
  extracted?: unknown
  raw_text?: string
  interaction_date?: string
  date_warning?: string | null
  geo_lat?: number | null
  geo_lng?: number | null
  // ask fields
  query?: string
  parsed?: Record<string, unknown>
}

export function useChatConfirm() {
  const invalidate = useInvalidateOnCapture()
  return useMutation({
    mutationFn: (body: ChatConfirmBody) => api.post<ChatResult>('/api/chat/confirm', body),
    onSuccess: (result) => {
      if (result.intent === 'capture') invalidate()
    },
  })
}
