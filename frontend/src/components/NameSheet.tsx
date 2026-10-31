import { useState, type FormEvent } from 'react'
import { saveName, skipNamePrompt } from '../lib/displayName'
import Button from './Button'
import Sheet from './Sheet'
import { Input, Label } from './fields'

// "What should we call you?" - asked once on the first visit after sign-in (and editable any time in Settings),
// because an email address is rarely a name. `asking` marks the one-time prompt, where closing means "skip".
export default function NameSheet({ initial = '', asking = false, onClose }: { initial?: string; asking?: boolean; onClose: () => void }) {
  const [name, setName] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      await saveName(name)
      onClose()
    } catch {
      setError("Couldn't save that - please try again.")
      setSaving(false)
    }
  }

  function skip() {
    if (asking) void skipNamePrompt()
    onClose()
  }

  return (
    <Sheet onClose={saving ? undefined : skip}>
      <form onSubmit={handleSave} className="flex flex-col gap-3.5">
        <h3 className="text-lg font-semibold tracking-tight">What should we call you?</h3>
        <p className="-mt-2 text-[0.9375rem] text-text-muted">Your first name is fine. It's only used to greet you.</p>
        <div>
          <Label>Name</Label>
          <Input autoFocus autoComplete="given-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </div>
        {error && <p className="text-[0.8125rem] text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" className="flex-1" onClick={skip} disabled={saving}>
            {asking ? 'Skip' : 'Cancel'}
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
