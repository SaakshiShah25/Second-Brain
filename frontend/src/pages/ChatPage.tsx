import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MapPin, X } from 'lucide-react'
import { useCaptureCard, useCaptureCardConfirm } from '../api/capture'
import { ApiError, ConnectionLostError, RequestTimeoutError, maybeProcessed } from '../api/client'
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
import { OFFLINE_MESSAGE, friendlyMessage } from '../lib/friendlyMessage'
import { shortInputKind, shortInputReply } from '../lib/shortInput'
import { useLiveTranscript } from '../lib/useLiveTranscript'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import { startVoiceMeter } from '../lib/voiceActivity'

// How long a transcribed voice note waits, showing "Sending in Ns · Edit",
// before it sends itself.
const AUTO_SEND_SECONDS = 3

const NO_SPEECH_NOTICE =
  "I didn't catch anything in that recording. Tap the mic and try again - speaking a little closer to the microphone helps."

// Whether trying the same thing again could plausibly work: a dropped or slow
// connection or a server hiccup can, a refusal for what was typed ("too
// short", "can't be logged") can't - the Retry button is only offered for
// the first kind.
function isRetryable(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 0 || err.status === 429 || err.status >= 500
  return true
}

// Which kind of connection problem an error is, if it is one: the request
// never got through ('lost'), or it may have been carried out before the
// connection dropped ('maybe_saved'). undefined for everything else - a
// refusal or a server error isn't fixed by the network coming back.
function connectionIssueOf(err: unknown): ChatMessage['connectionIssue'] {
  if (maybeProcessed(err)) return 'maybe_saved'
  if (err instanceof TypeError) return 'lost'
  return undefined
}

