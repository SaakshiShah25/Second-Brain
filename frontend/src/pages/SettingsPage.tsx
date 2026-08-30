import { Check, Compass, LogOut, Lock, Moon, Sun } from 'lucide-react'
import { useSettings, useUpdateSettings } from '../api/settings'
import type { FontSize, Theme } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import Card from '../components/Card'
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

      <Card>
        <button
          type="button"
          onClick={() => signOut()}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
        >
          <LogOut size={16} strokeWidth={1.6} />
          Sign out
        </button>
      </Card>
    </div>
  )
}
