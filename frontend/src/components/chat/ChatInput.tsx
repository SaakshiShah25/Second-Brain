import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUp, Camera, Check, Loader2, MapPin, Mic, Pause, Play, Plus, Sparkles, Square, Trash2 } from 'lucide-react'
import Sheet from '../Sheet'
import { ListGroup, ListRow, Toggle } from '../ListGroup'
import type { Initiative } from '../../api/types'
import { getInitiativeStyle } from '../../lib/initiativeStyle'

export interface ChatInputHandle {
  focus: () => void
  openCardPicker: () => void
}

// Kept as a JS constant, not just a max-h class, so the auto-resize
// effect below compares against the exact same number when deciding
// whether the textarea has actually overflowed it.
const MAX_HEIGHT = 140

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
  // While recording: pause/resume, and cancel (throw the recording away).
  isPaused?: boolean
  onPauseRecord?: () => void
  onResumeRecord?: () => void
  onCancelRecord?: () => void
  // Opt-in device location - undefined `onToggleLocation` hides the option.
  locationAttached?: boolean
  locationLoading?: boolean
  onToggleLocation?: () => void
  // Category (initiative) for the next note: undefined `onSelectInitiative` hides the option.
  initiatives?: Initiative[]
  selectedInitiativeId?: number | null
  onSelectInitiative?: (id: number | null) => void
  // Business-card scan trigger - undefined hides the option.
  onAttachCard?: (file: File) => void
}

