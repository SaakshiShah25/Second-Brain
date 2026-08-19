import { Square, Volume2 } from 'lucide-react'
import { useSpeech } from '../lib/speech'
import Button from './Button'

export default function SpeakButton({ text }: { text: string }) {
  const { supported, isSpeaking, speak, stop } = useSpeech()

  if (!supported || !text.trim()) return null

  return (
    <Button
      type="button"
      onClick={() => (isSpeaking ? stop() : speak(text))}
      className="flex-shrink-0"
      title={isSpeaking ? 'Stop reading' : 'Listen to this'}
    >
      <span className="flex items-center gap-1.5">
        {isSpeaking ? <Square size={13} strokeWidth={2} /> : <Volume2 size={13} strokeWidth={2} />}
        {isSpeaking ? 'Stop' : 'Listen'}
      </span>
    </Button>
  )
}
