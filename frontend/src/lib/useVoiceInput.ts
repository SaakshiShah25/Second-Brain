import { useRef, useState } from 'react'
import { useTranscribe } from '../api/voice'
import { useLiveTranscript } from './useLiveTranscript'

// "Something went wrong: Error: Couldn't reach…" reads badly - just the message.
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

interface Options {
  // Where words appear while you speak (the browser's live preview) and the box is cleared when recording starts.
  setText: (text: string) => void
  // Whisper's final transcript. It is put in the box for the user to review - never sent on its own.
  onTranscript: (transcript: string) => void
  // The microphone was refused / transcription failed: a sentence for the user.
  onError: (message: string) => void
  // True while the recording is being turned into text (the caller can lock its send button).
  onBusyChange?: (busy: boolean) => void
}

// Record, pause, resume, cancel and transcribe - the voice half of the composer, shared by the Home chat and the
// Today box so both behave exactly the same.
export function useVoiceInput({ setText, onTranscript, onError, onBusyChange }: Options) {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const cancelledRef = useRef(false) // set when the user discards a recording instead of finishing it
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const transcribe = useTranscribe()
  // Live "types out as you speak" preview (see useLiveTranscript.ts) - a browser-native best-effort layer on top
  // of the real recording; Whisper's transcript replaces it with a more accurate final version.
  const liveTranscript = useLiveTranscript(setText)

  async function start() {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      // Mic permission denied, no microphone, or the OS blocked it (e.g. Android's system dialog was dismissed).
      // A clear message matters doubly on the Android TWA wrapper, where a denied permission is easy to run into.
      onError("Couldn't access your microphone - check that this app has microphone permission, then try again.")
      return
    }
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    setText('')
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
    recorder.onstop = async () => {
      liveTranscript.stop()
      stream.getTracks().forEach((t) => t.stop())
      if (cancelledRef.current) {
        // discarded: nothing is transcribed, nothing is kept
        cancelledRef.current = false
        chunksRef.current = []
        return
      }
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      onBusyChange?.(true)
      try {
        const { transcript } = await transcribe.mutateAsync(blob)
        onTranscript(transcript)
      } catch (err) {
        onError(`Voice transcription failed: ${errorText(err)}`)
      } finally {
        onBusyChange?.(false)
      }
    }
    recorder.start()
    liveTranscript.start()
    recorderRef.current = recorder
    setIsRecording(true)
  }

  function stop() {
    recorderRef.current?.stop()
    setIsRecording(false)
    setIsPaused(false)
  }

  function pause() {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording') return
    recorder.pause()
    liveTranscript.stop() // the live words are only a preview; the real transcript comes at the end
    setIsPaused(true)
  }

  function resume() {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'paused') return
    recorder.resume()
    liveTranscript.start()
    setIsPaused(false)
  }

  function cancel() {
    cancelledRef.current = true
    recorderRef.current?.stop()
    setIsRecording(false)
    setIsPaused(false)
    setText('')
  }

  return { isRecording, isPaused, isTranscribing: transcribe.isPending, start, stop, pause, resume, cancel }
}
