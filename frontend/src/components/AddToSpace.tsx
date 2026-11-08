import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useCreateList, useLists } from '../api/lists'
import { useCreateNote } from '../api/notes'
import { useCreateItem } from '../api/tasks'
import Button from './Button'
import Segmented from './Segmented'
import Sheet from './Sheet'
import { Input, Label, Select, Textarea } from './fields'

type Kind = 'todo' | 'list' | 'note'
// "Reading list" and "reading" are the same list.
const listKey = (name: string) => name.toLowerCase().replace(/\blist$/, '').trim()
const NEW = 'new'

// Adding by hand, without the chat: a to-do (it can have a date and a reminder, set afterwards from the item),
// an entry on one of the space's lists (nothing to tick off), or a note. Everything lands in this space.
export default function AddToSpace({ spaceId, spaceName }: { spaceId: number | null; spaceName: string }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind>('todo')
  const [text, setText] = useState('')
  const [listChoice, setListChoice] = useState<string>('')
  const [newList, setNewList] = useState('')
  const [error, setError] = useState('')
  const { data: lists = [] } = useLists()
  const createItem = useCreateItem()
  const createNote = useCreateNote()
  const createList = useCreateList()
  const busy = createItem.isPending || createNote.isPending || createList.isPending

  function close() {
    setOpen(false)
    setText('')
    setNewList('')
    setError('')
  }

  async function save() {
    const clean = text.trim()
    if (!clean || busy) return
    setError('')
    try {
      if (kind === 'note') {
        await createNote.mutateAsync({ raw_text: clean, initiative_id: spaceId })
      } else if (kind === 'todo') {
        await createItem.mutateAsync({ description: clean, list_id: null, initiative_id: spaceId })
      } else {
        let id = listChoice && listChoice !== NEW ? Number(listChoice) : null
        if (id === null) {
          const name = newList.trim()
          if (!name) return setError('Pick a list or name a new one.')
          // Reuse a list of the same name ("Reading list" and "reading list") instead of making a twin.
          const same = lists.find((l) => listKey(l.name) === listKey(name))
          id = same ? same.id : (await createList.mutateAsync({ name, initiative_id: spaceId })).id
        }
        await createItem.mutateAsync({ description: clean, list_id: id, initiative_id: spaceId })
      }
      close()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't add that - please try again.")
    }
  }

  const placeholder = kind === 'todo' ? 'What needs doing?' : kind === 'list' ? 'e.g. Dune' : 'Write your note'
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="flex items-center gap-1">
        <Plus size={16} strokeWidth={2.2} /> Add
      </Button>
      {open && (
        <Sheet onClose={busy ? undefined : close} title={`Add to ${spaceName}`}>
          <Segmented
            className="mb-4"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'todo', label: 'To-do' },
              { value: 'list', label: 'List' },
              { value: 'note', label: 'Note' },
            ]}
          />
          {kind === 'list' && (
            <div className="mb-3">
              <Label>Which list</Label>
              <Select value={listChoice} onChange={(e) => setListChoice(e.target.value)}>
                <option value="">Choose…</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.emoji ? `${l.emoji} ` : ''}
                    {l.name}
                  </option>
                ))}
                <option value={NEW}>+ New list</option>
              </Select>
              {(listChoice === NEW || (!listChoice && lists.length === 0)) && (
                <Input className="mt-2" value={newList} onChange={(e) => setNewList(e.target.value)} placeholder="Name of the list, e.g. Reading list" />
              )}
            </div>
          )}
          {kind === 'note' ? (
            <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} autoFocus />
          ) : (
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} autoFocus />
          )}
          {kind === 'todo' && <p className="mt-2 text-[0.8125rem] text-text-faint">Tap it afterwards to add a date, priority or reminder.</p>}
          {error && <p className="mt-2 text-[0.8125rem] text-danger">{error}</p>}
          <Button variant="primary" block className="mt-4" onClick={save} disabled={!text.trim() || busy}>
            {busy ? 'Adding…' : 'Add'}
          </Button>
        </Sheet>
      )}
    </>
  )
}
