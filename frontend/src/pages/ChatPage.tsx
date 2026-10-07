import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { useCaptureCard, useCaptureCardConfirm } from '../api/capture'
import { useChat, useChatConfirm } from '../api/chat'
import { useCreateInitiative } from '../api/initiatives'
import { useUpdateInteraction } from '../api/people'
import { useTranscribe } from '../api/voice'
import type { AskAnsweredResult, CaptureResult, CaptureSavedResult, ChatMessage, ChatResult } from '../api/types'
import Button from '../components/Button'
import Card from '../components/Card'
import ConfiaLogo from '../components/ConfiaLogo'
import Greeting from '../components/Greeting'
import { Input, Textarea } from '../components/fields'
import ChatBubble from '../components/chat/ChatBubble'
import TypingIndicator from '../components/chat/TypingIndicator'
import ChatInput, { type ChatInputHandle } from '../components/chat/ChatInput'
import DisambiguationCard from '../components/chat/DisambiguationCard'
import ExamplePrompts from '../components/chat/ExamplePrompts'
import { useChatSession } from '../chat/ChatSessionContext'
import { friendlyMessage } from '../lib/friendlyMessage'
import { useLiveTranscript } from '../lib/useLiveTranscript'
import { startVoiceMeter } from '../lib/voiceActivity'

