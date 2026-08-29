import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { FontSize, Theme, UserPreference } from './types'

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<UserPreference>('/api/settings'),
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { theme?: Theme; font_size?: FontSize; daily_brief_email_enabled?: boolean }) =>
      api.patch<UserPreference>('/api/settings', body),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated)
    },
  })
}

export function useAcceptTerms() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<UserPreference>('/api/settings/accept-terms'),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated)
    },
  })
}

export function useCompleteTour() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<UserPreference>('/api/settings/complete-tour'),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated)
    },
  })
}
