import { useEffect, useRef, useState } from 'react'
import { Camera, FolderOpen, Heart, MapPin, MessageCircleQuestion, Mic, Sparkles, SquarePen, X } from 'lucide-react'
import { useCaptureCard, useCaptureCardConfirm } from '../api/capture'
import { useChat, useChatConfirm } from '../api/chat'
import { useCreateInitiative } from '../api/initiatives'
import { useUpdateInteraction } from '../api/people'
import { useTranscribe } from '../api/voice'
import type { CaptureResult, CaptureSavedResult, ChatMessage, ChatResult } from '../api/types'
import Button from '../components/Button'
import Card from '../components/Card'
import ConfiaLogo from '../components/ConfiaLogo'
import ConfirmDialog from '../components/ConfirmDialog'
import { ProfileButton } from '../components/PageHeader'
import Greeting from '../components/Greeting'
import { Input, Textarea } from '../components/fields'
import ChatBubble from '../components/chat/ChatBubble'
import TypingIndicator from '../components/chat/TypingIndicator'
import ChatInput, { type ChatInputHandle } from '../components/chat/ChatInput'
import DisambiguationCard from '../components/chat/DisambiguationCard'
import { useChatSession } from '../chat/ChatSessionContext'
import { useLiveTranscript } from '../lib/useLiveTranscript'
import { useUsageMode } from '../lib/usageMode'

// One hue per Home starter tile, in order, so the empty state reads as a
// colorful set of shortcuts rather than four identical rows.
const STARTER_TINTS = [
  'bg-fun-orange/15 text-fun-orange',
  'bg-fun-sky/15 text-fun-sky',
  'bg-fun-teal/15 text-fun-teal',
  'bg-fun-pink/15 text-fun-pink',
]