const NO_SPEECH_NOTICE =
  "I didn't catch anything in that recording. Tap the mic and try again - speaking a little closer to the microphone helps."

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
  const liveTextRef = useRef('')
  const handleLiveText = useCallback((text: string) => {
    liveTextRef.current = text
    setInputText(text)
  }, [])
  const liveTranscript = useLiveTranscript(handleLiveText)

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, pendingConfirm, pendingCard, pendingInitiativeSuggestion, isBusy])

  function appendMessage(role: 'user' | 'assistant', content: string, extra: Partial<ChatMessage> = {}) {
    setMessages((prev) => [...prev, { role, content, ...extra }])
  }

  // Something didn't work (nothing heard, mic blocked, a request that
  // didn't go through) - rendered as its own alert, not as a chat reply,
  // so it reads as a problem to act on rather than something MyConfía said.
  function appendNotice(content: string) {
    appendMessage('assistant', content, { kind: 'notice' })
  }

  // An AI answer carries the notes it was drawn from (so it can be
  // checked against them) and is marked so the bubble shows the
  // "AI-generated" notice and Report control.
  function appendAnswer(result: AskAnsweredResult) {
    appendMessage('assistant', result.answer, {
      kind: 'answer',
      sources: result.sources,
      sourcesTotal: result.sources_total,
    })
  }

  // The most recent thing the user sent before message `index` - what a
  // report on that reply needs as its "question".
  function questionBefore(index: number): string {
    for (let j = index - 1; j >= 0; j--) if (messages[j].role === 'user') return messages[j].content
    return ''
  }

  function toggleLocation() {
    if (pendingLocation) {
      setPendingLocation(null)
      return
    }
    if (!navigator.geolocation) {
      appendNotice("This browser doesn't support location.")
      return
    }
    setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPendingLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationLoading(false)
      },
      () => {
        appendNotice("Couldn't get your location - check your browser's location permission for this site.")
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
    appendMessage('assistant', formatSavedMessage(result), { kind: 'capture' })
    if (result.suggested_initiative) {
      setNamingCustomInitiative(false)
      setCustomInitiativeName('')
      setPendingInitiativeSuggestion({ name: result.suggested_initiative, interactionId: result.interaction_id })
    }
  }

  function handleChatResult(result: ChatResult) {
    if (result.intent === 'blocked') {
      // Failed the safety check, or asked for something this product
      // isn't built to do (a joke, code, a story) - either way, a plain
      // message, never a disambiguation prompt.
      appendMessage('assistant', result.answer)
    } else if (result.intent === 'capture') {
      if (result.status === 'saved') handleSavedCapture(result)
      else setPendingConfirm(result)
    } else {
      if (result.status === 'answered') appendAnswer(result)
      else setPendingConfirm(result)
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
              onError: () => appendNotice(`Created **${name}**, but couldn't tag this note with it - you can do that from the Notes page.`),
            },
          )
        },
        onError: () => appendNotice(`Couldn't create that initiative - please try again from the Notes tab.`),
      },
    )
  }

  async function submitText(text: string) {
    if (!text.trim() || isBusy) return
    // role/content only - sources and flags are display state, not conversation
    const historyForRequest = messages.filter((m) => m.kind !== 'notice').map(({ role, content }) => ({ role, content }))
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
        appendNotice(friendlyMessage(err))
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
      if (result.intent === 'ask' && result.status === 'answered') appendAnswer(result)
    } catch (err) {
      appendNotice(friendlyMessage(err))
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
      appendNotice(friendlyMessage(err, "Couldn't read that card. Try a clearer photo with the whole card in view."))
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
      appendNotice(friendlyMessage(err))
    } finally {
      setIsBusy(false)
    }
  }

  async function startRecording() {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      // Once a user explicitly denies a mic permission prompt, the
      // browser/OS deliberately never shows that native prompt again on
      // its own (standard anti-annoyance behavior - no app can force it
      // back open) - getUserMedia() just rejects immediately and
      // silently every time after that, which is exactly what made this
      // look "stuck" on repeat attempts. The fix isn't re-triggering the
      // popup (not possible) - it's telling the user exactly where to
      // go reset it themselves, which the old flat message never did.
      // NotAllowedError specifically means "denied" (by the user or an
      // OS-level policy) - a different, more useful message than the
      // generic one covers everything else (no mic hardware at all,
      // some other getUserMedia failure).
      const denied = err instanceof DOMException && err.name === 'NotAllowedError'
      appendNotice(
        denied
          ? "Microphone access is blocked for MyConfía. Tap the lock/info icon next to the address bar (or, on Android, " +
            "Settings → Apps → MyConfía → Permissions), turn microphone access on, then try recording again."
          : "Couldn't access your microphone - check that a microphone is available and this app has permission to use it, then try again.",
      )
      return
    }
    const recorder = new MediaRecorder(stream)
    // Measures the mic's level while recording so an empty recording can be
    // caught here, before it's uploaded - Whisper turns silence into
    // made-up filler ("Thank you.", "I'm going to go."), so it can't be
    // trusted to say nobody spoke. null (no Web Audio) means "can't tell":
    // fall through to the normal path rather than block recording.
    const meter = startVoiceMeter(stream)
    liveTextRef.current = ''
    chunksRef.current = []
    setInputText('')
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
    recorder.onstop = async () => {
      liveTranscript.stop()
      stream.getTracks().forEach((t) => t.stop())
      const heardSomething = meter ? meter.stop() : true
      // The browser's own live captions picking up words also counts as
      // speech, whatever the level meter said.
      if (!heardSomething && !liveTextRef.current.trim()) {
        setInputText('')
        appendNotice(NO_SPEECH_NOTICE)
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
        appendNotice(friendlyMessage(err, "Couldn't turn that recording into text. Please try again."))
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

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex flex-1 flex-col space-y-4 overflow-y-auto">
        {messages.length === 0 && !hasPending && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-text">
              <ConfiaLogo size={22} />
            </div>
            <Greeting />
            <p className="max-w-xs text-sm text-text-muted">
              Tell me about a conversation, or ask about someone you've met.
            </p>
            <ExamplePrompts
              onPick={(text) => {
                setInputText(text)
                chatInputRef.current?.focus()
              }}
            />
          </div>
        )}

        {messages.map((m, i) => (
          <ChatBubble key={i} message={m} question={m.kind ? questionBefore(i) : ''} />
        ))}

        {pendingConfirm && pendingConfirm.intent === 'capture' && (
          <DisambiguationCard
            prompt={
              <>
                The note mentions{' '}
                <strong>'{pendingConfirm.extracted.primary_person?.name ?? 'Unknown'}'</strong>. Is this the same
                person as one of these existing entries?
              </>
            }
            candidates={pendingConfirm.candidates}
            onChoose={chooseConfirmCandidate}
            onNone={() => chooseConfirmCandidate(null)}
            noneLabel={`None of these — '${pendingConfirm.extracted.primary_person?.name ?? 'Unknown'}' is a new person`}
            busy={isBusy}
          />
        )}

        {pendingConfirm && pendingConfirm.intent === 'ask' && (
          <DisambiguationCard
            prompt={
              <>
                <strong>'{String(pendingConfirm.parsed.person_name ?? '')}'</strong> could refer to more than one
                person you've logged. Who did you mean?
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
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-text">
              <ConfiaLogo size={15} />
            </div>
            <Card className="min-w-0 flex-1">
              <p className="mb-3 text-sm text-text">
                This seems to be about <strong>{pendingInitiativeSuggestion.name}</strong> - want me to add that as a
                new initiative and tag this note with it?
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
                      disabled={
                        !customInitiativeName.trim() || createInitiative.isPending || updateInteraction.isPending
                      }
                      onClick={() => resolveInitiativeSuggestion('custom', customInitiativeName)}
                    >
                      Add
                    </Button>
                    <Button
                      disabled={createInitiative.isPending || updateInteraction.isPending}
                      onClick={() => setNamingCustomInitiative(false)}
                    >
                      Back
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    disabled={createInitiative.isPending || updateInteraction.isPending}
                    onClick={() => resolveInitiativeSuggestion('accept')}
                  >
                    Yes, add '{pendingInitiativeSuggestion.name}'
                  </Button>
                  <Button
                    disabled={createInitiative.isPending || updateInteraction.isPending}
                    onClick={() => setNamingCustomInitiative(true)}
                  >
                    Let me name it
                  </Button>
                  <Button
                    disabled={createInitiative.isPending || updateInteraction.isPending}
                    onClick={() => resolveInitiativeSuggestion('decline')}
                  >
                    No thanks
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}

        {pendingCard && (
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-text">
              <ConfiaLogo size={15} />
            </div>
            <div className="min-w-0 flex-1 rounded-xl border border-border bg-bg-card p-4">
              <p className="mb-2 text-sm font-medium">Confirm the scanned details before saving:</p>
              <div className="flex flex-col gap-2">
                <Input
                  placeholder="Name"
                  value={pendingCard.name}
                  onChange={(e) => setPendingCard({ ...pendingCard, name: e.target.value })}
                />
                <Input
                  placeholder="Role"
                  value={pendingCard.role}
                  onChange={(e) => setPendingCard({ ...pendingCard, role: e.target.value })}
                />
                <Input
                  placeholder="Company"
                  value={pendingCard.company}
                  onChange={(e) => setPendingCard({ ...pendingCard, company: e.target.value })}
                />
                <Input
                  placeholder="Phone"
                  value={pendingCard.phone}
                  onChange={(e) => setPendingCard({ ...pendingCard, phone: e.target.value })}
                />
                <Input
                  placeholder="Email"
                  value={pendingCard.email}
                  onChange={(e) => setPendingCard({ ...pendingCard, email: e.target.value })}
                />
                <Textarea
                  placeholder="Context (optional - e.g. where you met)"
                  rows={2}
                  value={pendingCard.context_note}
                  onChange={(e) => setPendingCard({ ...pendingCard, context_note: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button variant="primary" disabled={isBusy || !pendingCard.name.trim()} onClick={submitCardConfirm}>
                    Save contact
                  </Button>
                  <Button onClick={() => setPendingCard(null)}>Cancel</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showTyping && <TypingIndicator stage={stage} />}

        <div ref={scrollAnchorRef} />
      </div>

      {!hasPending && (
        <>
          {pendingLocation && (
            <div className="mb-2 flex items-center gap-2 text-xs text-text-muted">
              <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-accent">
                <MapPin size={12} strokeWidth={1.6} /> location attached
              </span>
              <button type="button" onClick={() => setPendingLocation(null)} className="hover:text-text">
                <X size={13} strokeWidth={1.6} />
              </button>
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
            placeholder="Tell me about a conversation, or ask a question…"
            disabled={isBusy && !isRecording}
            isBusy={isBusy}
            onStop={stopRequest}
            isRecording={isRecording}
            onToggleRecord={isRecording ? stopRecording : startRecording}
            locationAttached={pendingLocation !== null}
            locationLoading={locationLoading}
            onToggleLocation={toggleLocation}
            onAttachCard={handleCardFile}
          />
        </>
      )}
    </div>
  )
}
