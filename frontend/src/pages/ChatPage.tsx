import { useEffect, useRef, useState } from 'react'
import { ListTodo, MapPin, MessageCircleQuestion, Mic, SquarePen, Tag, X } from 'lucide-react'
import { useChat } from '../api/chat'
import { useCreateInitiative, useInitiatives } from '../api/initiatives'
import { useUpdateInteraction } from '../api/notes'
import { useTranscribe } from '../api/voice'
import type { CaptureSavedResult, ChatMessage, ChatResult } from '../api/types'
import Button from '../components/Button'
import Card from '../components/Card'
import ConfiaLogo from '../components/ConfiaLogo'
import ConfirmDialog from '../components/ConfirmDialog'
import { ProfileButton } from '../components/PageHeader'
import Greeting from '../components/Greeting'
import { Input } from '../components/fields'
import ChatBubble from '../components/chat/ChatBubble'
import TypingIndicator from '../components/chat/TypingIndicator'
import ChatInput, { type ChatInputHandle } from '../components/chat/ChatInput'
import { useChatSession } from '../chat/ChatSessionContext'
import { useLiveTranscript } from '../lib/useLiveTranscript'
import { dueLabel } from '../lib/dates'
import { useUsageMode } from '../lib/usageMode'

// One shared soft tint for every Home starter tile - the tiles are
// equal-weight shortcuts, so a different hue on each only added noise.
const STARTER_TINT = 'bg-accent-soft text-accent'

// "Something went wrong: Error: Couldn't reach…" reads badly - just the message.
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function formatSavedMessage(result: CaptureSavedResult): string {
  const lines: string[] = []
  // Omitted entirely for Uncategorized rather than shown as "none",
  // same convention as every other optional field here; the
  // suggested_initiative follow-up prompt covers that case instead.
  if (result.initiative_name) lines.push(`**Category:** ${result.initiative_name}`)
  if (result.summary) lines.push(`**Summary:** ${result.summary}`)
  if (result.decisions.length > 0) {
    lines.push('**Decisions:**')
    for (const d of result.decisions) lines.push(`- ${d}`)
  }
  if (result.concerns.length > 0) {
    lines.push('**Concerns:**')
    for (const c of result.concerns) lines.push(`- ${c}`)
  }
  if (result.tasks_created.length > 0) {
    lines.push('**Tasks:**')
    for (const t of result.tasks_created) {
      const owner = t.owner === 'them' ? 'Someone else' : 'Me'
      lines.push(`- ${t.description}${t.due_date ? ` _(due ${dueLabel(t.due_date, t.due_time)})_` : ''} — ${owner}`)
    }
  }
  if (result.date_warning) lines.push(`_Note: ${result.date_warning}_`)
  for (const skipped of result.skipped_due_dates) {
    lines.push(
      `_Note: couldn't set a due date for "${skipped.description}" (got '${skipped.raw_due_date}') - saved without one_`,
    )
  }
  if (result.maps_url) {
    const label = result.geo_address ?? 'attached location'
    lines.push(`**Location:** [${label}](${result.maps_url})`)
  }
  return lines.join('\n\n')
}