function formatSavedMessage(result: CaptureSavedResult): string {
  // Only makes sense when the note is actually about a person - a
  // standalone personal note/reminder has no matched contact, so showing
  // "Matched to existing contact: null" would just be noise, not
  // information.
  const lines: string[] = []
  if (result.resolved_name) {
    const status = result.created_new ? 'New contact' : 'Matched to existing contact'
    lines.push(`**${status}:** ${result.resolved_name}`)
  }
  // Applies to any note (person-involving or standalone), unlike the
  // fields above - so this isn't nested under the resolved_name check.
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
    lines.push('**Follow-ups:**')
    for (const t of result.tasks_created) {
      const owner = t.owner === 'them' ? 'Them' : 'Me'
      lines.push(`- ${t.description}${t.due_date ? ` _(due ${t.due_date})_` : ''} — ${owner}`)
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
  const { messages, setMessages, pendingConfirm, setPendingConfirm, pendingCard, setPendingCard } = useChatSession()
  const [inputText, setInputText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [stage, setStage] = useState<string | null>(null)
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)
  // A capture that didn't fit any existing initiative but reads like a
  // substantial-enough theme to deserve its own (extraction.py's
  // "suggested_initiative") - offered as a one-off yes/no prompt after
  // the note has already saved, never blocking the save itself the way
  // person disambiguation does (see handleSavedCapture below).
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
  const chatConfirm = useChatConfirm()
  const captureCard = useCaptureCard()
  const captureCardConfirm = useCaptureCardConfirm()
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
    if (messages.length === 0 && !pendingConfirm && !pendingCard && !pendingInitiativeSuggestion && !isBusy) return
    const scroller = scrollAnchorRef.current?.closest('#app-scroll')
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  }, [messages, pendingConfirm, pendingCard, pendingInitiativeSuggestion, isBusy])

  function appendMessage(role: 'user' | 'assistant', content: string, extras: Partial<ChatMessage> = {}) {
    setMessages((prev) => [...prev, { role, content, ...extras }])
  }

  function toggleLocation() {
    if (pendingLocation) {
      setPendingLocation(null)
      return
    }
    if (!navigator.geolocation) {
      appendMessage('assistant', "This browser doesn't support location.")
      return
    }
    setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPendingLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationLoading(false)
      },
      () => {
        appendMessage('assistant', "Couldn't get your location - check your browser's location permission for this site.")
        setLocationLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  // Shared tail for every path that can end in a saved capture (direct
  // send, person-disambiguation confirm, card confirm) - posts the usual
  // saved-note summary, then separately offers the new-initiative
  // suggestion if extraction.py proposed one. Kept as one function so
  // that offer doesn't need reimplementing at each of the three call sites.
  function handleSavedCapture(result: CaptureSavedResult) {
    appendMessage('assistant', formatSavedMessage(result))
    if (result.suggested_initiative) {
      setNamingCustomInitiative(false)
      setCustomInitiativeName('')
      setPendingInitiativeSuggestion({ name: result.suggested_initiative, interactionId: result.interaction_id })
    }
  }

  function handleChatResult(result: ChatResult) {
    if (result.intent === 'documents') {
      // A file-retrieval answer - rendered as an interactive picker card
      // (ChatBubble -> DocumentResultCard). `content` keeps a plain-text
      // trace of it for the conversation history sent back to the model.
      const names = result.groups.map((g) => g.label).join(', ')
      appendMessage('assistant', `Found documents for: ${names}`, { documents: { ...result } })
    } else if (result.intent === 'blocked') {
      // Failed the safety check, or asked for something this product
      // isn't built to do (a joke, code, a story) - either way, a plain
      // message, never a disambiguation prompt.
      appendMessage('assistant', result.answer)
    } else if (result.intent === 'capture') {
      if (result.status === 'saved') handleSavedCapture(result)
      else setPendingConfirm(result)
    } else if (result.status === 'answered') {
      appendMessage('assistant', result.answer, {
        ...(result.sources?.length ? { sources: result.sources } : {}),
        ...(result.documents ? { documents: result.documents } : {}),
      })
    } else if (result.status === 'clarify') {
      appendMessage('assistant', result.answer, { options: result.options })
    } else {
      setPendingConfirm(result)
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
      appendMessage('assistant', `Okay, left it in Others.`)
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
              onSuccess: () => appendMessage('assistant', `Added **${initiative.name}** and tagged this note with it.`),
              onError: () => appendMessage('assistant', `Created **${name}**, but couldn't tag this note with it - you can do that from the Notes page.`),
            },
          )
        },
        onError: () => appendMessage('assistant', `Couldn't create that initiative - please try again from the Notes tab.`),
      },
    )
  }

  async function submitText(text: string) {
    if (!text.trim() || isBusy) return
    // Plain role/content only - document result payloads stay client-side.
    const historyForRequest = messages.map(({ role, content }) => ({ role, content }))
    appendMessage('user', text)
    setIsBusy(true)
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      const result = await chatMutation.mutateAsync({
        body: { text, history: historyForRequest, geoLat: pendingLocation?.lat, geoLng: pendingLocation?.lng },
        signal: controller.signal,
        onStage: setStage,
      })
      setPendingLocation(null) // one-shot per note, not sticky across future sends
      handleChatResult(result)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        appendMessage('assistant', '_Stopped._')
      } else {
        appendMessage('assistant', `Something went wrong: ${err}`)
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

  async function chooseConfirmCandidate(choice: number | null) {
    if (!pendingConfirm) return
    setIsBusy(true)
    try {
      const result = await chatConfirm.mutateAsync(
        pendingConfirm.intent === 'capture'
          ? {
              intent: 'capture',
              extracted: pendingConfirm.extracted,
              raw_text: pendingConfirm.raw_text,
              interaction_date: pendingConfirm.interaction_date,
              date_warning: pendingConfirm.date_warning,
              candidates: pendingConfirm.candidates,
              choice,
              initiative_id: pendingConfirm.initiative_id,
              geo_lat: pendingConfirm.geo_lat,
              geo_lng: pendingConfirm.geo_lng,
            }
          : {
              intent: 'ask',
              query: pendingConfirm.query,
              parsed: pendingConfirm.parsed,
              candidates: pendingConfirm.candidates,
              choice,
            },
      )
      setPendingConfirm(null)
      if (result.intent === 'capture' && result.status === 'saved') handleSavedCapture(result)
      if (result.intent === 'ask' && result.status === 'answered') appendMessage('assistant', result.answer)
    } catch (err) {
      appendMessage('assistant', `Something went wrong: ${err}`)
    } finally {
      setIsBusy(false)
    }
  }

  async function handleCardFile(file: File) {
    setIsBusy(true)
    try {
      const card = await captureCard.mutateAsync(file)
      setPendingCard({ ...card, context_note: '' })
    } catch (err) {
      appendMessage('assistant', `Couldn't read that card: ${err}`)
    } finally {
      setIsBusy(false)
    }
  }

  async function submitCardConfirm() {
    if (!pendingCard) return
    const label =
      pendingCard.context_note ||
      `Scanned business card: ${pendingCard.name}, ${pendingCard.role} at ${pendingCard.company}`
    appendMessage('user', label)
    setIsBusy(true)
    try {
      const result: CaptureResult = await captureCardConfirm.mutateAsync(pendingCard)
      setPendingCard(null)
      if (result.status === 'saved') {
        handleSavedCapture(result)
      } else {
        const confirmResult: ChatResult = { intent: 'capture', ...result }
        if (confirmResult.status === 'confirm_required') setPendingConfirm(confirmResult)
      }
    } catch (err) {
      appendMessage('assistant', `Something went wrong: ${err}`)
    } finally {
      setIsBusy(false)
    }
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
        appendMessage('assistant', `Voice transcription failed: ${err}`)
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
  }

  const hasPending = pendingConfirm !== null || pendingCard !== null || pendingInitiativeSuggestion !== null
  const showTyping = isBusy && !hasPending && !isRecording && !transcribe.isPending
  const isEmpty = messages.length === 0 && !hasPending

  // Starters for the empty state - each one is a real shortcut into the
  // same flows the composer offers, not decorative copy - tailored to what
  // the account is used for (Settings > Using MyConfía for).
  function prefill(text: string) {
    setInputText(text)
    chatInputRef.current?.focus()
  }
  const record = { icon: Mic, onClick: () => startRecording() }
  const scanCard = {
    icon: Camera,
    title: 'Scan a business card',
    body: 'Save a new contact in one photo',
    onClick: () => chatInputRef.current?.openCardPicker(),
  }
  const starters = {
    work: [
      { ...record, title: 'Log a meeting', body: 'Talk through what was said and agreed' },
      { icon: Sparkles, title: 'Prep before I meet', body: '“Brief me before I meet…”', onClick: () => prefill('Brief me before I meet ') },
      { icon: FolderOpen, title: 'Pull up a file', body: '“Send me the Acme contract”', onClick: () => prefill('Pull up the ') },
      scanCard,
    ],
    personal: [
      { ...record, title: 'Capture a thought', body: 'Say it out loud — I’ll sort it' },
      { icon: FolderOpen, title: 'Pull up a document', body: '“Pull my Aadhaar and photo”', onClick: () => prefill('Pull my ') },
      { icon: Heart, title: 'Remember a detail', body: '“Mum’s favourite flowers are…”', onClick: () => prefill('Remember that ') },
      { icon: MessageCircleQuestion, title: 'Ask your memory', body: '“When did I last see…”', onClick: () => prefill('When did I last see ') },
    ],
    both: [
      { ...record, title: 'Talk it through', body: 'Record what happened in a meeting or call' },
      { icon: MessageCircleQuestion, title: 'Ask your memory', body: '“What did I discuss with…”', onClick: () => prefill('What did I discuss with ') },
      { icon: FolderOpen, title: 'Pull up a document', body: '“Pull my passport and PAN”', onClick: () => prefill('Pull my ') },
      scanCard,
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
                ? 'Jot down anything, or ask about the people in your life.'
                : 'Tell me about a conversation, or ask about someone you’ve met.'}
            </p>
            <div className="flex flex-col gap-2.5">
              {starters.map(({ icon: Icon, title, body, onClick }, i) => (
                <button
                  key={title}
                  type="button"
                  onClick={onClick}
                  disabled={isBusy}
                  className="pressable flex items-center gap-3.5 rounded-2xl border border-border bg-bg-card p-3.5 text-left shadow-card disabled:opacity-50"
                >
                  <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${STARTER_TINTS[i % STARTER_TINTS.length]}`}>
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
            // Options only stay tappable on the latest message - an old
            // clarifying question shouldn't be re-answerable.
            onOption={i === messages.length - 1 && !isBusy ? (o) => submitText(o) : undefined}
          />
        ))}

        {pendingConfirm && pendingConfirm.intent === 'capture' && (
          <DisambiguationCard
            prompt={
              <>
                The note mentions{' '}
                <strong>'{pendingConfirm.extracted.primary_person?.name ?? 'Unknown'}'</strong>. Is this the same
                person as one of these?
              </>
            }
            candidates={pendingConfirm.candidates}
            onChoose={chooseConfirmCandidate}
            onNone={() => chooseConfirmCandidate(null)}
            noneLabel={`None — '${pendingConfirm.extracted.primary_person?.name ?? 'Unknown'}' is someone new`}
            busy={isBusy}
          />
        )}

        {pendingConfirm && pendingConfirm.intent === 'ask' && (
          <DisambiguationCard
            prompt={
              <>
                <strong>'{String(pendingConfirm.parsed.person_name ?? '')}'</strong> could be more than one person
                you've logged. Who did you mean?
              </>
            }
            candidates={pendingConfirm.candidates}
            onChoose={chooseConfirmCandidate}
            onNone={() => chooseConfirmCandidate(null)}
            noneLabel="None of these"
            busy={isBusy}
          />
        )}

        {pendingInitiativeSuggestion && (
          <Card style={{ animation: 'fade-in 0.2s ease-out' }}>
            <p className="mb-3 text-[0.9375rem] leading-relaxed">
              This seems to be about <strong>{pendingInitiativeSuggestion.name}</strong>. Add it as a new initiative
              and tag this note?
            </p>
            {namingCustomInitiative ? (
              <div className="flex flex-col gap-2">
                <Input
                  autoFocus
                  placeholder="Initiative name"
                  value={customInitiativeName}
                  onChange={(e) => setCustomInitiativeName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customInitiativeName.trim()) {
                      resolveInitiativeSuggestion('custom', customInitiativeName)
                    }
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    className="flex-1"
                    disabled={
                      !customInitiativeName.trim() || createInitiative.isPending || updateInteraction.isPending
                    }
                    onClick={() => resolveInitiativeSuggestion('custom', customInitiativeName)}
                  >
                    Add
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={createInitiative.isPending || updateInteraction.isPending}
                    onClick={() => setNamingCustomInitiative(false)}
                  >
                    Back
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  variant="primary"
                  block
                  disabled={createInitiative.isPending || updateInteraction.isPending}
                  onClick={() => resolveInitiativeSuggestion('accept')}
                >
                  Yes, add '{pendingInitiativeSuggestion.name}'
                </Button>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={createInitiative.isPending || updateInteraction.isPending}
                    onClick={() => setNamingCustomInitiative(true)}
                  >
                    Rename
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={createInitiative.isPending || updateInteraction.isPending}
                    onClick={() => resolveInitiativeSuggestion('decline')}
                  >
                    No thanks
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {pendingCard && (
          <Card style={{ animation: 'fade-in 0.2s ease-out' }}>
            <p className="mb-3 text-[0.9375rem] font-semibold">Check the scanned details</p>
            <div className="flex flex-col gap-2">
              <Input
                placeholder="Name"
                autoComplete="off"
                value={pendingCard.name}
                onChange={(e) => setPendingCard({ ...pendingCard, name: e.target.value })}
              />
              <Input
                placeholder="Role"
                autoComplete="off"
                value={pendingCard.role}
                onChange={(e) => setPendingCard({ ...pendingCard, role: e.target.value })}
              />
              <Input
                placeholder="Company"
                autoComplete="off"
                value={pendingCard.company}
                onChange={(e) => setPendingCard({ ...pendingCard, company: e.target.value })}
              />
              <Input
                placeholder="Phone"
                type="tel"
                autoComplete="off"
                value={pendingCard.phone}
                onChange={(e) => setPendingCard({ ...pendingCard, phone: e.target.value })}
              />
              <Input
                placeholder="Email"
                type="email"
                autoComplete="off"
                value={pendingCard.email}
                onChange={(e) => setPendingCard({ ...pendingCard, email: e.target.value })}
              />
              <Textarea
                placeholder="Context (optional — e.g. where you met)"
                rows={2}
                value={pendingCard.context_note}
                onChange={(e) => setPendingCard({ ...pendingCard, context_note: e.target.value })}
              />
              <div className="mt-1 flex gap-2">
                <Button className="flex-1" onClick={() => setPendingCard(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  disabled={isBusy || !pendingCard.name.trim()}
                  onClick={submitCardConfirm}
                >
                  Save contact
                </Button>
              </div>
            </div>
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
                  ? 'Log a meeting or ask…'
                  : usage.mode === 'personal'
                    ? 'Jot something down…'
                    : 'Log a note or ask anything…'
            }
            disabled={isBusy && !isRecording}
            isBusy={isBusy}
            onStop={stopRequest}
            isRecording={isRecording}
            onToggleRecord={isRecording ? stopRecording : startRecording}
            locationAttached={pendingLocation !== null}
            locationLoading={locationLoading}
            onToggleLocation={toggleLocation}
            // Card scanning is a work tool - tucked away in Personal mode.
            onAttachCard={usage.isWork ? handleCardFile : undefined}
          />
        </div>
      )}

      {confirmingClear && (
        <ConfirmDialog
          title="Start a new conversation?"
          message="This clears the chat on this device. Everything you logged stays saved in Notes, People and Today."
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
