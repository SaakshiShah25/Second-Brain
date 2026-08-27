import { createContext, useContext, useState, type ReactNode } from 'react'
import type { CardFields, ChatMessage, ChatResult } from '../api/types'

interface PendingCard extends CardFields {
  context_note: string
}

// Narrows ChatResult down to just its two "needs a disambiguation choice"
// variants - the only shapes this ever actually holds.
export type PendingConfirm = Extract<ChatResult, { status: 'confirm_required' }>

interface ChatSessionContextValue {
  messages: ChatMessage[]
  setMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void
  pendingConfirm: PendingConfirm | null
  setPendingConfirm: (value: PendingConfirm | null) => void
  pendingCard: PendingCard | null
  setPendingCard: (value: PendingCard | null | ((prev: PendingCard | null) => PendingCard | null)) => void
}

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null)

// One unified conversation instead of separate per-mode threads (see the
// git history for the earlier Log-a-note/Ask-a-question split this
// replaced) - mounted once around the authenticated route tree (see
// App.tsx), not per-page, so navigating away and back doesn't lose it.
export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const [messages, setMessagesState] = useState<ChatMessage[]>([])
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)
  const [pendingCard, setPendingCardState] = useState<PendingCard | null>(null)

  // Functional updaters must resolve against setState's own `prev`, not a
  // value closed over at render time - see the stale-closure bug this
  // exact pattern fixed in the earlier per-mode version of this file.
  function setMessages(updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) {
    setMessagesState((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  }

  function setPendingCard(updater: PendingCard | null | ((prev: PendingCard | null) => PendingCard | null)) {
    setPendingCardState((prev) => (typeof updater === 'function' ? updater(prev) : updater))
  }

  const value: ChatSessionContextValue = {
    messages,
    setMessages,
    pendingConfirm,
    setPendingConfirm,
    pendingCard,
    setPendingCard,
  }

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>
}

export function useChatSession() {
  const ctx = useContext(ChatSessionContext)
  if (!ctx) throw new Error('useChatSession must be used within a ChatSessionProvider')
  return ctx
}
