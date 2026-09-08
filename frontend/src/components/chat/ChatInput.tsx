import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Camera, Loader2, MapPin, Mic, Square } from 'lucide-react'

export interface ChatInputHandle {
  focus: () => void
}

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  placeholder: string
  disabled: boolean
  isBusy: boolean
  onStop?: () => void
  isRecording: boolean
  onToggleRecord: () => void
  // Opt-in device location - undefined `onToggleLocation` hides the button.
  locationAttached?: boolean
  locationLoading?: boolean
  onToggleLocation?: () => void
  // Business-card scan trigger - undefined hides the button.
  onAttachCard?: (file: File) => void
}

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  {
    value,
    onChange,
    onSend,
    placeholder,
    disabled,
    isBusy,
    onStop,
    isRecording,
    onToggleRecord,
    locationAttached = false,
    locationLoading = false,
    onToggleLocation,
    onAttachCard,
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cardInputRef = useRef<HTMLInputElement>(null)
  const [elapsed, setElapsed] = useState(0)

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }))

  // Auto-resize the textarea to fit its content, capped by max-h-40 below.
  // useLayoutEffect, NOT useEffect - this must run BEFORE the browser
  // paints. useEffect fires after paint, so on every keystroke the
  // browser would paint one frame with the OLD (too-short) height first
  // - the row's height comes from its tallest child under items-end, so
  // that stale-height frame flashes the whole input bar (and the
  // camera/location/Send buttons riding along the bottom of it) at the
  // wrong height for an instant before snapping to the corrected one.
  // At normal typing speed that reads as the buttons visibly jumping/
  // misaligning on every character. useLayoutEffect closes that gap by
  // correcting the height synchronously before anything is painted.
  useLayoutEffect(() => {
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

  // The record/stop button lives as its own round element below the text
  // field entirely - not nested inside the same bordered input bar as the
  // camera/location icons and textarea - so it reads as a distinct,
  // deliberate control rather than another item crammed into a text
  // field's toolbar. It only appears when there's no typed text to send,
  // so typing still gets a normal compact Send pill inline instead.
  const showRecordButton = (isBusy && onStop) || isRecording || !value.trim()

  return (
    <div className="flex flex-col items-center gap-3">
      {/* rounded-[1.75rem], not rounded-full: a true pill (border-radius:
          9999px) looks right for a short single-line box, since the
          radius naturally caps at half the box's own height - but as
          multi-line text grows this bar much taller, that SAME cap grows
          right along with it, so the curve balloons and eats into the
          sides, squeezing the button row against it. A fixed radius
          (~half the single-line collapsed height, so it still reads as
          a pill when short) keeps a consistent, sane rounded-rectangle
          shape no matter how tall the box gets instead. */}
      <div className="flex w-full items-end gap-1.5 rounded-[1.75rem] border border-border-strong bg-bg-card p-1.5 shadow-sm">
        {onAttachCard && (
          <>
            <button
              type="button"
              onClick={() => cardInputRef.current?.click()}
              disabled={disabled}
              title="Scan a business card"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Camera size={19} strokeWidth={1.6} />
            </button>
            <input
              ref={cardInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onAttachCard(file)
                e.target.value = ''
              }}
            />
          </>
        )}

        {onToggleLocation && (
          <button
            type="button"
            onClick={onToggleLocation}
            disabled={disabled || locationLoading}
            title={locationAttached ? 'Remove location' : 'Add my location'}
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              locationAttached ? 'bg-accent-soft text-accent' : 'text-text-muted hover:bg-bg-hover hover:text-text'
            }`}
          >
            {locationLoading ? (
              <Loader2 size={18} strokeWidth={1.6} className="animate-spin" />
            ) : (
              <MapPin size={18} strokeWidth={1.6} />
            )}
          </button>
        )}

        {isRecording ? (
          <div className="flex flex-1 items-center gap-2 px-3 py-2.5 text-sm text-text-muted">
            <span className="h-2 w-2 rounded-full bg-danger" style={{ animation: 'pulse-rec 1s infinite' }} />
            Recording… {elapsed}s
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2.5 text-[0.9375rem] text-text placeholder:text-text-faint focus:outline-none disabled:opacity-50"
          />
        )}

        {!showRecordButton && (
          <button
            type="button"
            onClick={onSend}
            disabled={disabled}
            className="flex h-11 flex-shrink-0 items-center justify-center rounded-full bg-accent px-5 text-[0.9375rem] font-semibold text-accent-contrast shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        )}
      </div>

      {/* A big, round, standalone primary action - deliberately separate
          from the text field above it, matching how a camera shutter or
          Voice Memos' record button isn't part of any other control. */}
      {showRecordButton &&
        (isBusy && onStop ? (
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={onStop}
              className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger shadow-sm transition-colors hover:bg-danger/25"
            >
              <Square size={24} strokeWidth={1.6} fill="currentColor" />
            </button>
            <span className="text-xs font-medium text-text-muted">Stop</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleRecord}
              disabled={disabled}
              className={`flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isRecording ? 'bg-danger text-white hover:bg-danger/85' : 'bg-accent text-accent-contrast hover:bg-accent-hover'
              }`}
            >
              {isRecording ? (
                <Square size={26} strokeWidth={1.6} fill="currentColor" />
              ) : (
                <Mic size={28} strokeWidth={1.6} />
              )}
            </button>
            <span className="text-xs font-medium text-text-muted">
              {isRecording ? 'Stop recording' : 'Tap to record'}
            </span>
          </div>
        ))}
    </div>
  )
})

export default ChatInput
