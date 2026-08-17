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
  })
}

export function useDisconnectCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/api/calendar/disconnect'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar', 'status'] }),
  })
}
