import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, fetchBlob } from './client'
import type { DocumentItem, DocumentSearchResult } from './types'

export function useDocuments() {
  return useQuery({ queryKey: ['documents'], queryFn: () => api.get<DocumentItem[]>('/api/documents') })
}

// One request per file (the backend analyses each with AI, which takes a
// few seconds) - the upload sheet runs several of these in parallel so
// each file gets its own progress row.
export function uploadDocument(file: File) {
  const form = new FormData()
  form.append('file', file, file.name)
  return api.post<DocumentItem>('/api/documents', form)
}

export function useUpdateDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, fields }: { id: number; fields: Partial<Pick<DocumentItem, 'title' | 'description' | 'category' | 'owner' | 'expiry_date'>> }) =>
      api.patch<DocumentItem>(`/api/documents/${id}`, fields),
    onSuccess: (updated) => {
      queryClient.setQueryData<DocumentItem[]>(['documents'], (prev) =>
        prev?.map((d) => (d.id === updated.id ? updated : d)),
      )
    },
  })
}

export function useDeleteDocuments() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) await api.delete(`/api/documents/${id}`)
      return ids
    },
    onSuccess: (ids) => {
      queryClient.setQueryData<DocumentItem[]>(['documents'], (prev) => prev?.filter((d) => !ids.includes(d.id)))
    },
  })
}

export function searchDocuments(text: string) {
  return api.post<DocumentSearchResult>('/api/documents/search', { text })
}

export const documentFile = (id: number) => fetchBlob(`/api/documents/${id}/file`)

export const documentZip = (ids: number[]) =>
  fetchBlob('/api/documents/export', { method: 'POST', body: JSON.stringify({ ids }) })

// Thumbnails are cached as object URLs for the session - react-query
// dedupes the fetch across the grid, the detail sheet and chat cards.
export function useDocumentThumbnail(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ['document-thumb', id],
    queryFn: async () => URL.createObjectURL(await fetchBlob(`/api/documents/${id}/thumbnail`)),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })
}
