import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export type GoogleFeature = 'calendar' | 'drive'

export interface GoogleStatus {
  connected: boolean
  email: string | null
  features: GoogleFeature[]
  // false = this server has no Google OAuth client configured - Google
  // options are hidden rather than shown and failing.
  configured: boolean
}

export interface DriveFolder {
  id: number
  folder_id: string
  name: string
  status: 'pending' | 'syncing' | 'ready' | 'error'
  total_files: number
  synced_files: number
  error: string | null
  last_synced_at: string | null
  syncing: boolean
}

export interface DriveBrowse {
  id: string
  name: string
  folders: { id: string; name: string }[]
}

export function useGoogleStatus() {
  return useQuery({ queryKey: ['google', 'status'], queryFn: () => api.get<GoogleStatus>('/api/google/status') })
}

// One Google connection for every feature: asks only for the features
// requested now (Google merges them with anything granted before), then
// sends the whole page to Google's consent screen, which returns to
// `returnTo` with ?google=connected (see GoogleReturnHandler).
export async function startGoogleConnect(features: GoogleFeature[], returnTo: 'settings' | 'documents' | 'digest') {
  const { authorize_url } = await api.post<{ authorize_url: string }>('/api/google/connect/start', {
    features,
    return_to: returnTo,
  })
  window.location.href = authorize_url
}

export function useDisconnectGoogle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/api/google/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google'] })
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })
}

export function useDriveFolders(enabled: boolean) {
  return useQuery({
    queryKey: ['google', 'drive-folders'],
    queryFn: () => api.get<DriveFolder[]>('/api/google/drive/folders'),
    enabled,
    // Poll while any folder is syncing so progress ("12 of 40") ticks up
    // and newly filed documents appear without a manual refresh.
    refetchInterval: (q) => (q.state.data?.some((f) => f.syncing) ? 2500 : false),
  })
}

export function browseDrive(parent: string, q?: string) {
  const params = new URLSearchParams({ parent })
  if (q) params.set('q', q)
  return api.get<DriveBrowse>(`/api/google/drive/browse?${params}`)
}

export function useAddDriveFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (folderId: string) => api.post<DriveFolder>('/api/google/drive/folders', { folder_id: folderId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['google', 'drive-folders'] }),
  })
}

export function useSyncDriveFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.post(`/api/google/drive/folders/${id}/sync`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['google', 'drive-folders'] }),
  })
}

export function useRemoveDriveFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/google/drive/folders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google', 'drive-folders'] })
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })
}
