import { useCallback, useRef } from 'react'

// Minimal shape of the Web Speech API's SpeechRecognition - not in
// TypeScript's standard DOM lib (it's still a non-standard/experimental
// browser API), so declared narrowly here rather than pulling in a whole
// @types package for a handful of fields.
interface SpeechRecognitionResult {
  0: { transcript: string }
  isFinal: boolean
}
interface SpeechRecognitionEvent {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResult>
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

// Live, word-by-word preview while recording a voice note - the actual
// saved transcript still comes from Groq's Whisper (voice.py) once
// recording stops, which is generally more accurate; this is purely a
// "watch it type out as you speak" UX layer on top, same idea as
// Claude's own voice input. Best-effort by design: unsupported browsers
// (notably Firefox) or a recognition error just mean no live preview -
// recording and the final Whisper transcript are completely unaffected
// either way, so this never blocks or degrades the actual capture flow.
export function useLiveTranscript(onUpdate: (text: string) => void) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const supported = typeof window !== 'undefined' && !!getRecognitionCtor()

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'

    let finalText = ''
    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) finalText += result[0].transcript
        else interim += result[0].transcript
      }
      onUpdate((finalText + interim).trim())
    }
    // Silently ignored - a live-preview failure (e.g. mic permission
    // quirk, network hiccup for the browser's recognition service)
    // shouldn't surface as an error, since the actual recording/Whisper
    // path is entirely separate and unaffected.
    recognition.onerror = () => {}

    try {
      recognition.start()
      recognitionRef.current = recognition
    } catch {
      // Already running, or the browser refused for some other reason -
      // same fail-quiet reasoning as onerror above.
    }
  }, [onUpdate])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
  }, [])

  return { supported, start, stop }
}
