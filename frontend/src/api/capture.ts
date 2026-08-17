import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Candidate, CaptureResult, CardFields, ExtractedNote } from './types'

// Invalidated by every successful capture path below, since a save can
// create a person/interaction/task that the Digest and People pages
// should reflect next time they're viewed.
function useInvalidateOnCapture() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['people'] })
  }
}

export interface CaptureTextBody {
  rawText: string
  geoLat?: number | null
  geoLng?: number | null
}

export function useCaptureText() {
  const invalidate = useInvalidateOnCapture()
  return useMutation({
    mutationFn: ({ rawText, geoLat, geoLng }: CaptureTextBody) =>
      api.post<CaptureResult>('/api/capture', { raw_text: rawText, geo_lat: geoLat, geo_lng: geoLng }),
    onSuccess: (result) => {
      if (result.status === 'saved') invalidate()
    },
  })
}

export interface CaptureConfirmBody {
  extracted: ExtractedNote
  raw_text: string
  interaction_date: string
  date_warning: string | null
  candidates: Candidate[]
  choice: number | null
  geo_lat?: number | null
  geo_lng?: number | null
}

export function useCaptureConfirm() {
  const invalidate = useInvalidateOnCapture()
  return useMutation({
    mutationFn: (body: CaptureConfirmBody) => api.post<CaptureResult>('/api/capture/confirm', body),
    onSuccess: invalidate,
  })
}

export interface CaptureVoiceBody {
  audioBlob: Blob
  geoLat?: number | null
  geoLng?: number | null
}

export function useCaptureVoice() {
  const invalidate = useInvalidateOnCapture()
  return useMutation({
    mutationFn: ({ audioBlob, geoLat, geoLng }: CaptureVoiceBody) => {
      const formData = new FormData()
      formData.append('file', audioBlob, 'recording.webm')
      if (geoLat != null) formData.append('geo_lat', String(geoLat))
      if (geoLng != null) formData.append('geo_lng', String(geoLng))
      return api.post<CaptureResult & { transcript: string }>('/api/capture/voice', formData)
    },
    onSuccess: (result) => {
      if (result.status === 'saved') invalidate()
    },
  })
}

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
