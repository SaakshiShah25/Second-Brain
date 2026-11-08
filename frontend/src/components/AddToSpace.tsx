import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useCreateList } from '../api/lists'
import { useCreateNote } from '../api/notes'
import { useCreateItem } from '../api/tasks'
import Button from './Button'
import Segmented from './Segmented'
import Sheet from './Sheet'
import { Input, Textarea } from './fields'

type Kind = 'todo' | 'list' | 'note'

const COPY: Record<Kind, { placeholder: string; hint?: string }> = {
  todo: { placeholder: 'What needs doing?', hint: 'Tap it afterwards to add a date, priority or reminder.' },
  list: { placeholder: 'Name of the list, e.g. Reading list', hint: 'Then tap the + on the list to add to it.' },
  note: { placeholder: 'Write your note' },
}

// The + at the top of a space: add by hand, without the chat - a to-do, a new (empty) list, or a note. Entries of a
// list are added from the + on the list itself. Everything lands in this space.
export default function AddToSpace({ spaceId, spaceName }: { spaceId: number | null; spaceName: string }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind>('todo')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const createItem = useCreateItem()
  const createNote = useCreateNote()
  const createList = useCreateList()
  const busy = createItem.isPending || createNote.isPending || createList.isPending

  function close() {
    setOpen(false)
    setText('')
    setError('')
  }

  async function save() {
    const clean = text.trim()
    if (!clean || busy) return
    setError('')
    try {
      if (kind === 'note') await createNote.mutateAsync({ raw_text: clean, initiative_id: spaceId })
      else if (kind === 'todo') await createItem.mutateAsync({ description: clean, list_id: null, initiative_id: spaceId })
      else await createList.mutateAsync({ name: clean, initiative_id: spaceId })
      close()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't add that - please try again.")
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Add to ${spaceName}`}
        className="pressable flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-contrast"
      >
        <Plus size={19} strokeWidth={2.4} />
      </button>
      {open && (
        <Sheet onClose={busy ? undefined : close} title={`Add to ${spaceName}`}>
          <Segmented
            className="mb-4"
            value={kind}
            onChange={(k) => {
              setKind(k)
              setError('')
            }}
            options={[
              { value: 'todo', label: 'To-do' },
              { value: 'list', label: 'List' },
              { value: 'note', label: 'Note' },
            ]}
          />
          {kind === 'note' ? (
            <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={COPY[kind].placeholder} autoFocus />
          ) : (
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={COPY[kind].placeholder} autoFocus />
          )}
          {COPY[kind].hint && <p className="mt-2 text-[0.8125rem] text-text-faint">{COPY[kind].hint}</p>}
          {error && <p className="mt-2 text-[0.8125rem] text-danger">{error}</p>}
          <Button variant="primary" block className="mt-4" onClick={save} disabled={!text.trim() || busy}>
            {busy ? 'Adding…' : kind === 'list' ? 'Create list' : 'Add'}
          </Button>
        </Sheet>
      )}
    </>
  )
}
