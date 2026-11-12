import { useState } from 'react'
import { CircleSlash } from 'lucide-react'
import { useCreateInitiative, useInitiatives } from '../api/initiatives'
import Button from './Button'
import CategoryBubbles from './CategoryBubbles'
import ConfirmDialog from './ConfirmDialog'
import Sheet from './Sheet'
import { Input } from './fields'

// "Which space?" as a bottom sheet of bubbles, with a way to make a new one on the spot. `onPick(null)` means
// Others (no space). Used to change where a logged note went and to move a task.
export default function CategorySheet({
  title,
  currentId,
  onPick,
  onClose,
}: {
  title: string
  currentId: number | null
  onPick: (id: number | null) => Promise<void> | void
  onClose: () => void
}) {
  const { data: initiatives = [] } = useInitiatives()
  const createInitiative = useCreateInitiative()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Picking a different space asks "Move to X?" first.
  const [confirming, setConfirming] = useState<number | null | undefined>(undefined)
  const nameOf = (id: number | null) => (id === null ? 'Others' : (initiatives.find((i) => i.id === id)?.name ?? 'that space'))

  async function pick(id: number | null) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onPick(id)
      onClose()
    } catch {
      setError("Couldn't change that - please try again.")
      setBusy(false)
    }
  }

  async function createAndPick() {
    const clean = name.trim()
    if (!clean || busy) return
    setBusy(true)
    setError('')
    try {
      const made = await createInitiative.mutateAsync({ name: clean })
      await onPick(made.id)
      onClose()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't create that space.")
      setBusy(false)
    }
  }

  return (
    <Sheet onClose={busy ? undefined : onClose}>
      <h3 className="mb-4 text-lg font-semibold tracking-tight">{title}</h3>
      <CategoryBubbles
        initiatives={initiatives}
        selectedId={currentId}
        onSelect={(id) => (id === currentId ? pick(id) : setConfirming(id))}
        noneLabel="Others"
        noneIcon={CircleSlash}
        onCreate={() => setNaming(true)}
      />
      {naming && (
        <div className="mt-4 flex flex-col gap-2">
          <Input
            autoFocus
            placeholder="New space name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createAndPick()}
          />
          <Button variant="primary" disabled={!name.trim() || busy} onClick={createAndPick}>
            {busy ? 'Saving…' : 'Create and use it'}
          </Button>
        </div>
      )}
      {error && <p className="mt-3 text-[0.8125rem] text-danger">{error}</p>}
      {confirming !== undefined && (
        <ConfirmDialog
          tone="primary"
          title={`Move to ${nameOf(confirming)}?`}
          message={`This will be filed under ${nameOf(confirming)} instead.`}
          confirmLabel="Move"
          busy={busy}
          busyLabel="Moving…"
          onCancel={() => setConfirming(undefined)}
          onConfirm={() => pick(confirming)}
        />
      )}
    </Sheet>
  )
}
