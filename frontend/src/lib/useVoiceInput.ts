import { useCallback, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { useTranscribe } from '../api/voice'
import { useLiveTranscript } from './useLiveTranscript'

// "Something went wrong: Error: Couldn't reach…" reads badly - just the message.
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// What went wrong with a recording, shown as a card above the mic (components/chat/VoiceAlert.tsx).
export interface VoiceProblem {
  title: string
  detail: string
}

// Nothing was said: the box stays empty and the person is told so - never text they did not speak.
export const NOTHING_HEARD: VoiceProblem = {
  title: "We didn't catch that",
  detail: 'Nothing was heard, so nothing was saved. Speak a little closer to the mic, or type your note.',
}
const NO_MICROPHONE: VoiceProblem = {
  title: "Can't use your microphone",
  detail: 'Allow microphone access for this app in your browser or phone settings, then try again.',
}

// The recording counts as speech once the microphone level is clearly above room noise for a moment.
const SPEECH_LEVEL = 0.02 // RMS of the waveform, 0-1 (quiet room noise is well under 0.01; speaking is 0.05+)
const SPEECH_FRAMES = 3 // of ~100 ms each, so a cough or a click is not enough

interface Options {
  // Where words appear while you speak (the browser's live preview) and the box is cleared when recording starts.
  setText: (text: string) => void
  // Whisper's final transcript. It is put in the box for the user to review - never sent on its own.
  onTranscript: (transcript: string) => void
  // True while the recording is being turned into text (the caller can lock its send button).
  onBusyChange?: (busy: boolean) => void
}

// Record, pause, resume, cancel and transcribe - the voice half of the composer, shared by the Home chat and the
// Today box so both behave exactly the same.
export function useVoiceInput({ setText, onTranscript, onBusyChange }: Options) {
  const [problem, setProblem] = useState<VoiceProblem | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const cancelledRef = useRef(false) // set when the user discards a recording instead of finishing it
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const loudFramesRef = useRef(0) // how many ~100 ms readings of the microphone were clearly louder than room noise
  const meterRef = useRef<{ stop: () => void; reliable: () => boolean } | null>(null)
  const transcribe = useTranscribe()
  // Live "types out as you speak" preview (see useLiveTranscript.ts) - a browser-native best-effort layer on top
  // of the real recording; Whisper's transcript replaces it with a more accurate final version.
  const liveTranscript = useLiveTranscript(setText)

  async function start() {
    setProblem(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      // Mic permission denied, no microphone, or the OS blocked it (e.g. Android's system dialog was dismissed).
      // A clear message matters doubly on the Android TWA wrapper, where a denied permission is easy to run into.
      setProblem(NO_MICROPHONE)
      return
    }
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    loudFramesRef.current = 0
    meterRef.current = startMeter(stream, () => (loudFramesRef.current += 1))
    setText('')
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
    recorder.onstop = async () => {
      liveTranscript.stop()
      stream.getTracks().forEach((t) => t.stop())
      const metered = meterRef.current
      meterRef.current?.stop()
      meterRef.current = null
      if (cancelledRef.current) {
        // discarded: nothing is transcribed, nothing is kept
        cancelledRef.current = false
        chunksRef.current = []
        return
      }
      // The level meter heard nothing but silence: don't send it (the transcriber would invent words for it).
      if (metered?.reliable() && loudFramesRef.current < SPEECH_FRAMES) {
        setText('')
        setProblem(NOTHING_HEARD)
        return
      }
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      onBusyChange?.(true)
      try {
        const { transcript } = await transcribe.mutateAsync(blob)
        onTranscript(transcript)
      } catch (err) {
        // The server found no speech in it (422): say so plainly, not as a failure.
        setProblem(err instanceof ApiError && err.status === 422 ? NOTHING_HEARD : { title: "Voice didn't work", detail: `Nothing was saved. ${errorText(err)}` })
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

  const clearProblem = useCallback(() => setProblem(null), [])

  return { isRecording, isPaused, isTranscribing: transcribe.isPending, problem, clearProblem, start, stop, pause, resume, cancel }
}

// Watches the microphone level while recording and calls `onLoud` for every ~100 ms reading that is clearly speech-loud.
// Returns null where the browser has no way to measure it (then the recording is simply sent, as before).
function startMeter(stream: MediaStream, onLoud: () => void): { stop: () => void; reliable: () => boolean } | null {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    const ctx = new Ctx()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(analyser)
    const data = new Float32Array(analyser.fftSize)
    void ctx.resume().catch(() => {}) // some phones start it suspended, which reads as silence
    let readings = 0 // readings taken while the meter was really running
    const timer = window.setInterval(() => {
      if (ctx.state !== 'running') return
      readings += 1
      analyser.getFloatTimeDomainData(data)
      let sum = 0
      for (const v of data) sum += v * v
      if (Math.sqrt(sum / data.length) > SPEECH_LEVEL) onLoud()
    }, 100)
    return {
      stop: () => {
        window.clearInterval(timer)
        void ctx.close().catch(() => {})
      },
      // Only trust "it was silent" if the meter ran for a good part of the recording.
      reliable: () => readings >= 10,
    }
  } catch {
    return null
  }
}
