import { useState } from 'react'
import { useInitiatives } from '../api/initiatives'
import { useNotes, useUpdateInteraction } from '../api/notes'
import { useTasks, useUpdateTaskFields } from '../api/tasks'
import type { Interaction, Task } from '../api/types'
import Button from '../components/Button'
import Sheet from '../components/Sheet'
import { toast } from '../components/Toast'
import { noteItems } from './noteSections'
import { taskInitiativeId } from './taskOptions'

/** Moving an item to another space - the one place that does it (the Space row in an item's sheet and
 * dragging it onto a space both come here). After it moves, the note it came from may no longer sit with it:
 * when the note was nothing but that one item it simply follows; otherwise the user is asked, because the
 * note's other points and items would move with it. Render `prompt` somewhere in the page. */
export function useMoveItem() {
  const updateFields = useUpdateTaskFields()
  const updateNote = useUpdateInteraction()
  const { data: initiatives } = useInitiatives()
  const { data: notes } = useNotes()
  const { data: taskData } = useTasks('all')
  const [ask, setAsk] = useState<{ note: Interaction; target: number | null; name: string; others: number } | null>(null)

  async function move(task: Task, initiativeId: number | null) {
    if (initiativeId === taskInitiativeId(task)) return
    const name = initiativeId === null ? 'Others' : (initiatives?.find((i) => i.id === initiativeId)?.name ?? 'that space')
    try {
      await updateFields.mutateAsync({ taskId: task.id, fields: { initiative_id: initiativeId } })
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : "Couldn't move that - please try again.")
      return
    }
    toast(`Moved to ${name}`)
    const note = (notes ?? []).find((n) => n.id === task.interaction_id)
    if (!note || (note.initiative_id ?? null) === initiativeId) return
    const others = (taskData?.tasks ?? []).filter((t) => t.interaction_id === note.id && t.id !== task.id).length
    if (noteItems(note).length === 0 && others === 0) {
      updateNote.mutate({ interactionId: note.id, fields: { initiative_id: initiativeId } })
    } else {
      setAsk({ note, target: initiativeId, name, others })
    }
  }

  const prompt = ask && (
    <Sheet onClose={() => setAsk(null)}>
      <h3 className="text-lg font-semibold tracking-tight">Move the note too?</h3>
      <p className="mt-1 text-[0.9375rem] leading-relaxed text-text-muted">
        This came from a note in {ask.note.initiative?.name ?? 'Others'}. Moving the note to {ask.name} puts its key points, decisions and concerns there as
        well{ask.others > 0 ? `, and its ${ask.others === 1 ? 'other item' : `${ask.others} other items`} move${ask.others === 1 ? 's' : ''} with it` : ''}.
      </p>
      {noteItems(ask.note).length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 rounded-xl bg-bg-elevated p-3 text-[0.875rem] leading-snug">
          {noteItems(ask.note).slice(0, 3).map((it, i) => (
            <li key={i} className="line-clamp-2">
              {it.text}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-col gap-2">
        <Button
          variant="primary"
          size="lg"
          block
          disabled={updateNote.isPending}
          onClick={() =>
            updateNote.mutate(
              { interactionId: ask.note.id, fields: { initiative_id: ask.target } },
              { onSuccess: () => toast(`Note moved to ${ask.name}`), onSettled: () => setAsk(null) },
            )
          }
        >
          {updateNote.isPending ? 'Moving…' : `Move the note to ${ask.name}`}
        </Button>
        <Button size="lg" block variant="ghost" onClick={() => setAsk(null)}>
          Just this one
        </Button>
      </div>
    </Sheet>
  )

  return { move, prompt }
}
