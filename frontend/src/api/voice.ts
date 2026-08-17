import { useMutation } from '@tanstack/react-query'
import { api } from './client'

// Mode-agnostic - just returns the transcript. The caller feeds it into
// whichever of useCaptureText()/useAsk() matches the current mode, same
// as views/chat_view.py's handle_voice_input() routes to handle_capture()
// or handle_retrieval() based on the mode toggle.
export function useTranscribe() {
  return useMutation({
    mutationFn: (audioBlob: Blob) => {
      const formData = new FormData()
      formData.append('file', audioBlob, 'recording.webm')
      return api.post<{ transcript: string }>('/api/transcribe', formData)
    },
  })
}
