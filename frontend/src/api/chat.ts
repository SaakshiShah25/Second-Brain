import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { ChatMessage, ChatResult } from './types'

// Invalidated on every successful capture-intent save, since a note can
// create a note/task the Tasks and Notes pages should reflect next time
// they're viewed.
function useInvalidateOnCapture() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['notes'] })
  }
}

export interface ChatBody {
  text: string
  history: ChatMessage[]
  geoLat?: number | null
  geoLng?: number | null
  // The category picked for this note in the input bar (null/absent: decide automatically).
  initiativeId?: number | null
  // Skip the "note or question?" decision and save the text as a note.
  asNote?: boolean
}

// `signal` lets the caller cancel an in-flight send (the Stop button) -
// see api/client.ts's api.post. `onStage` fires as the backend's SSE
// stream (/api/chat/stream, api/routers/chat.py) reports progress
// ("moderating" -> "classifying" -> "extracting"/"thinking" ->
// "saving") - ChatPage.tsx feeds it to TypingIndicator so the UI shows
// what's actually happening instead of a bare spinner, which matters
// since a slow extraction call can run 40s+ (see the 2026-10 timing
// instrumentation in api/routers/capture.py).
export function useChat() {
  const invalidate = useInvalidateOnCapture()
  return useMutation({
    mutationFn: ({
      body,
      signal,
      onStage,
    }: {
      body: ChatBody
      signal?: AbortSignal
      onStage?: (stage: string) => void
    }) =>
      api.postStream<ChatResult>(
        '/api/chat/stream',
        { text: body.text, history: body.history, geo_lat: body.geoLat, geo_lng: body.geoLng, initiative_id: body.initiativeId ?? null, as_note: body.asNote ?? false },
        onStage ?? (() => {}),
        signal,
      ),
    onSuccess: (result) => {
      if (result.intent === 'capture' && result.status === 'saved') invalidate()
    },
  })
}
