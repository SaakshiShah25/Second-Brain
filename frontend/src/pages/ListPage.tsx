import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useDeleteList, useLists, useUpdateList } from '../api/lists'
import { useTasks, useUpdateTaskStatus } from '../api/tasks'
import type { Task } from '../api/types'
import Button from '../components/Button'
import ConfirmDialog from '../components/ConfirmDialog'
import ItemRow from '../components/ItemRow'
import InitiativeBar from '../components/InitiativeBar'
import ItemSheet from '../components/ItemSheet'
import PageHeader from '../components/PageHeader'
import QuickAdd from '../components/QuickAdd'
import Sheet from '../components/Sheet'
import { Input, Label } from '../components/fields'
import { matchesInitiative, useInitiativeFilter } from '../lib/initiativeFilter'
import { byDue, openCountsByInitiative } from '../lib/items'
import { taskInitiativeId } from '../lib/taskOptions'
import { useOpenItem } from '../lib/useOpenItem'

// One list (Movies, Books, Birthdays...): a quick-add box, what's open - dated things first,
// then the rest in the order they were added - and what's done, folded away but still there
// (a book you've read stays findable).
export default function ListPage() {
  const navigate = useNavigate()
  const listId = Number(useParams().listId)
  const { data: lists, isLoading: listsLoading } = useLists()
  const { data } = useTasks('all')
  const updateStatus = useUpdateTaskStatus()
  const updateList = useUpdateList()
  const deleteList = useDeleteList()
  const [showDone, setShowDone] = useState(false)
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [form, setForm] = useState({ name: '', emoji: '' })
  const [confirmDelete, setConfirmDelete] = useState(false)

  const list = lists?.find((l) => l.id === listId)
  const inList = (data?.tasks ?? []).filter((t) => t.list_id === listId)
  const [initiativeFilter] = useInitiativeFilter()
  const items = inList.filter((t) => matchesInitiative(initiativeFilter, taskInitiativeId(t)))
  const sheet = useOpenItem(items)
  const open = items.filter((t) => t.status === 'open').sort((a, b) => byDue(a, b) || a.id - b.id)
  const done = items.filter((t) => t.status === 'done').sort((a, b) => b.id - a.id)
  const rowProps = {
    onToggle: (t: Task) => updateStatus.mutate({ taskId: t.id, status: t.status === 'done' ? 'open' : 'done', repeats: !!t.repeat }),
    onOpen: sheet.open,
  }

  if (!list) {
    return (
      <div>
        <PageHeader backTo="/lists" backLabel="Lists" />
        <p className="py-8 text-center text-[0.9375rem] text-text-muted">{listsLoading ? 'Loading…' : "This list doesn't exist any more."}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        backTo="/lists"
        backLabel="Lists"
        title={`${list.emoji ? `${list.emoji} ` : ''}${list.name}`}
        actions={
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-label="List options"
            className="pressable flex h-10 w-10 items-center justify-center rounded-full text-link"
          >
            <MoreHorizontal size={22} strokeWidth={2} />
          </button>
        }
      />

      <QuickAdd listId={list.id} placeholder={`Add to ${list.name}`} />

      {data && open.length === 0 && (
        <p className="py-6 text-center text-[0.9375rem] text-text-muted">
          {done.length ? 'All done here.' : 'Nothing here yet.'}
        </p>
      )}
      {open.length > 0 && (
        <div className="mb-5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
          {open.map((t) => (
            <ItemRow key={t.id} task={t} {...rowProps} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <section className="mb-5" aria-label="Done">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="pressable mb-2 flex items-center gap-1.5 px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-text-faint"
          >
            Done
            <span className="font-medium normal-case tracking-normal opacity-80">· {done.length}</span>
            <ChevronDown size={15} strokeWidth={2.2} className={showDone ? 'rotate-180' : ''} />
          </button>
          {showDone && (
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-bg-card">
              {done.map((t) => (
                <ItemRow key={t.id} task={t} {...rowProps} />
              ))}
            </div>
          )}
        </section>
      )}

      {sheet.active && <ItemSheet task={sheet.active} onClose={sheet.close} />}

      {menu && (
        <Sheet onClose={() => setMenu(false)}>
          {renaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                updateList.mutate(
                  { listId: list.id, name: form.name.trim(), emoji: form.emoji.trim() },
                  { onSuccess: () => { setRenaming(false); setMenu(false) } },
                )
              }}
              className="flex flex-col gap-3"
            >
              <h3 className="text-lg font-semibold tracking-tight">Rename list</h3>
              <div className="grid grid-cols-[4.5rem_1fr] gap-2">
                <div>
                  <Label>Emoji</Label>
                  <Input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} maxLength={8} className="text-center" />
                </div>
                <div>
                  <Label>Name</Label>
                  <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={40} />
                </div>
              </div>
              {updateList.isError && (
                <p className="text-[0.8125rem] text-danger">
                  {updateList.error instanceof Error ? updateList.error.message : "Couldn't save that - please try again."}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="button" className="flex-1" onClick={() => setRenaming(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" className="flex-1" disabled={!form.name.trim() || updateList.isPending}>
                  {updateList.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                size="lg"
                block
                onClick={() => {
                  setForm({ name: list.name, emoji: list.emoji ?? '' })
                  setRenaming(true)
                }}
              >
                <Pencil size={17} strokeWidth={2} /> Rename
              </Button>
              <Button variant="danger" size="lg" block onClick={() => setConfirmDelete(true)}>
                <Trash2 size={17} strokeWidth={2} /> Delete list
              </Button>
            </div>
          )}
        </Sheet>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete “${list.name}”?`}
          message={`This deletes the list and the ${inList.length} ${inList.length === 1 ? 'thing' : 'things'} in it. This cannot be undone.`}
          confirmLabel="Delete list"
          busy={deleteList.isPending}
          busyLabel="Deleting…"
          onConfirm={() => deleteList.mutate(list.id, { onSuccess: () => navigate('/lists', { replace: true }) })}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      <InitiativeBar counts={openCountsByInitiative(inList)} />
    </div>
  )
}
