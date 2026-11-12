import type { QueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { CaptureSavedResult } from '../api/types'

// Takes back everything one capture saved: its items, then its notes (deleting a note would take that note's items
// with it anyway; standalone items need deleting one by one). The lists are refreshed even if a delete fails part-way.
export async function deleteCapture(capture: CaptureSavedResult, queryClient: QueryClient): Promise<void> {
  try {
    await Promise.all(capture.parts.flatMap((p) => p.tasks_created.map((t) => api.delete(`/api/tasks/${t.id}`))))
    await Promise.all(capture.parts.filter((p) => p.interaction_id != null).map((p) => api.delete(`/api/notes/${p.interaction_id}`)))
  } finally {
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['notes'] })
    queryClient.invalidateQueries({ queryKey: ['initiatives'] })
  }
}
