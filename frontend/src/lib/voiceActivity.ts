// Did anyone actually speak? Decided from the microphone's own level while
// recording, BEFORE anything is uploaded. Whisper can't answer this for us:
// handed silence or room noise it invents a plausible filler transcript
// ("Thank you.", "I'm going to go.") with full confidence, so the only
// reliable place to catch an empty recording is on the device, where the
// real signal level is known - which also saves a transcription call.

export const FRAME_MS = 50
// ~250ms of speech-level sound. A click, a bump or a cough is a frame or
// two; actual speech is dozens of frames.
const MIN_VOICED_FRAMES = 5
// Floor for "loud enough to be speech" on a normalized 0-1 signal. Quiet
// rooms sit well under this, ordinary conversation well over it.
const ABSOLUTE_MIN_LEVEL = 0.012
// A frame only counts as voiced if it stands clear of this recording's own
// background level. Browsers apply automatic gain control, which cranks the
// volume up when nobody is talking - so silence on a gain-boosted mic can
// look "loud" in absolute terms, but never loud relative to itself.
const NOISE_FLOOR_MULTIPLIER = 3

/** `frameLevels` is one RMS level (0-1) per FRAME_MS of recording. */
export function heardSpeech(frameLevels: number[]): boolean {
  if (frameLevels.length < 6) return false // under ~300ms of audio at all
  const sorted = [...frameLevels].sort((a, b) => a - b)
  const noiseFloor = sorted[Math.floor(sorted.length * 0.1)]
  const threshold = Math.max(ABSOLUTE_MIN_LEVEL, noiseFloor * NOISE_FLOOR_MULTIPLIER)
  return frameLevels.filter((level) => level > threshold).length >= MIN_VOICED_FRAMES
}

export interface VoiceMeter {
  /** Stops listening and reports whether speech was heard. */
  stop: () => boolean
}

/** Starts measuring `stream`'s level. Returns null if the browser can't
 * (no Web Audio) - callers must treat that as "assume speech" and let the
 * normal transcription path decide, so a quirky browser never blocks
 * recording. */
export function startVoiceMeter(stream: MediaStream): VoiceMeter | null {
  try {
    const AudioCtx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return null
    const ctx = new AudioCtx()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    const buffer = new Float32Array(analyser.fftSize)
    const levels: number[] = []

    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buffer)
      let sum = 0
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
      levels.push(Math.sqrt(sum / buffer.length))
    }, FRAME_MS)

    return {
      stop: () => {
        window.clearInterval(timer)
        source.disconnect()
        void ctx.close()
        return heardSpeech(levels)
      },
    }
  } catch {
    return null
  }
}
