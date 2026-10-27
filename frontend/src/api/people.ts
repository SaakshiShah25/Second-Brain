import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { CompanyGroup, Person, PersonDetailResponse, PersonMemory } from './types'

export function usePeople() {
  return useQuery({ queryKey: ['people'], queryFn: () => api.get<Person[]>('/api/people') })
}

export function useCompanies() {
  return useQuery({ queryKey: ['people', 'companies'], queryFn: () => api.get<CompanyGroup[]>('/api/people/companies') })
}

// Button-triggered, same reasoning as useBriefing below - a company's
// briefing is expensive (one LLM call synthesizing every contact there)
// so it should only fire when asked for, not on every page load.
export function useCompanyBriefing() {
  return useMutation({
    mutationFn: (company: string) =>
      api.get<{ briefing: string }>(`/api/people/companies/${encodeURIComponent(company)}/briefing`),
  })
}

export function usePerson(personId: number | undefined) {
  return useQuery({
    queryKey: ['people', personId],
    queryFn: () => api.get<PersonDetailResponse>(`/api/people/${personId}`),
    enabled: personId !== undefined,
  })
}

export function useUpdatePerson(personId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fields: Partial<Person>) => api.patch<Person>(`/api/people/${personId}`, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
    },
  })
}

// Adds one dated entry to the personal-notes timeline - distinct from
// useUpdatePerson's bulk PATCH since personal_notes is append-only, not
// an overwritable field (see api/schemas.py's PersonUpdate docstring).
export function useAddPersonalNote(personId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (note: string) => api.post<Person>(`/api/people/${personId}/personal_notes`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      queryClient.invalidateQueries({ queryKey: ['people', personId] })
    },
  })
}

export function useDeletePersonalNote(personId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entryIndex: number) => api.delete<Person>(`/api/people/${personId}/personal_notes/${entryIndex}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      queryClient.invalidateQueries({ queryKey: ['people', personId] })
    },
  })
}

export function useDeletePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (personId: number) => api.delete(`/api/people/${personId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people'] }),
  })
}

export function useMergePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ personId, targetId }: { personId: number; targetId: number }) =>
      api.post<{ person_id: number }>(`/api/people/${personId}/merge`, { target_id: targetId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['people'] }),
  })
}

// A button-triggered fetch, not an automatic-on-mount one (matches the
// Streamlit "Get briefing" button) - useMutation fits that better than
// useQuery here, even though it's semantically a GET.
export function useBriefing(personId: number) {
  return useMutation({
    mutationFn: () => api.get<{ briefing: string }>(`/api/people/${personId}/briefing`),
  })
}

export function useUpdateInteraction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ interactionId, fields }: { interactionId: number; fields: Record<string, unknown> }) =>
      api.patch(`/api/people/interactions/${interactionId}`, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

export function useDeleteInteraction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (interactionId: number) => api.delete(`/api/people/interactions/${interactionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

// Key dates and remembered details (schema.sql section 31). Each call returns
// the person's refreshed memory, which is written straight into the cached
// person so the screen updates without a refetch.
function useMemoryMutation<V>(personId: number, call: (v: V) => Promise<PersonMemory>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: call,
    onSuccess: (memory) => {
      queryClient.setQueryData<PersonDetailResponse>(['people', personId], (old) => (old ? { ...old, memory } : old))
    },
  })
}

export interface NewKeyDate {
  date_type: 'birthday' | 'anniversary' | 'custom'
  label?: string
  subject?: string
  subject_name?: string
  month: number
  day?: number
  year?: number
}

export function useAddKeyDate(personId: number) {
  return useMemoryMutation<NewKeyDate>(personId, (body) =>
    api.post<PersonMemory>(`/api/people/${personId}/key_dates`, body))
}

export function useDeleteKeyDate(personId: number) {
  return useMemoryMutation<number>(personId, (id) => api.delete<PersonMemory>(`/api/people/${personId}/key_dates/${id}`))
}

export function useAddPersonFact(personId: number) {
  return useMemoryMutation<{ attribute: string; value: string; subject?: string; subject_name?: string }>(
    personId, (body) => api.post<PersonMemory>(`/api/people/${personId}/facts`, body))
}

export function useDeletePersonFact(personId: number) {
  return useMemoryMutation<number>(personId, (id) => api.delete<PersonMemory>(`/api/people/${personId}/facts/${id}`))
}
