import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Task } from '../api/types'

/** Which item's sheet is open on a page. Arriving with ?open=<id> (from a chat receipt or an
 * answer's source) opens that item; closing the sheet drops the parameter so Back doesn't
 * reopen it. */
export function useOpenItem(tasks: Task[]) {
  const [params, setParams] = useSearchParams()
  const [openId, setOpenId] = useState<number | null>(null)
  const fromLink = Number(params.get('open')) || null
  const id = openId ?? fromLink
  const active = id == null ? null : (tasks.find((t) => t.id === id) ?? null)

  function close() {
    setOpenId(null)
    if (fromLink) setParams((p) => {
      p.delete('open')
      return p
    }, { replace: true })
  }

  return { active, open: (task: Task) => setOpenId(task.id), close }
}
