import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useCreateList, useLists } from '../api/lists'
import { useTasks } from '../api/tasks'
import Button from '../components/Button'
import { ListGroup, ListRow } from '../components/ListGroup'
import InitiativeBar from '../components/InitiativeBar'
import PageHeader from '../components/PageHeader'
import Sheet from '../components/Sheet'
import { Input, Label } from '../components/fields'
import { matchesInitiative, useInitiativeFilter } from '../lib/initiativeFilter'
import { itemPath, openCountsByInitiative, todayIso } from '../lib/items'
import { taskInitiativeId } from '../lib/taskOptions'

const Emoji = ({ children }: { children: string }) => <span className="text-[1.125rem] leading-none">{children}</span>

// Every pile in one place: the main Tasks list first, then the lists the AI (or the user) made -
// Movies, Books, Groceries, Birthdays, Routines. Each shows how many things are open in it.
export default function ListsPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { data: lists } = useLists()
  const { data } = useTasks('all')
  const createList = useCreateList()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const tasks = useMemo(() => data?.tasks ?? [], [data])
  const [initiativeFilter] = useInitiativeFilter()
  const focused = useMemo(() => tasks.filter((t) => matchesInitiative(initiativeFilter, taskInitiativeId(t))), [tasks, initiativeFilter])

  // ?open=<id> (from a chat receipt or an answer's source): go to that item's own list.
  const openId = Number(params.get('open')) || null
  useEffect(() => {
    if (!openId || !data) return
    const item = tasks.find((t) => t.id === openId)
    navigate(item ? itemPath(item.list_id, item.id) : '/lists', { replace: true })
  }, [openId, data, tasks, navigate])

  const today = todayIso()
  const counts = new Map<number | null, { open: number; due: number }>()
  for (const t of focused) {
    if (t.status !== 'open') continue
    const key = t.list_id ?? null
    const c = counts.get(key) ?? { open: 0, due: 0 }
    c.open += 1
    if (t.due_date && t.due_date <= today) c.due += 1
    counts.set(key, c)
  }
  const detail = (key: number | null) => {
    const c = counts.get(key)
    if (!c) return data ? (initiativeFilter === null ? 'Empty' : 'Nothing here') : ''
    return `${c.open} open${c.due ? ` · ${c.due} due` : ''}`
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    createList.mutate(
      { name: trimmed },
      {
        onSuccess: (list) => {
          setCreating(false)
          setName('')
          navigate(`/lists/${list.id}`)
        },
      },
    )
  }

  // With a category in focus, only the lists that hold something of its are shown.
  const visible = (key: number | null) => initiativeFilter === null || counts.has(key)

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Lists"
        showProfile
        actions={
          <button
            type="button"
            onClick={() => setCreating(true)}
            aria-label="New list"
            className="pressable flex h-10 w-10 items-center justify-center rounded-full text-link"
          >
            <Plus size={22} strokeWidth={2} />
          </button>
        }
      />

      <ListGroup>
        {visible(null) && <ListRow leading={<Emoji>☑️</Emoji>} label="Tasks" detail={detail(null)} to="/tasks" />}
        {(lists ?? []).filter((l) => visible(l.id)).map((l) => (
          <ListRow key={l.id} leading={<Emoji>{l.emoji || '📝'}</Emoji>} label={l.name} detail={detail(l.id)} to={`/lists/${l.id}`} />
        ))}
      </ListGroup>

      {lists && lists.length === 0 && (
        <p className="-mt-3 mb-6 px-4 text-[0.8125rem] leading-relaxed text-text-faint">
          Lists appear on their own as you go - say “add Dune to my reading list” or “Oppenheimer, must watch” on Home. Or tap + to
          make one.
        </p>
      )}

      <InitiativeBar counts={openCountsByInitiative(tasks)} />

      {creating && (
        <Sheet onClose={() => setCreating(false)}>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold tracking-tight">New list</h3>
            <div>
              <Label>Name</Label>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Movies, Gift ideas, Packing" maxLength={40} />
            </div>
            {createList.isError && (
              <p className="text-[0.8125rem] text-danger">
                {createList.error instanceof Error ? createList.error.message : "Couldn't create it - please try again."}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" className="flex-1" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" className="flex-1" disabled={!name.trim() || createList.isPending}>
                {createList.isPending ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </form>
        </Sheet>
      )}
    </div>
  )
}
