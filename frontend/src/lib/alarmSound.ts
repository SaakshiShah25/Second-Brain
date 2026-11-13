// The alarm's sound and buzz, made in the browser (no audio file): a repeating "beep-beep" from the Web Audio API and a
// vibration pattern (Android; iPhones have no vibration for web apps). It stops by itself after a minute and a half so a
// forgotten alarm doesn't ring all day - the card stays on screen.
const MAX_MS = 90_000

export interface AlarmSound {
  stop: () => void
  /** False when the browser refused to start the sound (no tap yet): call resume() from a tap. */
  playing: () => boolean
  resume: () => void
}

export function startAlarmSound(): AlarmSound {
  let ctx: AudioContext | null = null
  let beepTimer = 0
  let buzzTimer = 0
  let stopTimer = 0
  let stopped = false

  const beep = () => {
    if (!ctx || ctx.state !== 'running') return
    const now = ctx.currentTime
    for (const offset of [0, 0.28]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = 988
      gain.gain.setValueAtTime(0.0001, now + offset)
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.2)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + offset)
      osc.stop(now + offset + 0.22)
    }
  }
  const buzz = () => {
    try {
      navigator.vibrate?.([500, 200, 500, 200, 500])
    } catch {
      // no vibration here - fine
    }
  }

  const api: AlarmSound = {
    stop() {
      stopped = true
      window.clearInterval(beepTimer)
      window.clearInterval(buzzTimer)
      window.clearTimeout(stopTimer)
      try {
        navigator.vibrate?.(0)
      } catch {
        // nothing to cancel
      }
      void ctx?.close().catch(() => {})
      ctx = null
    },
    playing: () => !!ctx && ctx.state === 'running',
    resume() {
      if (stopped) return
      void ctx?.resume().then(() => beep()).catch(() => {})
    },
  }

  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctor) {
      ctx = new Ctor()
      void ctx.resume().catch(() => {})
      beep()
      beepTimer = window.setInterval(beep, 1000)
    }
  } catch {
    ctx = null
  }
  buzz()
  buzzTimer = window.setInterval(buzz, 3000)
  stopTimer = window.setTimeout(() => api.stop(), MAX_MS)
  return api
}
