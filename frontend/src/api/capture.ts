import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { CaptureResult, CardFields } from './types'

// Invalidated by every successful capture path below, since a save can
// create a person/interaction/task that the Digest and People pages
// should reflect next time they're viewed.
function useInvalidateOnCapture() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['people'] })
    queryClient.invalidateQueries({ queryKey: ['notes'] })
  }
}

// Text/voice capture and Q&A both go through the unified /api/chat now
// (see api/chat.ts) - only business-card scanning stays a distinct
// explicit action here, since it's triggered by an attach icon, not
// something the chat intent-classifier needs to route.

export function useCaptureCard() {
  return useMutation({
    mutationFn: (imageFile: File) => {
      const formData = new FormData()
      formData.append('file', imageFile)
      return api.post<CardFields>('/api/capture/card', formData)
    },
  })
}

export function useCaptureCardConfirm() {
  const invalidate = useInvalidateOnCapture()
  return useMutation({
    mutationFn: (body: CardFields & { context_note: string }) =>
      api.post<CaptureResult>('/api/capture/card/confirm', body),
    onSuccess: invalidate,
  })
}
