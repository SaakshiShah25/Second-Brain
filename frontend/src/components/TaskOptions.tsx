import { useState } from 'react'
import { BellOff, Flag } from 'lucide-react'
import type { Task } from '../api/types'
import { shortDate } from '../lib/dates'
import { PRIORITIES, priorityOf, reminderChoices, type Priority } from '../lib/taskOptions'
import Button from './Button'
import Sheet from './Sheet'
import { Input } from './fields'

// The flag on a task: faint when normal, red when high, green when low. Tap it for the three colours.
export function PriorityFlag({ priority, onPick }: { priority: Priority; onPick: (p: Priority) => void }) {
  const [open, setOpen] = useState(false)
  const current = PRIORITIES.find((p) => p.value === priority)!
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Priority: ${current.label}. Change`}
        aria-expanded={open}
        className="pressable -m-1 flex h-9 w-9 items-center justify-center rounded-full"
      >
        <Flag
          size={18}
          strokeWidth={2}
          style={priority === 'normal' ? { color: 'var(--sb-text-faint)' } : { color: current.color, fill: current.color }}
        />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} />
          <span
            role="menu"
            className="absolute top-full right-0 z-30 mt-1 flex gap-1.5 rounded-full border border-border bg-bg-card p-1.5 shadow-card"
            style={{ animation: 'fade-in 0.15s ease-out' }}
          >
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                role="menuitem"
                aria-label={`${p.label} priority`}
                title={p.label}
                onClick={() => {
                  setOpen(false)
                  onPick(p.value)
                }}
                className="pressable flex h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: priority === p.value ? `${p.color}26` : undefined }}
              >
                <span className="h-5 w-5 rounded-full" style={{ backgroundColor: p.color, outline: priority === p.value ? `2px solid ${p.color}` : undefined, outlineOffset: 2 }} />
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  )
}

// "Remind me" for one task: quick choices counted from its due date, or any date. The push arrives at 9 AM that day.
export function ReminderSheet({ task, onPick, onClose }: { task: Task; onPick: (date: string | null) => void; onClose: () => void }) {
  const choices = reminderChoices(task.due_date)
  const [custom, setCustom] = useState('')
  const today = new Date().toLocaleDateString('en-CA')
  return (
    <Sheet onClose={onClose}>
      <h3 className="text-lg font-semibold tracking-tight">Remind me</h3>
      <p className="mb-4 mt-0.5 line-clamp-2 text-[0.9375rem] text-text-muted">{task.description}</p>
      {task.remind_on && (
        <p className="mb-3 rounded-xl bg-bg-elevated px-3.5 py-2.5 text-[0.9375rem]">
          Reminder set for <span className="font-semibold">{shortDate(task.remind_on)}</span>, 9 AM
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => {
              onPick(c.date)
              onClose()
            }}
            className="pressable flex h-10 flex-col items-start justify-center rounded-2xl border border-border-strong bg-bg-card px-3.5 text-left leading-tight"
          >
            <span className="text-[0.875rem] font-medium">{c.label}</span>
            <span className="text-[0.75rem] text-text-muted">{shortDate(c.date)}</span>
          </button>
        ))}
        {choices.length === 0 && <p className="text-[0.875rem] text-text-muted">The usual choices have already passed - pick a date below.</p>}
      </div>
      <div className="mt-4 flex gap-2">
        <Input type="date" min={today} value={custom} onChange={(e) => setCustom(e.target.value)} className="flex-1" />
        <Button
          variant="primary"
          disabled={!custom}
          onClick={() => {
            onPick(custom)
            onClose()
          }}
        >
          Set
        </Button>
      </div>
      <p className="mt-2 text-[0.8125rem] text-text-faint">You'll get a notification at 9 AM that day, if reminders are on in Settings.</p>
      {task.remind_on && (
        <Button
          variant="ghost"
          block
          className="mt-3"
          onClick={() => {
            onPick(null)
            onClose()
          }}
        >
          <BellOff size={16} strokeWidth={2} /> Remove reminder
        </Button>
      )}
    </Sheet>
  )
}

export { priorityOf }
