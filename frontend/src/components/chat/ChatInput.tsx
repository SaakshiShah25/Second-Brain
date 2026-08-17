import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Loader2, MapPin, Mic } from 'lucide-react'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  placeholder: string
  disabled: boolean
  isRecording: boolean
  onToggleRecord: () => void
  // Opt-in device location (see ChatPage.tsx) - undefined `onToggleLocation`
  // hides the button entirely (e.g. in Ask mode, where a location doesn't apply).
  locationAttached?: boolean
  locationLoading?: boolean
  onToggleLocation?: () => void
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  placeholder,
  disabled,
  isRecording,
  onToggleRecord,
  locationAttached = false,
  locationLoading = false,
  onToggleLocation,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [elapsed, setElapsed] = useState(0)

  // Auto-resize the textarea to fit its content, capped by max-h-40 below.
  // Resets to '0px' (not 'auto') before measuring - with box-sizing:
  // border-box (Tailwind's preflight default), 'auto' can leave scrollHeight
  // reporting the previous rendered box instead of the content's natural
  // height once max-height is already constraining it.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  useEffect(() => {
    if (!isRecording) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 200)
    return () => clearInterval(interval)
  }, [isRecording])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="flex items-end gap-2 rounded-2xl border border-border-strong bg-bg-card p-2">
      <button
        type="button"
        onClick={onToggleRecord}
        disabled={disabled && !isRecording}
        title={isRecording ? 'Stop recording' : 'Record a voice note'}
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-base transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          isRecording ? 'bg-danger/20 text-danger' : 'text-text-muted hover:bg-bg-hover hover:text-text'
        }`}
      >
        {isRecording ? (
          <span className="h-2.5 w-2.5 rounded-full bg-danger" style={{ animation: 'pulse-rec 1s infinite' }} />
        ) : (
          <Mic size={17} strokeWidth={2} />
        )}
      </button>

      {onToggleLocation && (
        <button
          type="button"
          onClick={onToggleLocation}
          disabled={disabled || locationLoading}
          title={locationAttached ? 'Remove location' : 'Add my location'}
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            locationAttached ? 'bg-accent-soft text-accent' : 'text-text-muted hover:bg-bg-hover hover:text-text'
          }`}
        >
          {locationLoading ? (
            <Loader2 size={17} strokeWidth={2} className="animate-spin" />
          ) : (
            <MapPin size={17} strokeWidth={2} />
          )}
        </button>
      )}

      {isRecording ? (
        <div className="flex flex-1 items-center px-2 py-2 text-sm text-text-muted">Recording… {elapsed}s</div>
      ) : (
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none disabled:opacity-50"
        />
      )}

      <button
        type="button"
        onClick={onSend}
        disabled={disabled || isRecording || !value.trim()}
        className="flex-shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        Send
      </button>
    </div>
  )
}
