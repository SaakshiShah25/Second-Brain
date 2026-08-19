import { useCallback, useEffect, useRef, useState } from 'react'

// Strips markdown syntax so the browser's TTS engine doesn't read out
// literal asterisks/hashes/brackets - it only needs to sound natural, not
// preserve formatting.
export function stripMarkdownForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim()
}

// Wraps the browser's built-in SpeechSynthesis API (no backend/API key
// needed) - lower voice quality than a real TTS model, but free, instant,
// and works offline once the page is loaded, which matters for the
// "listening while driving" use case this is built for.
export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const speak = useCallback(
    (text: string) => {
      if (!supported) return
      const clean = stripMarkdownForSpeech(text)
      if (!clean) return
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(clean)
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utterance)
      setIsSpeaking(true)
    },
    [supported],
  )

  const stop = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [supported])

  // Stop-on-unmount ref keeps the cleanup effect independent of `stop`'s
  // identity so it only ever runs once, on actual unmount.
  const stopRef = useRef(stop)
  stopRef.current = stop
  useEffect(() => () => stopRef.current(), [])

  return { supported, isSpeaking, speak, stop }
}
