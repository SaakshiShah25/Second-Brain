import { useQuery } from '@tanstack/react-query'
import { api } from './client'

// Mirrors api/routers/admin.py's /overview.
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
    monthly: Record<'capture' | 'question', { used: number; cap: number | null } | null>
  }[]
  limits: { name: string; count: number; last: string | null; info: string; top_users: string[] }[]
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
