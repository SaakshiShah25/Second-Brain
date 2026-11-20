import { useState, type FormEvent } from 'react'
import { useCreateInitiative } from '../api/initiatives'
import Button from './Button'
import { ColorPicker } from './InitiativesManager'
import Sheet from './Sheet'
import { Input, Label } from './fields'

// "New space": a name and (optionally) a color. Spaces are also made automatically from notes; this is the way to
// make one by hand, so it is there to put things in before any note exists.
export default function NewSpaceSheet({ onClose }: { onClose: () => void }) {
  const create = useCreateInitiative()
  const [name, setName] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [error, setError] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setError('')
    create.mutate(
      { name: trimmed, color: color ?? undefined },
      {
        onSuccess: onClose,
        onError: () => setError("Couldn't make that space - it may already exist. Please try another name."),
      },
    )
  }

  return (
    <Sheet onClose={create.isPending ? undefined : onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <h3 className="text-lg font-semibold tracking-tight">New space</h3>
        <p className="-mt-2 text-[0.9375rem] text-text-muted">A place for related notes, to-dos and lists - Job, Fitness, Home, anything.</p>
        <div>
          <Label>Name</Label>
          <Input autoFocus value={name} maxLength={60} placeholder="e.g. Fitness" onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Color</Label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        {error && <p className="text-[0.8125rem] text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" className="flex-1" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={create.isPending || !name.trim()}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