// Wording for a failed voice upload: nothing is saved by it, so unlike a
// failed note there's no "check your Notes first" - and the recording is kept.
function audioFailureMessage(err: unknown): string {
  if (err instanceof RequestTimeoutError || err instanceof ConnectionLostError) {
    return "Sending your recording is taking too long - your connection may be slow. Your recording is kept: tap Retry."
  }
  if (!(err instanceof ApiError) && isRetryable(err)) {
    return "Couldn't send your recording - check your connection. Your recording is kept: tap Retry."
  }
  return friendlyMessage(err, "Couldn't turn that recording into text. Your recording is kept: tap Retry.")
}

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
  // Search's "Ask" / "Log a note" actions land here with the text to start from
  // (put in the box, not sent, so it can be edited first).
  const location = useLocation()
  const navigateTo = useNavigate()
  useEffect(() => {
    const prefill = (location.state as { prefill?: string } | null)?.prefill
    if (!prefill) return
    setInputText(prefill)
    navigateTo(location.pathname, { replace: true, state: null }) // so a refresh doesn't refill it
    window.setTimeout(() => chatInputRef.current?.focus(), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])
  const [isRecording, setIsRecording] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [stage, setStage] = useState<string | null>(null)
  // A voice note's final text is sent automatically after a short countdown
  // (one tap to speak, no second tap to send); "Edit", typing, or starting
  // another recording cancels it and leaves the text in the box.
  const [autoSend, setAutoSend] = useState<{ text: string; left: number } | null>(null)
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
  // The last recording that couldn't be turned into text, kept in memory so
  // Retry can send it again instead of making the user record it twice.
  const lastAudioRef = useRef<Blob | null>(null)

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
  function appendNotice(
    content: string,
    retry?: ChatMessage['retry'],
    connectionIssue?: ChatMessage['connectionIssue'],
  ) {
    appendMessage('assistant', content, {
      kind: 'notice',
      ...(retry ? { retry } : {}),
      ...(connectionIssue ? { connectionIssue } : {}),
    })
  }

  // The wording a connection-problem notice switches to when the device is
  // back online (see the effect below).
  function recoveredMessage(m: ChatMessage): string {
    const what = m.retry?.type === 'audio' ? 'recording' : 'note'
    return m.connectionIssue === 'maybe_saved'
      ? `You're back online. Your last ${what} may already have been saved - check your Notes first, then tap Retry if it isn't there.`
      : `You're back online. Tap Retry to send your ${what}.`
  }

  // Puts a message that failed to send back in the input box - but never
  // over something the user has since started typing.
  function restoreInput(text: string) {
    setInputText((current) => (current.trim() ? current : text))
  }

  // The bubble for a message that never went through: removed rather than
  // left in the thread as if it had been sent (the text goes back in the
  // input instead).
  function dropLastUserMessage(text: string) {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      return last && last.role === 'user' && last.content === text && !last.kind ? prev.slice(0, -1) : prev
    })
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
    // "Hi", "ok", "A", "thanks": nothing to log and nothing to ask. Answered
    // right here - no request, no AI call, and never saved as a note.
    const shortKind = shortInputKind(text)
    if (shortKind) {
      const { message, friendly } = shortInputReply(shortKind)
      if (friendly) {
        // A greeting or thanks gets a normal conversational reply.
        appendMessage('user', text)
        appendMessage('assistant', message)
      } else {
        // Too little to use: say so, and leave the text in the box to extend.
        // (Not repeated if that is already the last thing on screen.)
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          return last?.kind === 'notice' && last.content === message
            ? prev
            : [...prev, { role: 'assistant', content: message, kind: 'notice' }]
        })
        restoreInput(text)
      }
      return
    }
    // No connection at all: say so now, before anything is sent, and keep
    // the text where it is.
    if (!navigator.onLine) {
      appendNotice(OFFLINE_MESSAGE, { type: 'text', text }, 'lost')
      restoreInput(text)
      return
    }
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
        // Unless the request may have gone through anyway (timed out or cut
        // off mid-answer), nothing was saved: take the bubble back and put the
        // text in the input so it can be sent again - or edited first.
        if (!maybeProcessed(err)) dropLastUserMessage(text)
        appendNotice(
          friendlyMessage(err),
          isRetryable(err) ? { type: 'text', text } : undefined,
          connectionIssueOf(err),
        )
        restoreInput(text)
      }
    } finally {
      setIsBusy(false)
      setStage(null)
      abortControllerRef.current = null
    }
  }

  // Retry button on a failed-send notice. The button is spent on the first
  // tap (removed from that notice) so one failure can't be resent twice.
  function handleRetry(index: number) {
    const retry = messages[index]?.retry
    if (!retry || isBusy) return
    // The notice has done its job once Retry is tapped - take it away rather
    // than leave a stale message (red or green) sitting above the new attempt.
    setMessages((prev) => prev.filter((_, i) => i !== index))
    if (retry.type === 'text') {
      setInputText((current) => (current === retry.text ? '' : current))
      void submitText(retry.text)
    } else if (lastAudioRef.current) {
      void transcribeBlob(lastAudioRef.current)
    } else {
      appendNotice('That recording is no longer available - please record it again.')
    }
  }

  // Only one recording is kept (the latest), so only the newest failed-upload
  // notice may offer Retry - an older one would silently resend the wrong audio.
  function clearAudioRetries() {
    setMessages((prev) => prev.map((m) => (m.retry?.type === 'audio' ? { ...m, retry: undefined } : m)))
  }

  // Turns a recording into text in the input box (never auto-sends, so a
  // misheard word can be fixed first). The recording is held in lastAudioRef
  // until it succeeds, so a failed upload can be retried.
  async function transcribeBlob(blob: Blob) {
    if (!navigator.onLine) {
      lastAudioRef.current = blob
      clearAudioRetries()
      appendNotice("You're offline. Reconnect and tap Retry - your recording is kept.", { type: 'audio' }, 'lost')
      return
    }
    setIsBusy(true)
    try {
      const { transcript } = await transcribe.mutateAsync(blob)
      lastAudioRef.current = null
      // Whisper's transcript replaces whatever the live browser preview
      // showed - it's the more accurate, authoritative result. Populate
      // the input rather than auto-sending, so the user can review/edit
      // a misheard word before it goes anywhere.
      setInputText(transcript)
      // Too little to be a note or a question (just "hello", or only noise):
      // don't send it by itself - say why and leave it in the box. Otherwise
      // it goes by itself in a few seconds unless they step in.
      if (shortInputKind(transcript)) {
        if (transcript.trim()) appendNotice(shortInputReply('short').message)
      } else {
        setAutoSend({ text: transcript, left: AUTO_SEND_SECONDS })
      }
    } catch (err) {
      const retryable = isRetryable(err)
      // "Didn't catch anything" and similar refusals would just repeat on
      // the same audio - nothing to keep.
      lastAudioRef.current = retryable ? blob : null
      clearAudioRetries()
      appendNotice(
        retryable ? audioFailureMessage(err) : friendlyMessage(err),
        retryable ? { type: 'audio' } : undefined,
        retryable ? 'lost' : undefined, // an upload failure saves nothing, so retrying is always safe
      )
    } finally {
      setIsBusy(false)
    }
  }

  // Offline -> online: every connection-problem notice that still has a Retry
  // button turns green and says what to do now, instead of keeping the
  // "you're offline" text that is no longer true. Only on that transition -
  // notices restored from an earlier session are left as they were.
  const online = useOnlineStatus()
  const wasOnlineRef = useRef(online)
  useEffect(() => {
    const cameBack = online && !wasOnlineRef.current
    wasOnlineRef.current = online
    if (!cameBack) return
    setMessages((prev) =>
      prev.map((m) =>
        m.kind === 'notice' && m.connectionIssue && m.retry && !m.recovered
          ? { ...m, recovered: true, content: recoveredMessage(m) }
          : m,
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  function cancelAutoSend() {
    setAutoSend(null)
  }

  // Counts down once a second, then sends. Only ever armed by a finished
  // transcription (see transcribeBlob), never by typed text.
  useEffect(() => {
    if (!autoSend) return
    if (autoSend.left <= 0) {
      const text = autoSend.text
      setAutoSend(null)
      setInputText('')
      void submitText(text)
      return
    }
    const timer = window.setTimeout(
      () => setAutoSend((current) => (current ? { ...current, left: current.left - 1 } : current)),
      1000,
    )
    return () => window.clearTimeout(timer)
    // submitText is re-created every render; the countdown must not restart
    // each time, only when the number of seconds left changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend?.left, autoSend?.text])

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
    cancelAutoSend()
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
      void transcribeBlob(new Blob(chunksRef.current, { type: 'audio/webm' }))
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
      {/* pt-11 once there are messages: clears the Search / Help buttons that
          float in the top-right corner of every screen (see Layout.tsx), so the
          first message or notice isn't tucked underneath them. */}
      <div className={`mb-4 flex flex-1 flex-col space-y-4 overflow-y-auto ${messages.length > 0 ? 'pt-11' : ''}`}>
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
          <ChatBubble
            key={i}
            message={m}
            question={m.kind ? questionBefore(i) : ''}
            onRetry={m.retry ? () => handleRetry(i) : undefined}
            retryDisabled={isBusy}
          />
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
            onChange={(value) => {
              cancelAutoSend() // editing means they want to look at it first
              setInputText(value)
            }}
            autoSendLeft={autoSend ? autoSend.left : null}
            onCancelAutoSend={() => {
              cancelAutoSend()
              chatInputRef.current?.focus()
            }}
            onSend={() => {
              cancelAutoSend()
              // Clear first, then send: if the send fails straight away
              // (offline), the text is put back after this clear, not wiped by it.
              const text = inputText
              setInputText('')
              void submitText(text)
            }}
            placeholder="Tell me about a conversation, or ask a question…"
            disabled={isBusy && !isRecording}
            isBusy={isBusy}
            onStop={stopRequest}
            isRecording={isRecording}
            liveSupported={liveTranscript.supported}
            transcribing={transcribe.isPending}
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
