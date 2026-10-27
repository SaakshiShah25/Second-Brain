import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Compass, LogOut, Mail, Moon, ShieldCheck, Sun, Trash2, Type } from 'lucide-react'
import { useDeleteAccount, useSettings, useUpdateSettings } from '../api/settings'
import type { FontSize, Theme } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import AppLockSettings from '../components/AppLockSettings'
import ConfirmDialog from '../components/ConfirmDialog'
import { ListGroup, ListRow, Toggle } from '../components/ListGroup'
import PageHeader from '../components/PageHeader'
import Segmented from '../components/Segmented'
import { useTour } from '../components/TourGate'
import { USAGE_MODE_OPTIONS, useUsageMode } from '../lib/usageMode'

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Paper', icon: Sun },
  { value: 'dark', label: 'Graphite', icon: Moon },
]

const FONT_SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
]

export default function SettingsPage() {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const { user, signOut } = useAuth()
  const { startTour } = useTour()
  const deleteAccount = useDeleteAccount()
  const navigate = useNavigate()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const initial = (user?.email?.[0] ?? '?').toUpperCase()
  const usage = useUsageMode()

  return (
    <div>
      <PageHeader backTo="/" title="Settings" />

      <div className="mb-6 flex items-center gap-3.5 rounded-2xl border border-border bg-bg-card p-4">
        <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-accent text-xl font-semibold text-accent-contrast">
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{user?.email}</p>
          <p className="text-sm text-text-muted">Signed in</p>
        </div>
      </div>

      {usage.available && (
        <ListGroup
          title="Using MyConfía for"
          footer={
            usage.mode === 'work'
              ? 'Shortcuts, wording and your morning brief are tuned for clients, colleagues and deadlines.'
              : usage.mode === 'personal'
                ? 'Wording and your morning brief are tuned for friends, family and everyday to-dos.'
                : 'Work and personal wording side by side.'
          }
        >
          <div className="px-4 py-3">
            <Segmented
              value={usage.mode}
              onChange={(v) => updateSettings.mutate({ usage_mode: v })}
              options={USAGE_MODE_OPTIONS.map(({ value, label, icon: Icon }) => ({
                value,
                label: (
                  <>
                    <Icon size={15} strokeWidth={1.8} /> {label}
                  </>
                ),
              }))}
            />
          </div>
        </ListGroup>
      )}

      <ListGroup title="Appearance">
        <div className="px-4 py-3">
          <p className="mb-2 text-sm text-text-muted">Theme</p>
          <div className="grid grid-cols-2 gap-2.5">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
              const active = settings?.theme === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateSettings.mutate({ theme: value })}
                  className={`pressable relative overflow-hidden rounded-xl border-2 text-left ${
                    active ? 'border-accent' : 'border-border'
                  }`}
                >
                  {/* Mini preview of each theme's ground + ink + accent. */}
                  <span
                    className="block h-16 p-2.5"
                    style={{ background: value === 'light' ? '#fdfbf7' : '#141210' }}
                  >
                    <span
                      className="mb-1.5 block h-2 w-10 rounded-full"
                      style={{ background: value === 'light' ? '#1b1a17' : '#f2efe8' }}
                    />
                    <span
                      className="block h-2 w-16 rounded-full opacity-40"
                      style={{ background: value === 'light' ? '#1b1a17' : '#f2efe8' }}
                    />
                    <span
                      className="absolute top-2.5 right-2.5 h-4 w-4 rounded-full"
                      style={{ background: '#ea580c' }}
                    />
                  </span>
                  <span className="flex items-center justify-between bg-bg-card px-2.5 py-2 text-sm font-medium">
                    <span className="flex items-center gap-1.5">
                      <Icon size={15} strokeWidth={1.8} />
                      {label}
                    </span>
                    {active && <Check size={16} strokeWidth={2.4} className="text-accent" />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm text-text-muted">
            <Type size={14} strokeWidth={1.8} /> Text size
          </p>
          <Segmented
            value={settings?.font_size ?? 'default'}
            onChange={(v) => updateSettings.mutate({ font_size: v })}
            options={FONT_SIZE_OPTIONS}
          />
        </div>
      </ListGroup>

      <ListGroup
        title="Notifications"
        footer="What’s overdue and what’s due today — sent every morning."
      >
        <ListRow
          icon={Mail}
          iconColor="var(--sb-text-muted)"
          soft
          label="Morning brief by email"
          trailing={
            <Toggle
              on={!!settings?.daily_brief_email_enabled}
              onChange={() => updateSettings.mutate({ daily_brief_email_enabled: !settings?.daily_brief_email_enabled })}
              label="Morning brief by email"
            />
          }
        />
      </ListGroup>

      <AppLockSettings />

      <ListGroup
        title="Privacy"
        footer="Your notes are encrypted at rest. To power search, the daily brief and AI extraction, the app decrypts your notes and shares text with our AI providers (Groq, Cohere) for that processing only. We never sell or share your data."
      >
        <ListRow icon={ShieldCheck} iconColor="var(--sb-text-muted)" soft label="Encrypted at rest" />
      </ListGroup>

      <ListGroup title="Help">
        <ListRow icon={Compass} iconColor="var(--sb-text-muted)" soft label="Take the tour again" chevron onClick={() => startTour()} />
      </ListGroup>

      <ListGroup>
        <ListRow icon={LogOut} iconColor="var(--sb-text-muted)" soft label="Sign out" onClick={() => signOut()} />
      </ListGroup>

      <ListGroup
        footer="Permanently deletes your account and every note and task tied to it. This can’t be undone."
      >
        <ListRow
          icon={Trash2}
          iconColor="var(--sb-danger)"
          soft
          label={deleteAccount.isPending ? 'Deleting…' : 'Delete account'}
          danger
          disabled={deleteAccount.isPending}
          onClick={() => setConfirmingDelete(true)}
        />
      </ListGroup>
      {deleteAccount.isError && <p className="-mt-4 mb-6 px-4 text-sm text-danger">Something went wrong — please try again.</p>}

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete your account?"
          message="This permanently deletes your account and everything in it — every note and task. There's no way to undo this or recover the data afterward."
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
