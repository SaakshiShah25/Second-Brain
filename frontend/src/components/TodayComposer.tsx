import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useChat } from '../api/chat'
import { ApiError } from '../api/client'
import { useInitiatives } from '../api/initiatives'
import type { CaptureSavedResult, ChatResult } from '../api/types'
import { isOffline } from '../lib/connection'
import { showError } from '../lib/errorDialog'
import { deleteCapture } from '../lib/undoCapture'
import { useVoiceInput } from '../lib/useVoiceInput'
import CaptureReply from './chat/CaptureReply'
import ChatInput, { type ChatInputHandle } from './chat/ChatInput'

// How long the "saved" card stays before it tidies itself away (the lists above already show the result).
const CARD_SECONDS = 15

// The Today screen's box: the same input as Home (type, or tap the mic), but it only ever SAVES - whatever is typed
// or said becomes tasks and notes, and a question is never answered here (the server points it to Home). After a
// save, a small card shows exactly what was filed, with Change and Undo; the lists above refresh themselves.
export default function TodayComposer() {
  const queryClient = useQueryClient()
  const { data: initiatives = [] } = useInitiatives()
  const chat = useChat()
  const inputRef = useRef<ChatInputHandle>(null)
  const [text, setText] = useState('')
  const [spaceId, setSpaceId] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [saved, setSaved] = useState<{ capture: CaptureSavedResult; undone: boolean } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const voice = useVoiceInput({
    setText,
    onTranscript: (transcript) => {
      setText(transcript) // to review before it is saved - never saved on its own
      inputRef.current?.focus()
    },
    onError: setNotice,
    onBusyChange: setTranscribing,
  })

  // The card and any notice tidy themselves away; touching the card (Change, Undo) starts the clock again.
  useEffect(() => {
    if (!saved && !notice) return
    const timer = setTimeout(() => {
      setSaved(null)
      setNotice(null)
    }, CARD_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [saved, notice])

  function showSaved(capture: CaptureSavedResult) {
    setNotice(null)
    setSaved({ capture, undone: false })
  }

  function handleResult(result: ChatResult, sentText: string) {
    if (result.intent === 'capture') {
      showSaved(result)
    } else if (result.intent === 'command') {
      // "Create a list called…": done by the app; say so, and show anything it went on to add.
      for (const what of result.changed) queryClient.invalidateQueries({ queryKey: [what] })
      if (result.capture) showSaved(result.capture)
      else {
        setSaved(null)
        setNotice(result.answer)
      }
    } else {
      // Blocked, or a question (told to ask on Home), or answered after all: a plain message, nothing saved.
      setSaved(null)
      setNotice(result.answer)
      // A question is not lost - it stays in the box to be moved to Home; so does text the AI couldn't handle.
      if (result.intent === 'blocked' && (result.reason === 'question' || result.reason === 'unavailable')) setText((cur) => cur || sentText)
    }
  }

  async function send() {
    const sentText = text.trim()
    if (!sentText || sending) return
    if (isOffline()) {
      // Nothing to send it with: keep the text in the box so it isn't lost.
      setNotice("You're offline, so that wasn't saved. It's still in the box - save it once you're back online.")
      return
    }
    setSending(true)
    setNotice(null)
    setText('')
    try {
      const result = await chat.mutateAsync({ body: { text: sentText, history: [], initiativeId: spaceId, saveOnly: true } })
      if (result.intent === 'capture') setSpaceId(null) // the chosen space is for one note, like on Home
      handleResult(result, sentText)
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : `Something went wrong: ${String(err)}`)
      showError(err)
      setText((cur) => cur || sentText) // hand the text back for a retry
    } finally {
      setSending(false)
    }
  }

  async function undo() {
    if (!saved || saved.undone) return
    await deleteCapture(saved.capture, queryClient)
    setSaved({ ...saved, undone: true })
  }

  return (
    <div className="flex flex-col gap-2.5">
      {(saved || notice) && (
        <div className="relative max-h-[40vh] overflow-y-auto rounded-2xl">
          {saved ? (
            <CaptureReply
              result={saved.capture}
              undone={saved.undone}
              onUndo={undo}
              onChange={(capture) => setSaved((cur) => (cur ? { ...cur, capture } : cur))}
            />
          ) : (
            <p className="rounded-2xl border border-border bg-bg-card px-4 py-3 pr-10 text-[0.9375rem] leading-snug text-text-muted">{notice}</p>
          )}
          {!saved && (
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
              className="pressable absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full text-text-faint"
            >
              <X size={15} strokeWidth={2} />
            </button>
          )}
        </div>
      )}
      <ChatInput
        ref={inputRef}
        value={text}
        onChange={setText}
        onSend={send}
        placeholder="Add a task or note, or tap the mic…"
        disabled={(sending || transcribing) && !voice.isRecording}
        isBusy={sending || transcribing}
        isRecording={voice.isRecording}
        onToggleRecord={voice.isRecording ? voice.stop : voice.start}
        isPaused={voice.isPaused}
        onPauseRecord={voice.pause}
        onResumeRecord={voice.resume}
        onCancelRecord={voice.cancel}
        initiatives={initiatives}
        selectedInitiativeId={spaceId}
        onSelectInitiative={setSpaceId}
      />
    </div>
  )
}
