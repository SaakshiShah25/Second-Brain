import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

// Mirrors api/routers/admin.py's /overview.
export interface UserStorage {
  notes: number; note_bytes: number; tasks: number; task_bytes: number
  documents: number; document_bytes: number; index_chunks: number; index_bytes: number
}

export interface AdminOverview {
  days: number
  generated_at: string
  persisted: boolean
  budget: { model: string; used: number; limit: number; left: number; blocked: boolean; minute_left: number | null }[]
  capacity: { action: 'capture' | 'question'; samples: number; avg_tokens: Record<string, number>; left_today: number | null }[]
  features: { kind: string; feature: string; model: string; calls: number; tokens: number; avg_tokens: number; median_ms: number | null }[]
  users: {
    user_id: string
    email: string
    captures: number
    questions: number
    tokens: number
    requests: number
    errors: number
    limits: number
    last_seen: string | null
    by_feature: Record<string, number>
    storage: UserStorage | null
    monthly: Record<'capture' | 'question', { used: number; cap: number | null } | null>
  }[]
  inactive: { user_id: string; email: string; joined: string | null; last_sign_in: string | null; storage: UserStorage | null; days_since_joined: number | null; days_since_sign_in: number | null }[]
  scale: { model: string; tokens_per_user_day: number; users_supported: number | null }[]
  storage: { available: boolean } & UserStorage
  accounts: number
  // Test accounts (…@myconfia.local, example.com…) are left out of every list here.
  hidden_accounts: number
  limits: { name: string; count: number; last: string | null; info: string; top_users: string[] }[]
  problems: { kind: 'error' | 'limit' | 'refused'; what: string; status: number | null; count: number; users: number; last: string | null; example: string | null; info: string }[]
  errors: { at: string; where: string; error_id: string; status: number | null; type: string | null; message: string | null; user: string | null }[]
  daily: { day: string; requests: number; captures: number; questions: number; tokens: number; errors: number; limits: number }[]
  totals: { requests: number; failed_requests: number; p95_ms: number | null; active_users: number }
}

export function useIsAdmin() {
  return useQuery({
    queryKey: ['admin', 'me'],
    queryFn: () => api.get<{ admin: boolean }>('/api/admin/me'),
    staleTime: Infinity,
  })
}

export function useAdminOverview(days: number) {
  return useQuery({
    queryKey: ['admin', 'overview', days],
    queryFn: () => api.get<AdminOverview>(`/api/admin/overview?days=${days}`),
    refetchInterval: 60_000,
  })
}

// Mirrors api/routers/admin.py's /feedback.
export interface AdminFeedback {
  available: boolean
  days: number
  ratings?: { count: number; average: number | null; counts: Record<'1' | '2' | '3' | '4', number>; weekly: { week: string; count: number; average: number }[] }
  reasons?: { tag: string; count: number }[]
  open_issues?: number
  items?: {
    id: number
    at: string
    kind: 'rating' | 'issue'
    rating: number | null
    tags: string[]
    message: string | null
    screen: string | null
    status: 'new' | 'seen' | 'fixed'
    user: string
    context: { app_version?: string; error_id?: string; about?: string; included?: string }
  }[]
}

export function useAdminFeedback(days = 30) {
  return useQuery({
    queryKey: ['admin', 'feedback', days],
    queryFn: () => api.get<AdminFeedback>(`/api/admin/feedback?days=${days}`),
    refetchInterval: 60_000,
  })
}

export function useSetFeedbackStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'new' | 'seen' | 'fixed' }) => api.patch(`/api/admin/feedback/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
  })
}
