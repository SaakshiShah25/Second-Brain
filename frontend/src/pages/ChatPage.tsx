import { useEffect, useRef, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { useCaptureCard, useCaptureCardConfirm } from '../api/capture'
import { useChat, useChatConfirm } from '../api/chat'
import { useTranscribe } from '../api/voice'
import type { CaptureResult, CaptureSavedResult, ChatResult } from '../api/types'
import Button from '../components/Button'
import ConfiaLogo from '../components/ConfiaLogo'
import Greeting from '../components/Greeting'
import { Input, Textarea } from '../components/fields'
import ChatBubble from '../components/chat/ChatBubble'
import TypingIndicator from '../components/chat/TypingIndicator'
import ChatInput, { type ChatInputHandle } from '../components/chat/ChatInput'
import DisambiguationCard from '../components/chat/DisambiguationCard'
import { useChatSession } from '../chat/ChatSessionContext'

function formatSavedMessage(result: CaptureSavedResult): string {
  const status = result.created_new ? 'New contact' : 'Matched to existing contact'
  const lines = [`**${status}:** ${result.resolved_name}`]
  if (result.meeting_type) lines.push(`**Meeting type:** ${result.meeting_type}`)
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
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)

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

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, pendingConfirm, pendingCard, isBusy])

  function appendMessage(role: 'user' | 'assistant', content: string) {
    setMessages((prev) => [...prev, { role, content }])
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

  function handleChatResult(result: ChatResult) {
    if (result.intent === 'blocked') {
      // Failed the safety check, or asked for something this product
      // isn't built to do (a joke, code, a story) - either way, a plain
      // message, never a disambiguation prompt.
      appendMessage('assistant', result.answer)
    } else if (result.intent === 'capture') {
      if (result.status === 'saved') appendMessage('assistant', formatSavedMessage(result))
      else setPendingConfirm(result)
    } else {
      if (result.status === 'answered') appendMessage('assistant', result.answer)
      else setPendingConfirm(result)
    }
  }

  async function submitText(text: string) {
    if (!text.trim() || isBusy) return
    const historyForRequest = messages
    appendMessage('user', text)
    setIsBusy(true)
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      const result = await chatMutation.mutateAsync({
        body: { text, history: historyForRequest, geoLat: pendingLocation?.lat, geoLng: pendingLocation?.lng },
        signal: controller.signal,
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
      if (result.intent === 'capture' && result.status === 'saved') appendMessage('assistant', formatSavedMessage(result))
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
        appendMessage('assistant', formatSavedMessage(result))
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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      setIsBusy(true)
      try {
        const { transcript } = await transcribe.mutateAsync(blob)
        // Populate the input rather than auto-sending, so the user can
        // review/edit a misheard word before it goes anywhere.
        setInputText(transcript)
        chatInputRef.current?.focus()
      } catch (err) {
        appendMessage('assistant', `Voice transcription failed: ${err}`)
      } finally {
        setIsBusy(false)
      }
    }
    recorder.start()
    mediaRecorderRef.current = recorder
    setIsRecording(true)
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  const hasPending = pendingConfirm !== null || pendingCard !== null
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
          </div>
        )}

        {messages.map((m, i) => (
          <ChatBubble key={i} message={m} />
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

        {showTyping && <TypingIndicator />}

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
