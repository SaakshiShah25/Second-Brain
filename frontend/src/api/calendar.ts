import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export function useCalendarStatus() {
  return useQuery({
    queryKey: ['calendar', 'status'],
    queryFn: () => api.get<{ connected: boolean }>('/api/calendar/status'),
  })
}

// Redirects the whole page to Google's consent screen on success - see
// api/routers/calendar.py's module docstring for why this can't just be
// a normal fetch (OAuth's redirect step can't carry our auth header).
export function useStartCalendarConnect() {
  return useMutation({
    mutationFn: () => api.post<{ authorize_url: string }>('/api/calendar/connect/start'),
    onSuccess: ({ authorize_url }) => {
      window.location.href = authorize_url
    },
    // No onError here before - a failed /connect/start (e.g. the backend's
    // Google OAuth env vars aren't configured, which raises a 503) just
    // left the button looking like it did nothing. isError/error below are
    // surfaced in DigestPage so the real problem is visible instead.
  })
}

export function useDisconnectCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/api/calendar/disconnect'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar', 'status'] }),
  })
}
