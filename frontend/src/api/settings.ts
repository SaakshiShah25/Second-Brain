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

// Permanently deletes the account and every row of data tied to it (see
// api/routers/settings.py's DELETE /account) - the Play Store's required
// account-deletion action. No cache update on success: the caller signs
// the user out and navigates away immediately, so there's nothing left
// to keep in sync.
export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => api.delete<void>('/api/settings/account'),
  })
}
