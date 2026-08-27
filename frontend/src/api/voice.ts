import { useMutation } from '@tanstack/react-query'
import { api } from './client'

// Just returns the transcript - ChatPage.tsx puts it in the text input
// for the user to review/edit rather than auto-sending it, and from
// there it goes through the same unified /api/chat send as typed text.
export function useTranscribe() {
  return useMutation({
    mutationFn: (audioBlob: Blob) => {
      const formData = new FormData()
      formData.append('file', audioBlob, 'recording.webm')
      return api.post<{ transcript: string }>('/api/transcribe', formData)
    },
  })
}
