import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { AgreementUploadResult, Client, ClientDetail } from './types'

export function useClients() {
  return useQuery({ queryKey: ['clients'], queryFn: () => api.get<Client[]>('/api/clients') })
}

export function useClient(clientId: number | undefined) {
  return useQuery({
    queryKey: ['clients', clientId],
    queryFn: () => api.get<ClientDetail>(`/api/clients/${clientId}`),
    enabled: clientId !== undefined,
  })
}

// Upload only extracts + previews - nothing is saved until the reviewed
// fields are POSTed to /confirm (see api/schemas.py's ClientConfirmRequest
// docstring for why contract data gets this extra review step that a
// casual note capture doesn't).
export function useUploadAgreement() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return api.post<AgreementUploadResult>('/api/clients/upload', formData)
    },
  })
}

export function useConfirmAgreement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fields: Record<string, unknown>) => api.post<ClientDetail>('/api/clients/confirm', fields),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  })
}

export function useExtendClient(clientId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (months: number) => api.post<ClientDetail>(`/api/clients/${clientId}/extend`, { months }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['clients', clientId] })
    },
  })
}

export function useUpdateClient(clientId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fields: Partial<Client>) => api.patch<ClientDetail>(`/api/clients/${clientId}`, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['clients', clientId] })
    },
  })
}

export function useDeleteClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (clientId: number) => api.delete(`/api/clients/${clientId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  })
}

// Fetched eagerly (not click-triggered) so "View original document" can be
// a real <a target="_blank"> anchor with an href ready before the user
// clicks - a programmatic window.open() after an awaited fetch gets killed
// by popup blockers in most browsers (confirmed live), but a genuine
// anchor click is always treated as a trusted user gesture. Signed URLs
// are valid for 1hr server-side; this only needs to survive one page visit.
export function useClientDocumentUrl(clientId: number | undefined, hasDocument: boolean) {
  return useQuery({
    queryKey: ['clients', clientId, 'document'],
    queryFn: () => api.get<{ url: string; filename: string }>(`/api/clients/${clientId}/document`),
    enabled: clientId !== undefined && hasDocument,
    staleTime: 1000 * 60 * 45,
  })
}