export default function ChatPage() {
  const { messages, setMessages } = useChatSession()
  const [inputText, setInputText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const cancelledRef = useRef(false) // set when the user discards a recording instead of finishing it
  const [isBusy, setIsBusy] = useState(false)
  const [stage, setStage] = useState<string | null>(null)
  const [selectedInitiativeId, setSelectedInitiativeId] = useState<number | null>(null)
  const { data: initiativeList = [] } = useInitiatives()
  const selectedInitiative = initiativeList.find((i) => i.id === selectedInitiativeId) ?? null
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)
  // A capture that didn't fit any existing initiative but reads like a
  // substantial-enough theme to deserve its own (extraction.py's
  // "suggested_initiative") - offered as a one-off yes/no prompt after
  // the note has already saved, never blocking the save itself (see
  // handleSavedCapture below).
  const [pendingInitiativeSuggestion, setPendingInitiativeSuggestion] = useState<{
    name: string
    interactionId: number
  } | null>(null)
  const [namingCustomInitiative, setNamingCustomInitiative] = useState(false)
  const [customInitiativeName, setCustomInitiativeName] = useState('')
  const [confirmingClear, setConfirmingClear] = useState(false)
  const usage = useUsageMode()

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const scrollAnchorRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<ChatInputHandle>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const chatMutation = useChat()
  const transcribe = useTranscribe()
  const createInitiative = useCreateInitiative()
  const updateInteraction = useUpdateInteraction()
  // Live "types out as you speak" preview while recording (see
  // useLiveTranscript.ts) - a browser-native best-effort layer on top of
  // the actual recording; Whisper's transcript (below) still replaces
  // this with a more accurate final version the moment recording stops.
  const liveTranscript = useLiveTranscript(setInputText)

  // Scrolls Layout's own scroll container all the way down, rather than
  // scrollIntoView on the anchor - the composer is sticky over the bottom
  // of that container, so aligning the anchor to the viewport's bottom
  // edge would leave the newest message hidden behind it.
  useEffect(() => {
    if (messages.length === 0 && !pendingInitiativeSuggestion && !isBusy) return
    const scroller = scrollAnchorRef.current?.closest('#app-scroll')
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  }, [messages, pendingInitiativeSuggestion, isBusy])

  function appendMessage(role: 'user' | 'assistant', content: string, extras: Partial<ChatMessage> = {}) {
    setMessages((prev) => [...prev, { role, content, ...extras }])
  }

  function toggleLocation() {
    if (pendingLocation) {
      setPendingLocation(null)
      return
    }
    if (!navigator.geolocation) {
      appendMessage('assistant', "This browser doesn't support location.", { status: true })
      return
    }
    setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPendingLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationLoading(false)
      },
      () => {
        appendMessage('assistant', "Couldn't get your location - check your browser's location permission for this site.", { status: true })
        setLocationLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  // Posts the usual saved-note summary, then separately offers the
  // new-initiative suggestion if extraction.py proposed one.
  function handleSavedCapture(result: CaptureSavedResult) {
    appendMessage('assistant', formatSavedMessage(result))
    if (result.suggested_initiative) {
      setNamingCustomInitiative(false)
      setCustomInitiativeName('')
      setPendingInitiativeSuggestion({ name: result.suggested_initiative, interactionId: result.interaction_id })
    }
  }

  function handleChatResult(result: ChatResult, sentText: string) {
    if (result.intent === 'blocked') {
      // Failed the safety check, or asked for something this product
      // isn't built to do (a joke, code, a story) - either way, a plain message.
      appendMessage('assistant', result.answer, {
        status: true,
        // Only the "not something I can help with" refusal can be a misread to-do - not a safety block.
        ...(result.reason === 'out_of_scope' && sentText ? { saveAsNote: sentText } : {}),
      })
    } else if (result.intent === 'capture') {
      handleSavedCapture(result)
    } else {
      appendMessage('assistant', result.answer, result.sources?.length ? { sources: result.sources } : {})
    }
  }

  // Three ways to resolve the suggestion: accept it as-is, swap in a name
  // the user types themselves (same create+tag flow, just a different
  // name), or decline it entirely (note stays in Others). `customName` is
  // only read for the 'custom' choice.
  function resolveInitiativeSuggestion(choice: 'accept' | 'custom' | 'decline', customName?: string) {
    if (!pendingInitiativeSuggestion) return
    const { name: suggestedName, interactionId } = pendingInitiativeSuggestion
    if (choice === 'decline') {
      setPendingInitiativeSuggestion(null)
      appendMessage('assistant', `Okay, left it in Others.`, { status: true })
      return
    }
    const name = choice === 'custom' ? (customName ?? '').trim() : suggestedName
    if (!name) return
    setPendingInitiativeSuggestion(null)
    createInitiative.mutate(
      { name },
      {
        onSuccess: (initiative) => {
          updateInteraction.mutate(
            { interactionId, fields: { initiative_id: initiative.id } },
            {
              onSuccess: () => appendMessage('assistant', `Added **${initiative.name}** and tagged this note with it.`, { status: true }),
              onError: () => appendMessage('assistant', `Created **${name}**, but couldn't tag this note with it - you can do that from the Notes page.`, { status: true }),
            },
          )
        },
        onError: () => appendMessage('assistant', `Couldn't create that initiative - please try again from the Notes tab.`, { status: true }),
      },
    )
  }

  async function submitText(text: string, asNote = false) {
    if (!text.trim() || isBusy) return
    const historyForRequest = messages.map(({ role, content }) => ({ role, content }))
    if (!asNote) appendMessage('user', text) // "save it as a note" re-sends text that is already on screen
    setIsBusy(true)
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      const result = await chatMutation.mutateAsync({
        body: {
          text,
          history: historyForRequest,
          geoLat: pendingLocation?.lat,
          geoLng: pendingLocation?.lng,
          initiativeId: selectedInitiativeId,
          asNote,
        },
        signal: controller.signal,
        onStage: setStage,
      })
      setPendingLocation(null) // one-shot per note, not sticky across future sends
      if (result.intent === 'capture') setSelectedInitiativeId(null) // likewise the chosen category
      handleChatResult(result, text)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        appendMessage('assistant', '_Stopped._', { status: true })
      } else {
        appendMessage('assistant', `Something went wrong: ${errorText(err)}`, { status: true })
      }
    } finally {
      setIsBusy(false)
      setStage(null)
      abortControllerRef.current = null
    }
  }

  function stopRequest() {
    abortControllerRef.current?.abort()
  }

  async function startRecording() {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      // Mic permission denied, no microphone available, or the browser/
      // OS blocked it outright (e.g. Android's system permission dialog
      // was dismissed) - previously this rejected silently with no
      // feedback at all, since getUserMedia() was awaited with nothing
      // to catch it. A clear message here matters doubly on the Android
      // TWA wrapper, where a denied permission is easy to run into on
      // first use.
      appendMessage(
        'assistant',
        "Couldn't access your microphone - check that this app has microphone permission, then try again.",
        { status: true },
      )
      return
    }
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    setInputText('')
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
    recorder.onstop = async () => {
      liveTranscript.stop()
      stream.getTracks().forEach((t) => t.stop())
      if (cancelledRef.current) {  // discarded: nothing is transcribed, nothing is kept
        cancelledRef.current = false
        chunksRef.current = []
        return
      }
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      setIsBusy(true)
      try {
        const { transcript } = await transcribe.mutateAsync(blob)
        // Whisper's transcript replaces whatever the live browser preview
        // showed - it's the more accurate, authoritative result. Populate
        // the input rather than auto-sending, so the user can review/edit
        // a misheard word before it goes anywhere.
        setInputText(transcript)
        chatInputRef.current?.focus()
      } catch (err) {
        appendMessage('assistant', `Voice transcription failed: ${errorText(err)}`, { status: true })
      } finally {
        setIsBusy(false)
      }
    }
    recorder.start()
    liveTranscript.start()
    mediaRecorderRef.current = recorder
    setIsRecording(true)
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
    setIsPaused(false)
  }

  function pauseRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== 'recording') return
    recorder.pause()
    liveTranscript.stop() // the live words are only a preview; the real transcript comes at the end
    setIsPaused(true)
  }

  function resumeRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== 'paused') return
    recorder.resume()
    liveTranscript.start()
    setIsPaused(false)
  }

  function cancelRecording() {
    cancelledRef.current = true
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
    setIsPaused(false)
    setInputText('')
  }

  const hasPending = pendingInitiativeSuggestion !== null
  const showTyping = isBusy && !hasPending && !isRecording && !transcribe.isPending
  const isEmpty = messages.length === 0 && !hasPending

  // Starters for the empty state - each one is a real shortcut into the
  // same flows the composer offers, not decorative copy - tailored to what
  // the account is used for (Settings > Using MyConfía for).
  function prefill(text: string) {
    setInputText(text)
    chatInputRef.current?.focus()
  }
  const starters = {
    work: [
      { icon: Mic, title: 'Log a meeting', body: 'Talk through what was said and agreed', onClick: () => startRecording() },
      { icon: ListTodo, title: 'Add a task', body: '“Send the deck by 6pm today”', onClick: () => prefill('Send ') },
      { icon: MessageCircleQuestion, title: 'Ask your notes', body: '“What did I note about…”', onClick: () => prefill('What did I note about ') },
    ],
    personal: [
      { icon: Mic, title: 'Capture a thought', body: 'Say it out loud — I’ll sort it', onClick: () => startRecording() },
      { icon: ListTodo, title: 'Add a reminder', body: '“Call the plumber tomorrow at 5pm”', onClick: () => prefill('Call ') },
      { icon: MessageCircleQuestion, title: 'Ask your notes', body: '“What’s coming up this week?”', onClick: () => prefill('What’s coming up this week?') },
    ],
    both: [
      { icon: Mic, title: 'Talk it through', body: 'Record what happened or what’s on your mind', onClick: () => startRecording() },
      { icon: ListTodo, title: 'Add a task', body: '“Pay the invoice by Friday”', onClick: () => prefill('Pay ') },
      { icon: MessageCircleQuestion, title: 'Ask your notes', body: '“What’s overdue?”', onClick: () => prefill('What’s overdue?') },
    ],
  }[usage.mode]

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-11 items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center text-text">
          <ConfiaLogo size={24} />
        </span>
        <span className="text-[1.0625rem] font-semibold tracking-[-0.02em]">MyConfía</span>
        <span className="flex-1" />
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            disabled={isBusy}
            aria-label="New conversation"
            className="pressable flex h-9 w-9 items-center justify-center rounded-full text-text-muted disabled:opacity-40"
          >
            <SquarePen size={20} strokeWidth={1.8} />
          </button>
        )}
        <ProfileButton />
      </header>

      <div className="flex flex-1 flex-col gap-5 pt-4 pb-4">
        {isEmpty && (
          <div className="flex flex-1 flex-col justify-end pb-2">
            <Greeting />
            <p className="mt-2 mb-6 max-w-xs text-[0.9375rem] leading-relaxed text-text-muted">
              {usage.mode === 'personal'
                ? 'Jot down anything, or ask about what you’ve noted.'
                : 'Jot down a note or a task, or ask about what you’ve logged.'}
            </p>
            <div className="flex flex-col gap-2.5">
              {starters.map(({ icon: Icon, title, body, onClick }) => (
                <button
                  key={title}
                  type="button"
                  onClick={onClick}
                  disabled={isBusy}
                  className="pressable flex items-center gap-3.5 rounded-2xl border border-border bg-bg-card p-3.5 text-left shadow-card disabled:opacity-50"
                >
                  <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${STARTER_TINT}`}>
                    <Icon size={21} strokeWidth={2} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.9375rem] font-semibold">{title}</span>
                    <span className="block truncate text-sm text-text-muted">{body}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <ChatBubble
            key={i}
            message={m}
            onSaveAsNote={i === messages.length - 1 && !isBusy ? (t) => submitText(t, true) : undefined}
          />
        ))}

        {pendingInitiativeSuggestion && (
          <Card style={{ animation: 'fade-in 0.2s ease-out' }}>
            <div className="mb-3 flex items-start gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                <Tag size={18} strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.8125rem] font-medium text-text-muted">New category?</p>
                <p className="text-[1rem] leading-snug font-semibold">{pendingInitiativeSuggestion.name}</p>
                <p className="mt-0.5 text-[0.875rem] leading-snug text-text-muted">
                  This note seems to belong to a category you don't have yet.
                </p>
              </div>
            </div>
            {namingCustomInitiative ? (
              <div className="flex flex-col gap-2">
                <Input
                  autoFocus
                  placeholder="Category name"
                  value={customInitiativeName}
                  onChange={(e) => setCustomInitiativeName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customInitiativeName.trim()) {
                      resolveInitiativeSuggestion('custom', customInitiativeName)
                    }
                  }}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    disabled={createInitiative.isPending || updateInteraction.isPending}
                    onClick={() => setNamingCustomInitiative(false)}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!customInitiativeName.trim() || createInitiative.isPending || updateInteraction.isPending}
                    onClick={() => resolveInitiativeSuggestion('custom', customInitiativeName)}
                  >
                    Add category
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={createInitiative.isPending || updateInteraction.isPending}
                  onClick={() => resolveInitiativeSuggestion('decline')}
                >
                  Not now
                </Button>
                <Button
                  size="sm"
                  disabled={createInitiative.isPending || updateInteraction.isPending}
                  onClick={() => setNamingCustomInitiative(true)}
                >
                  Rename
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={createInitiative.isPending || updateInteraction.isPending}
                  onClick={() => resolveInitiativeSuggestion('accept')}
                >
                  {createInitiative.isPending || updateInteraction.isPending ? 'Adding…' : 'Add and tag'}
                </Button>
              </div>
            )}
          </Card>
        )}

        {showTyping && <TypingIndicator stage={stage} />}

        <div ref={scrollAnchorRef} />
      </div>

      {/* Sticky to the bottom of the app's scroll area (Layout's <main>),
          so it stays pinned above the tab bar while the conversation
          scrolls underneath - the fade keeps text from hard-clipping
          against it. */}
      {!hasPending && (
        <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-bg from-70% to-transparent px-4 pt-4 pb-1">
          {selectedInitiative && (
            <div className="mb-2 flex">
              <span className="flex items-center gap-1.5 rounded-full bg-accent-soft py-1 pr-1 pl-2.5 text-xs font-medium text-accent">
                Category: {selectedInitiative.name}
                <button
                  type="button"
                  onClick={() => setSelectedInitiativeId(null)}
                  aria-label="Remove category"
                  className="pressable flex h-5 w-5 items-center justify-center rounded-full"
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </span>
            </div>
          )}
          {pendingLocation && (
            <div className="mb-2 flex">
              <span className="flex items-center gap-1.5 rounded-full bg-accent-soft py-1 pr-1 pl-2.5 text-xs font-medium text-accent">
                <MapPin size={12} strokeWidth={2} /> Location attached
                <button
                  type="button"
                  onClick={() => setPendingLocation(null)}
                  aria-label="Remove location"
                  className="pressable flex h-5 w-5 items-center justify-center rounded-full"
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </span>
            </div>
          )}
          <ChatInput
            ref={chatInputRef}
            value={inputText}
            onChange={setInputText}
            onSend={() => {
              submitText(inputText)
              setInputText('')
            }}
            placeholder={
              messages.length
                ? 'Reply, log or ask…'
                : usage.mode === 'work'
                  ? 'Log a meeting, add a task or ask…'
                  : usage.mode === 'personal'
                    ? 'Jot something down…'
                    : 'Log a note or ask anything…'
            }
            disabled={isBusy && !isRecording}
            isBusy={isBusy}
            onStop={stopRequest}
            isRecording={isRecording}
            onToggleRecord={isRecording ? stopRecording : startRecording}
            isPaused={isPaused}
            onPauseRecord={pauseRecording}
            onResumeRecord={resumeRecording}
            onCancelRecord={cancelRecording}
            initiatives={initiativeList}
            selectedInitiativeId={selectedInitiativeId}
            onSelectInitiative={setSelectedInitiativeId}
            locationAttached={pendingLocation !== null}
            locationLoading={locationLoading}
            onToggleLocation={toggleLocation}
          />
        </div>
      )}

      {confirmingClear && (
        <ConfirmDialog
          title="Start a new conversation?"
          message="This clears the chat on this device. Everything you logged stays saved in Notes and Tasks."
          confirmLabel="Clear conversation"
          onConfirm={() => {
            setMessages([])
            setConfirmingClear(false)
          }}
          onCancel={() => setConfirmingClear(false)}
        />
      )}
    </div>
  )
}
