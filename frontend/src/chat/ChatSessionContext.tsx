import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { ChatMessage } from '../api/types'
import { useAuth } from '../auth/AuthContext'

// Browser-local only, deliberately not sent to the backend - this is just
// the visible chat transcript (bubbles), not the actual notes/tasks
// data, which is already durably saved server-side regardless of this.
// Keyed per signed-in user so a second account on the same browser/device
// never sees a previous account's conversation.
function storageKey(userId: string) {
  return `confia:chat-messages:${userId}`
}

interface ChatSessionContextValue {
  messages: ChatMessage[]
  setMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void
}

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null)

// One unified conversation instead of separate per-mode threads (see the
// git history for the earlier Log-a-note/Ask-a-question split this
// replaced) - mounted once around the authenticated route tree (see
// App.tsx), not per-page, so navigating away and back doesn't lose it.
export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [messages, setMessagesState] = useState<ChatMessage[]>([])

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

  // Functional updaters must resolve against setState's own `prev`, not a
  // value closed over at render time - see the stale-closure bug this
  // exact pattern fixed in the earlier per-mode version of this file.
  //
  // Persisted here, on every actual change - not from an effect watching
  // `messages`. An effect fired right after the restore above (and twice
  // in React StrictMode) with the still-empty initial state, overwriting
  // the saved transcript with [] before the restored one landed - which
  // is what wiped the chat on every dev-mode refresh. Writing only when
  // the conversation really changes can't race the restore. Storage
  // failures (private browsing, quota) are ignored: the chat still works
  // in memory for the session.
  function setMessages(updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) {
    setMessagesState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (user) {
        try {
          localStorage.setItem(storageKey(user.id), JSON.stringify(next))
        } catch {
          // ignore - see comment above
        }
      }
      return next
    })
  }

  const value: ChatSessionContextValue = { messages, setMessages }

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>
}

export function useChatSession() {
  const ctx = useContext(ChatSessionContext)
  if (!ctx) throw new Error('useChatSession must be used within a ChatSessionProvider')
  return ctx
}
