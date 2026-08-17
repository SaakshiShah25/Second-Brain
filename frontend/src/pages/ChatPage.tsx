import { useEffect, useRef, useState } from 'react'
import { Brain, IdCard, MapPin, MessageCircleQuestion, PenLine, X, type LucideIcon } from 'lucide-react'
import { useCaptureCard, useCaptureCardConfirm, useCaptureConfirm, useCaptureText } from '../api/capture'
import { useAsk, useAskConfirm } from '../api/ask'
import { useTranscribe } from '../api/voice'
import type {
  CaptureConfirmRequiredResult,
  CaptureResult,
  CaptureSavedResult,
  AskConfirmRequiredResult,
  AskResult,
  CardFields,
  ChatMessage,
  ChatMode,
} from '../api/types'
import Button from '../components/Button'
import { Input, Textarea } from '../components/fields'
import ChatBubble from '../components/chat/ChatBubble'
import TypingIndicator from '../components/chat/TypingIndicator'
import ChatInput from '../components/chat/ChatInput'
import DisambiguationCard from '../components/chat/DisambiguationCard'
import EmptyState from '../components/chat/EmptyState'

interface PendingCard extends CardFields {
  context_note: string
}

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
  const [mode, setMode] = useState<ChatMode>('capture')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [pendingCapture, setPendingCapture] = useState<CaptureConfirmRequiredResult | null>(null)
  const [pendingAsk, setPendingAsk] = useState<AskConfirmRequiredResult | null>(null)
  const [pendingCard, setPendingCard] = useState<PendingCard | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const scrollAnchorRef = useRef<HTMLDivElement>(null)

  const captureText = useCaptureText()
  const captureConfirm = useCaptureConfirm()
  const captureCard = useCaptureCard()
  const captureCardConfirm = useCaptureCardConfirm()
  const askMutation = useAsk()
  const askConfirm = useAskConfirm()
  const transcribe = useTranscribe()

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, pendingCapture, pendingAsk, pendingCard, isBusy])

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

  function handleCaptureResult(result: CaptureResult) {
    if (result.status === 'saved') {
      appendMessage('assistant', formatSavedMessage(result))
    } else {
      setPendingCapture(result)
    }
  }

  function handleAskResult(result: AskResult) {
    if (result.status === 'answered') {
      appendMessage('assistant', result.answer)
    } else {
      setPendingAsk(result)
    }
  }

  async function submitText(text: string) {
    if (!text.trim() || isBusy) return
    const historyForRequest = messages
    appendMessage('user', text)
    setIsBusy(true)
    try {
      if (mode === 'card') return // card mode has its own submit path
      if (mode === 'capture') {
        const result = await captureText.mutateAsync({
          rawText: text,
          geoLat: pendingLocation?.lat,
          geoLng: pendingLocation?.lng,
        })
        setPendingLocation(null) // one-shot per note, not sticky across future notes
        handleCaptureResult(result)
      } else {
        const result = await askMutation.mutateAsync({ query: text, history: historyForRequest })
        handleAskResult(result)
      }
    } catch (err) {
      appendMessage('assistant', `Something went wrong: ${err}`)
    } finally {
      setIsBusy(false)
    }
  }

  async function chooseCaptureCandidate(choice: number | null) {
    if (!pendingCapture) return
    setIsBusy(true)
    try {
      const result = await captureConfirm.mutateAsync({
        extracted: pendingCapture.extracted,
        raw_text: pendingCapture.raw_text,
        interaction_date: pendingCapture.interaction_date,
        date_warning: pendingCapture.date_warning,
        candidates: pendingCapture.candidates,
        choice,
        geo_lat: pendingCapture.geo_lat,
        geo_lng: pendingCapture.geo_lng,
      })
      setPendingCapture(null)
      if (result.status === 'saved') appendMessage('assistant', formatSavedMessage(result))
    } catch (err) {
      appendMessage('assistant', `Something went wrong: ${err}`)
    } finally {
      setIsBusy(false)
    }
  }

  async function chooseAskCandidate(choice: number | null) {
    if (!pendingAsk) return
    setIsBusy(true)
    try {
      const result = await askConfirm.mutateAsync({
        query: pendingAsk.query,
        parsed: pendingAsk.parsed,
        candidates: pendingAsk.candidates,
        choice,
      })
      setPendingAsk(null)
      if (result.status === 'answered') appendMessage('assistant', result.answer)
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
      const result = await captureCardConfirm.mutateAsync(pendingCard)
      setPendingCard(null)
      handleCaptureResult(result)
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
        await submitText(transcript)
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

  const hasPending = pendingCapture !== null || pendingAsk !== null || pendingCard !== null
  const showTyping = isBusy && !hasPending && !isRecording

  return (
    <div className="flex h-full flex-col">
      <h1 className="mb-4 text-2xl font-bold">Chat</h1>

      <div className="mb-4 flex gap-2">
        {(
          [
            ['capture', 'Log a note', PenLine],
            ['ask', 'Ask a question', MessageCircleQuestion],
            ['card', 'Scan a card', IdCard],
          ] as [ChatMode, string, LucideIcon][]
        ).map(([m, label, Icon]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === m
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border-strong bg-bg-card text-text-muted hover:text-text'
            }`}
          >
            <Icon size={15} strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-1 flex-col space-y-4 overflow-y-auto">
        {messages.length === 0 && !hasPending && <EmptyState mode={mode} />}

        {messages.map((m, i) => (
          <ChatBubble key={i} message={m} />
        ))}

        {pendingCapture && (
          <DisambiguationCard
            prompt={
              <>
                The note mentions <strong>'{pendingCapture.extracted.primary_person.name}'</strong>. Is this the same
                person as one of these existing entries?
              </>
            }
            candidates={pendingCapture.candidates}
            onChoose={chooseCaptureCandidate}
            onNone={() => chooseCaptureCandidate(null)}
            noneLabel={`None of these — '${pendingCapture.extracted.primary_person.name}' is a new person`}
            busy={isBusy}
          />
        )}

        {pendingAsk && (
          <DisambiguationCard
            prompt={
              <>
                <strong>'{String(pendingAsk.parsed.person_name ?? '')}'</strong> could refer to more than one person
                you've logged. Who did you mean?
              </>
            }
            candidates={pendingAsk.candidates}
            onChoose={chooseAskCandidate}
            onNone={() => chooseAskCandidate(null)}
            noneLabel="None of these"
            busy={isBusy}
          />
        )}

        {pendingCard && (
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Brain size={15} strokeWidth={2} />
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

      {!hasPending && mode === 'card' && (
        <div className="border-t border-border pt-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-muted">Scan a business card</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={isBusy}
              onChange={(e) => e.target.files?.[0] && handleCardFile(e.target.files[0])}
              className="block w-full text-sm text-text-muted file:mr-3 file:rounded-lg file:border file:border-border-strong file:bg-bg-card file:px-3 file:py-1.5 file:text-sm file:text-text"
            />
          </label>
        </div>
      )}

      {!hasPending && mode !== 'card' && (
        <>
          {pendingLocation && (
            <div className="mb-2 flex items-center gap-2 text-xs text-text-muted">
              <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-accent">
                <MapPin size={12} strokeWidth={2} /> location attached
              </span>
              <button type="button" onClick={() => setPendingLocation(null)} className="hover:text-text">
                <X size={13} strokeWidth={2} />
              </button>
            </div>
          )}
          <ChatInput
            value={inputText}
            onChange={setInputText}
            onSend={() => {
              submitText(inputText)
              setInputText('')
            }}
            placeholder={mode === 'capture' ? 'Tell me about a conversation…' : 'Ask about someone or something…'}
            disabled={isBusy}
            isRecording={isRecording}
            onToggleRecord={isRecording ? stopRecording : startRecording}
            locationAttached={pendingLocation !== null}
            locationLoading={locationLoading}
            onToggleLocation={mode === 'capture' ? toggleLocation : undefined}
          />
        </>
      )}
    </div>
  )
}
