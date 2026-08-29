import { useState } from 'react'
import { Check, Compass, LogOut, Lock, Moon, Plus, Sun, Trash2, X } from 'lucide-react'
import { useCreateInitiative, useDeleteInitiative, useInitiatives, useUpdateInitiative } from '../api/initiatives'
import { useSettings, useUpdateSettings } from '../api/settings'
import type { FontSize, Theme } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import Button from '../components/Button'
import Card from '../components/Card'
import ConfirmDialog from '../components/ConfirmDialog'
import { Input } from '../components/fields'
import { useTour } from '../components/TourGate'

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

const FONT_SIZE_OPTIONS: { value: FontSize; label: string; sample: string }[] = [
  { value: 'small', label: 'Small', sample: 'text-sm' },
  { value: 'default', label: 'Default', sample: 'text-base' },
  { value: 'large', label: 'Large', sample: 'text-lg' },
]

function InitiativesCard() {
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
    <Card className="mb-4">
      <h2 className="mb-1 text-sm font-semibold tracking-tight text-text-muted">Initiatives</h2>
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
    </Card>
  )
}

export default function SettingsPage() {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const { user, signOut } = useAuth()
  const { startTour } = useTour()

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Settings</h1>

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold tracking-tight text-text-muted">Profile</h2>
        <p className="text-[15px] text-text">{user?.email}</p>
      </Card>

      <Card className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <Lock size={15} strokeWidth={2} className="text-accent" />
          <h2 className="text-sm font-semibold tracking-tight text-text-muted">Privacy</h2>
        </div>
        <p className="text-xs leading-relaxed text-text-faint">
          Your notes are encrypted at rest in our database — anyone with direct database access sees only
          unreadable ciphertext, not your notes. To power search, the daily brief, and AI extraction, the app
          itself decrypts your notes and shares text with our AI providers (Groq, Cohere) for that processing
          only. We never sell or share your data.
        </p>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold tracking-tight text-text-muted">Appearance</h2>
        <div className="grid grid-cols-2 gap-2">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = settings?.theme === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => updateSettings.mutate({ theme: value })}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                  active
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border-strong text-text-muted hover:text-text'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon size={16} strokeWidth={2} />
                  {label}
                </span>
                {active && <Check size={16} strokeWidth={2} />}
              </button>
            )
          })}
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold tracking-tight text-text-muted">Text size</h2>
        <div className="flex flex-col gap-2">
          {FONT_SIZE_OPTIONS.map(({ value, label, sample }) => {
            const active = settings?.font_size === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => updateSettings.mutate({ font_size: value })}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
                  active
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border-strong text-text-muted hover:text-text'
                }`}
              >
                <span className={`${sample} font-medium`}>{label}</span>
                {active && <Check size={16} strokeWidth={2} />}
              </button>
            )
          })}
        </div>
      </Card>

      <InitiativesCard />

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold tracking-tight text-text-muted">Notifications</h2>
        <button
          type="button"
          onClick={() => updateSettings.mutate({ daily_brief_email_enabled: !settings?.daily_brief_email_enabled })}
          className="flex w-full items-center justify-between gap-3 rounded-lg py-1 text-left"
        >
          <span className="text-[15px] text-text">
            Daily morning brief by email
            <span className="mt-0.5 block text-xs text-text-muted">
              Today's tasks, calendar, and quiet relationships, sent each morning - on by default.
            </span>
          </span>
          <span
            className={`flex h-6 w-11 flex-shrink-0 items-center rounded-full p-0.5 transition-colors ${
              settings?.daily_brief_email_enabled ? 'bg-accent' : 'bg-bg-hover'
            }`}
          >
            <span
              className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                settings?.daily_brief_email_enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
        </button>
      </Card>

      <Card className="mb-4">
        <button
          type="button"
          onClick={() => startTour()}
          className="flex w-full items-center gap-2 rounded-lg py-1 text-left text-[15px] text-text transition-colors hover:text-accent"
        >
          <Compass size={16} strokeWidth={2} />
          Take the tour again
        </button>
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => signOut()}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
        >
          <LogOut size={16} strokeWidth={2} />
          Sign out
        </button>
      </Card>
    </div>
  )
}
