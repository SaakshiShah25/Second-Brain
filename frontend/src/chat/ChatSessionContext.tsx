import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { CardFields, ChatMessage, ChatResult } from '../api/types'
import { useAuth } from '../auth/AuthContext'

// Browser-local only, deliberately not sent to the backend - this is just
// the visible chat transcript (bubbles), not the actual notes/people/tasks
// data, which is already durably saved server-side regardless of this.
// Keyed per signed-in user so a second account on the same browser/device
// never sees a previous account's conversation.
function storageKey(userId: string) {
  return `confia:chat-messages:${userId}`
}

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
  const { user } = useAuth()
  const [messages, setMessagesState] = useState<ChatMessage[]>([])
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)
  const [pendingCard, setPendingCardState] = useState<PendingCard | null>(null)

  // Restore this device's transcript on login/refresh, and reset to empty
  // on a user switch rather than leaving a previous account's in-memory
  // messages lingering until their own (possibly empty) storage loads.
  useEffect(() => {
    if (!user) return
    try {
      const raw = localStorage.getItem(storageKey(user.id))
      setMessagesState(raw ? JSON.parse(raw) : [])
    } catch {
      setMessagesState([])
    }
    // Deliberately keyed on user.id, not the user object - a refreshed
    // session hands back a new user object with the same id, which
    // shouldn't re-trigger a reload of the transcript from storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // Persisted on every change - a page refresh or closing the tab no
  // longer wipes the conversation. Failures (private browsing, storage
  // disabled/full) are silently ignored: the chat still works in-memory
  // for the rest of this session either way.
  useEffect(() => {
    if (!user) return
    try {
      localStorage.setItem(storageKey(user.id), JSON.stringify(messages))
    } catch {
      // ignore - see comment above
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, user?.id])

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
