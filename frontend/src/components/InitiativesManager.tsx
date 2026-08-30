import { useState } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import { useCreateInitiative, useDeleteInitiative, useInitiatives, useUpdateInitiative } from '../api/initiatives'
import Button from './Button'
import ConfirmDialog from './ConfirmDialog'
import { Input } from './fields'

// Initiative CRUD (add/rename/delete) - lives on the Notes page as its
// own tab rather than buried in Settings, since initiatives are exactly
// the categories the Notes page's own filter chips use. Settings is for
// config you set up once and forget; this is something the user is
// expected to come back to regularly as their notes evolve.
export default function InitiativesManager() {
  const { data: initiatives } = useInitiatives()
  const createInitiative = useCreateInitiative()
  const updateInitiative = useUpdateInitiative()
  const deleteInitiative = useDeleteInitiative()

  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  function startRename(id: number, currentName: string) {
    setRenamingId(id)
    setRenameDraft(currentName)
  }

  function saveRename(id: number) {
    const name = renameDraft.trim()
    if (name) updateInitiative.mutate({ id, fields: { name } })
    setRenamingId(null)
  }

  return (
    <div>
      <p className="mb-3 text-xs text-text-faint">
        Notes are automatically classified into these when you log them - manage your own categories here.
      </p>

      <div className="flex flex-col gap-2">
        {initiatives?.map((i) => (
          <div key={i.id} className="flex items-center gap-2 rounded-lg border border-border-strong px-3 py-2">
            {renamingId === i.id ? (
              <>
                <Input
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveRename(i.id)}
                  className="flex-1"
                />
                <Button onClick={() => saveRename(i.id)} disabled={updateInitiative.isPending}>
                  <Check size={14} strokeWidth={2} />
                </Button>
                <Button onClick={() => setRenamingId(null)}>
                  <X size={14} strokeWidth={2} />
                </Button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => startRename(i.id, i.name)}
                  className="flex-1 truncate text-left text-[15px] text-text"
                  title="Click to rename"
                >
                  {i.name}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(i.id)}
                  className="flex-shrink-0 text-text-faint transition-colors hover:text-danger"
                  title="Delete initiative"
                >
                  <Trash2 size={15} strokeWidth={2} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const name = newName.trim()
          if (!name) return
          createInitiative.mutate({ name }, { onSuccess: () => setNewName('') })
        }}
        className="mt-3 flex gap-2"
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add an initiative…"
          className="flex-1"
        />
        <Button type="submit" disabled={!newName.trim() || createInitiative.isPending}>
          <Plus size={14} strokeWidth={2} />
        </Button>
      </form>
      {createInitiative.isError && (
        <p className="mt-2 text-xs text-danger">
          {createInitiative.error instanceof Error ? createInitiative.error.message : 'Could not add that.'}
        </p>
      )}

      {confirmDeleteId !== null && (
        <ConfirmDialog
          title="Delete initiative"
          message="Notes tagged with this initiative will become Uncategorized, not deleted."
          confirmLabel="Delete"
          onConfirm={() => {
            deleteInitiative.mutate(confirmDeleteId)
            setConfirmDeleteId(null)
          }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}
