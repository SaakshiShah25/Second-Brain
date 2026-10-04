import { useState } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import { useCreateInitiative, useDeleteInitiative, useInitiatives, useUpdateInitiative } from '../api/initiatives'
import { getInitiativeStyle, PICKABLE_INITIATIVE_COLORS } from '../lib/initiativeStyle'
import Button from './Button'
import ConfirmDialog from './ConfirmDialog'
import { Input } from './fields'

// A row of selectable color dots, shared by the create form and the
// rename form below - "Auto" (null) reverts to the icon/color the name
// itself derives (see getInitiativeStyle), for anyone who picked a color
// and changed their mind rather than making them guess which swatch
// matches the default.
function ColorPicker({ value, onChange }: { value: string | null; onChange: (color: string | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        title="Auto (based on name)"
        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold ${
          value === null ? 'border-accent text-accent' : 'border-border-strong text-text-faint'
        }`}
      >
        A
      </button>
      {PICKABLE_INITIATIVE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          className="h-6 w-6 flex-shrink-0 rounded-full transition-transform"
          style={{
            backgroundColor: c,
            outline: value === c ? `2px solid ${c}` : 'none',
            outlineOffset: 2,
            transform: value === c ? 'scale(1.05)' : undefined,
          }}
        />
      ))}
    </div>
  )
}

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
  const [newColor, setNewColor] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameColor, setRenameColor] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  function startRename(id: number, currentName: string, currentColor: string | null) {
    setRenamingId(id)
    setRenameDraft(currentName)
    setRenameColor(currentColor)
  }

  function saveRename(id: number) {
    const name = renameDraft.trim()
    if (name) updateInitiative.mutate({ id, fields: { name, color: renameColor } })
    setRenamingId(null)
  }

  return (
    <div>
      <p className="mb-3 text-xs text-text-faint">
        Notes are automatically classified into these when you log them - manage your own categories here.
      </p>

      <div className="flex flex-col gap-2">
        {initiatives?.map((i) => {
          const catStyle = getInitiativeStyle(i)
          return (
            <div key={i.id} className="rounded-lg border border-border-strong px-3 py-2">
              {renamingId === i.id ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveRename(i.id)}
                      className="flex-1"
                    />
                    <Button onClick={() => saveRename(i.id)} disabled={updateInitiative.isPending}>
                      <Check size={14} strokeWidth={1.6} />
                    </Button>
                    <Button onClick={() => setRenamingId(null)}>
                      <X size={14} strokeWidth={1.6} />
                    </Button>
                  </div>
                  <ColorPicker value={renameColor} onChange={setRenameColor} />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {catStyle && (
                    <span
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${catStyle.color}1a`, color: catStyle.color }}
                    >
                      <catStyle.Icon size={14} strokeWidth={1.8} />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => startRename(i.id, i.name, i.color)}
                    className="flex-1 truncate text-left text-[15px] text-text"
                    title="Click to rename or change color"
                  >
                    {i.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(i.id)}
                    className="flex-shrink-0 text-text-faint transition-colors hover:text-danger"
                    title="Delete initiative"
                  >
                    <Trash2 size={15} strokeWidth={1.6} />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const name = newName.trim()
          if (!name) return
          createInitiative.mutate(
            { name, color: newColor ?? undefined },
            { onSuccess: () => { setNewName(''); setNewColor(null) } },
          )
        }}
        className="mt-3 flex flex-col gap-2"
      >
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add an initiative…"
            className="flex-1"
          />
          <Button type="submit" disabled={!newName.trim() || createInitiative.isPending}>
            <Plus size={14} strokeWidth={1.6} />
          </Button>
        </div>
        {newName.trim() && <ColorPicker value={newColor} onChange={setNewColor} />}
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
          busy={deleteInitiative.isPending}
          busyLabel="Deleting…"
          onConfirm={() => {
            deleteInitiative.mutate(confirmDeleteId, { onSettled: () => setConfirmDeleteId(null) })
          }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}
