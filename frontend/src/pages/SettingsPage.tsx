import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Compass, LogOut, Lock, Moon, Sun, Trash2 } from 'lucide-react'
import { useDeleteAccount, useSettings, useUpdateSettings } from '../api/settings'
import type { FontSize, Theme } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import AppLockSettings from '../components/AppLockSettings'
import Card from '../components/Card'
import ConfirmDialog from '../components/ConfirmDialog'
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

export default function SettingsPage() {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const { user, signOut } = useAuth()
  const { startTour } = useTour()
  const deleteAccount = useDeleteAccount()
  const navigate = useNavigate()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Settings</h1>

      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold tracking-tight text-text-muted">Profile</h2>
        <p className="text-[15px] text-text">{user?.email}</p>
      </Card>

      <Card className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <Lock size={15} strokeWidth={1.6} className="text-accent" />
          <h2 className="text-sm font-semibold tracking-tight text-text-muted">Privacy</h2>
        </div>
        <p className="text-xs leading-relaxed text-text-faint">
          Your notes are encrypted at rest in our database — anyone with direct database access sees only
          unreadable ciphertext, not your notes. To power search, the daily brief, and AI extraction, the app
          itself decrypts your notes and shares text with our AI providers (Groq, Cohere) for that processing
          only. We never sell or share your data.
        </p>
      </Card>

      <AppLockSettings />

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
                  <Icon size={16} strokeWidth={1.6} />
                  {label}
                </span>
                {active && <Check size={16} strokeWidth={1.6} />}
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
                {active && <Check size={16} strokeWidth={1.6} />}
              </button>
            )
          })}
        </div>
      </Card>

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
          <Compass size={16} strokeWidth={1.6} />
          Take the tour again
        </button>
      </Card>

      <Card className="mb-4">
        <button
          type="button"
          onClick={() => signOut()}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
        >
          <LogOut size={16} strokeWidth={1.6} />
          Sign out
        </button>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold tracking-tight text-text-muted">Danger zone</h2>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={deleteAccount.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-danger/40 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={16} strokeWidth={1.6} />
          {deleteAccount.isPending ? 'Deleting…' : 'Delete account'}
        </button>
        <p className="mt-2 text-xs text-text-faint">
          Permanently deletes your account and every note, contact, and task tied to it. This can't be undone.
        </p>
        {deleteAccount.isError && (
          <p className="mt-2 text-xs text-danger">Something went wrong - please try again.</p>
        )}
      </Card>

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete your account?"
          message="This permanently deletes your account and everything in it - every note, contact, and task. There's no way to undo this or recover the data afterward."
          confirmLabel="Delete permanently"
          busy={deleteAccount.isPending}
          busyLabel="Deleting…"
          onConfirm={() => {
            deleteAccount.mutate(undefined, {
              onSuccess: async () => {
                await signOut()
                navigate('/login', { replace: true })
              },
              onError: () => setConfirmingDelete(false),
            })
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}