function formatElapsed(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// One-row composer, the layout every mainstream mobile messaging/AI app
// has converged on (WhatsApp, iMessage, ChatGPT): a "+" for the less
// frequent attachments on the left, the text field in the middle, and a
// single trailing button on the right that is the MIC while the field
// is empty and becomes SEND the moment there's text - so voice stays
// one tap away without a second, separate control eating vertical space.
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
    isPaused = false,
    onPauseRecord,
    onResumeRecord,
    onCancelRecord,
    locationAttached = false,
    locationLoading = false,
    onToggleLocation,
    initiatives = [],
    selectedInitiativeId = null,
    onSelectInitiative,
    onAttachCard,
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cardInputRef = useRef<HTMLInputElement>(null)
  const [elapsed, setElapsed] = useState(0)
  const [attachOpen, setAttachOpen] = useState(false)

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    openCardPicker: () => cardInputRef.current?.click(),
  }))

  // Auto-resize to content, capped at MAX_HEIGHT. useLayoutEffect (not
  // useEffect) so the corrected height is applied before paint - avoids
  // the bar visibly jumping one frame per keystroke. overflowY is only
  // switched to auto once content genuinely exceeds the cap, so a
  // single-line field never shows a reserved scrollbar track.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    const overflowing = el.scrollHeight > MAX_HEIGHT
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
    el.style.overflowY = overflowing ? 'auto' : 'hidden'
  }, [value, isRecording])

  // The clock only runs while actually recording: time spent paused isn't counted.
  const accumulatedMs = useRef(0)
  const runningSince = useRef<number | null>(null)
  useEffect(() => {
    if (!isRecording) {
      setElapsed(0)
      accumulatedMs.current = 0
      runningSince.current = null
      return
    }
    if (isPaused) {
      if (runningSince.current !== null) {
        accumulatedMs.current += Date.now() - runningSince.current
        runningSince.current = null
      }
      return
    }
    runningSince.current = Date.now()
    const interval = setInterval(
      () => setElapsed(Math.floor((accumulatedMs.current + Date.now() - (runningSince.current ?? Date.now())) / 1000)),
      250,
    )
    return () => clearInterval(interval)
  }, [isRecording, isPaused])

  // Enter inserts a newline on a phone keyboard (where there's no
  // Shift+Enter) - only a hardware keyboard's plain Enter sends.
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    if (e.key === 'Enter' && !e.shiftKey && !coarse) {
      e.preventDefault()
      onSend()
    }
  }

  const hasText = value.trim().length > 0
  const hasAttachments = Boolean(onAttachCard || onToggleLocation || onSelectInitiative)

  let trailing
  if (isBusy && onStop && !isRecording) {
    trailing = (
      <button
        type="button"
        onClick={onStop}
        aria-label="Stop"
        className="pressable flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-text text-bg"
      >
        <Square size={15} strokeWidth={2} fill="currentColor" />
      </button>
    )
  } else if (isRecording) {
    trailing = (
      <button
        type="button"
        onClick={onToggleRecord}
        aria-label="Finish recording"
        className="pressable flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-danger text-white"
      >
        <Square size={15} strokeWidth={2} fill="currentColor" />
      </button>
    )
  } else if (hasText) {
    trailing = (
      <button
        type="button"
        // Pressing Send must not take focus from the text box: the keyboard
        // closing / the layout changing mid-tap is what made the first press
        // miss. The click itself still fires normally.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSend}
        disabled={disabled}
        aria-label="Send"
        className="pressable flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast disabled:opacity-40"
      >
        <ArrowUp size={21} strokeWidth={2.4} />
      </button>
    )
  } else {
    trailing = (
      <button
        type="button"
        onClick={onToggleRecord}
        disabled={disabled}
        aria-label="Record a voice note"
        className="pressable flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand text-[#1b1a17] disabled:opacity-40"
      >
        <Mic size={21} strokeWidth={2} />
      </button>
    )
  }

  return (
    <>
      <div className="flex items-end gap-2">
        {isRecording && onCancelRecord && (
          <button
            type="button"
            onClick={onCancelRecord}
            aria-label="Cancel recording"
            title="Cancel - discard this recording"
            className="pressable flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-border-strong bg-bg-card text-text-muted"
          >
            <Trash2 size={19} strokeWidth={1.9} />
          </button>
        )}
        {hasAttachments && !isRecording && (
          <button
            type="button"
            onClick={() => setAttachOpen(true)}
            disabled={disabled}
            aria-label="Attach"
            className={`pressable relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-border-strong bg-bg-card text-text-muted disabled:opacity-40`}
          >
            <Plus size={22} strokeWidth={2} />
            {(locationAttached || selectedInitiativeId !== null) && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent" />}
          </button>
        )}

        <div
          className={`flex min-h-11 min-w-0 flex-1 items-center rounded-[1.4rem] border bg-bg-card shadow-card ${
            isRecording ? 'border-danger/40' : 'border-border-strong'
          }`}
        >
          {isRecording ? (
            <div className="flex min-w-0 flex-1 items-center gap-2.5 px-4 py-2.5">
              <span
                className={`h-2 w-2 flex-shrink-0 rounded-full ${isPaused ? 'bg-text-faint' : 'bg-danger'}`}
                style={isPaused ? undefined : { animation: 'pulse-rec 1s infinite' }}
              />
              <span className="flex-shrink-0 text-sm font-medium tabular-nums text-text">{formatElapsed(elapsed)}</span>
              {isPaused ? (
                <span className="min-w-0 flex-1 truncate text-sm text-text-muted">Paused</span>
              ) : value ? (
                // Live browser transcript (useLiveTranscript) - shows the
                // words landing as you speak; Whisper's final transcript
                // replaces it when recording stops.
                <span className="min-w-0 flex-1 truncate text-sm text-text-muted">{value}</span>
              ) : (
                <span className="flex h-5 flex-1 items-center gap-[3px]" aria-hidden="true">
                  {Array.from({ length: 18 }).map((_, i) => (
                    <span
                      key={i}
                      className="h-full w-[3px] origin-center rounded-full bg-danger/70"
                      style={{ animation: `wave ${0.7 + (i % 5) * 0.12}s ease-in-out ${i * 0.05}s infinite` }}
                    />
                  ))}
                </span>
              )}
              {(onPauseRecord || onResumeRecord) && (
                <button
                  type="button"
                  onClick={isPaused ? onResumeRecord : onPauseRecord}
                  aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
                  className="pressable -mr-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-bg-elevated text-text"
                >
                  {isPaused ? <Play size={15} strokeWidth={2.2} fill="currentColor" /> : <Pause size={15} strokeWidth={2.2} fill="currentColor" />}
                </button>
              )}
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
              enterKeyHint="enter"
              style={{ maxHeight: MAX_HEIGHT }}
              className="block min-w-0 flex-1 resize-none overflow-hidden bg-transparent px-4 py-2.5 text-base leading-6 text-text placeholder:text-text-faint focus:outline-none disabled:opacity-50"
            />
          )}
        </div>

        {trailing}
      </div>

      {onAttachCard && (
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
      )}

      {attachOpen && (
        <Sheet onClose={() => setAttachOpen(false)} title="Add to this note">
          <ListGroup>
            {onAttachCard && (
              <ListRow
                icon={Camera}
                label="Scan a business card"
                detail="Take a photo - name, role and company are filled in for you."
                chevron
                onClick={() => {
                  setAttachOpen(false)
                  cardInputRef.current?.click()
                }}
              />
            )}
            {onToggleLocation && (
              <ListRow
                icon={MapPin}
                iconColor="#2563eb"
                label="Attach my location"
                detail="Saved with the next note only."
                trailing={
                  locationLoading ? (
                    <Loader2 size={20} className="animate-spin text-text-muted" />
                  ) : (
                    <Toggle on={locationAttached} onChange={onToggleLocation} label="Attach my location" />
                  )
                }
              />
            )}
          </ListGroup>
          {onSelectInitiative && (
            <ListGroup title="Category for this note" footer="Used for the next note only. “Auto” lets Confía pick from what you write.">
              <ListRow
                icon={Sparkles}
                iconColor="var(--sb-text-muted)"
                soft
                label="Auto"
                detail="Confía picks the category"
                trailing={selectedInitiativeId === null ? <Check size={18} strokeWidth={2.4} className="text-accent" /> : undefined}
                onClick={() => {
                  onSelectInitiative(null)
                  setAttachOpen(false)
                }}
              />
              {initiatives.map((i) => {
                const style = getInitiativeStyle(i)
                return (
                  <ListRow
                    key={i.id}
                    icon={style?.Icon}
                    iconColor={style?.color}
                    soft
                    label={i.name}
                    trailing={selectedInitiativeId === i.id ? <Check size={18} strokeWidth={2.4} className="text-accent" /> : undefined}
                    onClick={() => {
                      onSelectInitiative(i.id)
                      setAttachOpen(false)
                    }}
                  />
                )
              })}
              {initiatives.length === 0 && (
                <p className="px-4 py-3 text-[0.9375rem] text-text-muted">
                  No categories yet. Add some under Notes, then Initiatives.
                </p>
              )}
            </ListGroup>
          )}
        </Sheet>
      )}
    </>
  )
})

export default ChatInput
