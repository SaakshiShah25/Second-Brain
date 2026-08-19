import { createContext, useContext, useState, type ReactNode } from 'react'
import type {
  AskConfirmRequiredResult,
  CaptureConfirmRequiredResult,
  CardFields,
  ChatMessage,
  ChatMode,
} from '../api/types'

interface PendingCard extends CardFields {
  context_note: string
}

interface ModeState {
  messages: ChatMessage[]
  pendingCapture: CaptureConfirmRequiredResult | null
  pendingAsk: AskConfirmRequiredResult | null
  pendingCard: PendingCard | null
}

function emptyModeState(): ModeState {
  return { messages: [], pendingCapture: null, pendingAsk: null, pendingCard: null }
}

const MODES: ChatMode[] = ['capture', 'ask', 'card']

interface ChatSessionContextValue {
  mode: ChatMode
  setMode: (mode: ChatMode) => void
  messages: ChatMessage[]
  setMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void
  pendingCapture: CaptureConfirmRequiredResult | null
  setPendingCapture: (value: CaptureConfirmRequiredResult | null) => void
  pendingAsk: AskConfirmRequiredResult | null
  setPendingAsk: (value: AskConfirmRequiredResult | null) => void
  pendingCard: PendingCard | null
  setPendingCard: (value: PendingCard | null | ((prev: PendingCard | null) => PendingCard | null)) => void
}

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null)

// Each chat mode (log a note / ask a question / scan a card) keeps its own
// isolated conversation, and all three survive navigating away and back -
// this provider is mounted once around the authenticated route tree
// (see App.tsx), not per-page, so unmounting ChatPage doesn't lose state.
export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ChatMode>('capture')
  const [statesByMode, setStatesByMode] = useState<Record<ChatMode, ModeState>>(() => {
    const initial = {} as Record<ChatMode, ModeState>
    for (const m of MODES) initial[m] = emptyModeState()
    return initial
  })

  const current = statesByMode[mode]

  function updateCurrent(patch: Partial<ModeState>) {
    setStatesByMode((prev) => ({ ...prev, [mode]: { ...prev[mode], ...patch } }))
  }

  // setMessages/setPendingCard take React's usual `value | (prev => value)`
  // updater form, same as useState - but unlike useState, the "prev" a
  // functional updater sees must come from INSIDE setStatesByMode's own
  // functional updater, not from the `current` closed over at this render.
  // Resolving the updater against `current.messages` here was the bug:
  // ChatPage.tsx appends the user's message, then (after the async
  // capture/ask call resolves) appends the assistant's reply via a NEW
  // call to this same setter - but by then `current` in this closure is
  // stale (it's still the value from the render where submitText() was
  // first called), so the reply overwrote the question instead of
  // appending after it. Passing the updater straight into
  // setStatesByMode's callback means it always sees the true latest state.
  function updateCurrentWithUpdater<K extends 'messages' | 'pendingCard'>(
    key: K,
    updater: ModeState[K] | ((prev: ModeState[K]) => ModeState[K]),
  ) {
    setStatesByMode((prev) => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        [key]: typeof updater === 'function' ? (updater as (p: ModeState[K]) => ModeState[K])(prev[mode][key]) : updater,
      },
    }))
  }

  const value: ChatSessionContextValue = {
    mode,
    setMode,
    messages: current.messages,
    setMessages: (updater) => updateCurrentWithUpdater('messages', updater),
    pendingCapture: current.pendingCapture,
    setPendingCapture: (value) => updateCurrent({ pendingCapture: value }),
    pendingAsk: current.pendingAsk,
    setPendingAsk: (value) => updateCurrent({ pendingAsk: value }),
    pendingCard: current.pendingCard,
    setPendingCard: (updater) => updateCurrentWithUpdater('pendingCard', updater),
  }

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>
}

export function useChatSession() {
  const ctx = useContext(ChatSessionContext)
  if (!ctx) throw new Error('useChatSession must be used within a ChatSessionProvider')
  return ctx
}
