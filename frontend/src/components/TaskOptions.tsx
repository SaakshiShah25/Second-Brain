import { useState } from 'react'
import { createPortal } from 'react-dom'
import { BellOff } from 'lucide-react'
import type { Task } from '../api/types'
import { isoLocal, shortDate } from '../lib/dates'
import { PRIORITIES, earliestReminderDate, priorityOf, reminderChoices, type Priority } from '../lib/taskOptions'
import Button from './Button'
import Sheet from './Sheet'
import { Input } from './fields'

// The priority icon: an up arrow beside four lines that get shorter - "sort by importance". Its colour is the level
// (red high, amber normal, green low).
export function PriorityBars({ priority, size = 22, inverted = false }: { priority: Priority; size?: number; inverted?: boolean }) {
  const color = inverted ? '#fff' : PRIORITIES.find((p) => p.value === priority)!.color
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 20V5" />
      <path d="M1.8 8.4 5 5l3.2 3.4" />
      <path d="M12 5.5h10.5" />
      <path d="M12 10h8.5" />
      <path d="M12 14.5h6.5" />
      <path d="M12 19h3.5" />
    </svg>
  )
}

// The priority of a task. Tap it to choose: three labelled options in a small panel that floats above everything
// (it is drawn outside the task card, so the card can't clip it).
export function PriorityFlag({ priority, onPick }: { priority: Priority; onPick: (p: Priority) => void }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const current = PRIORITIES.find((p) => p.value === priority)!
  const PANEL_HEIGHT = 56
  const below = anchor ? anchor.bottom + 8 + PANEL_HEIGHT < window.innerHeight : true
  return (
    <>
      <button
        type="button"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())}
        aria-label={`Priority: ${current.label}. Change`}
        aria-expanded={!!anchor}
        title={`Priority: ${current.label}`}
        className="pressable -m-1 flex h-9 w-9 items-center justify-center rounded-full"
        style={{ color: current.color }}
      >
        <PriorityBars priority={priority} />
      </button>
      {anchor &&
        createPortal(
          <>
            <button type="button" aria-label="Close" className="fixed inset-0 z-[60] cursor-default" onClick={() => setAnchor(null)} />
            <div
              role="menu"
              className="fixed z-[61] flex gap-1.5 rounded-2xl border border-border-strong bg-bg-card p-1.5 shadow-card"
              style={{
                right: Math.max(8, window.innerWidth - anchor.right - 8),
                ...(below ? { top: anchor.bottom + 8 } : { bottom: window.innerHeight - anchor.top + 8 }),
                animation: 'fade-in 0.15s ease-out',
              }}
            >
              {PRIORITIES.map((p) => {
                const active = priority === p.value
                return (
                  <button
                    key={p.value}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAnchor(null)
                      onPick(p.value)
                    }}
                    className="pressable flex h-11 items-center gap-1.5 rounded-xl border px-3 text-[0.875rem] font-semibold"
                    style={
                      active
                        ? { backgroundColor: p.color, borderColor: p.color, color: '#fff' }
                        : { borderColor: `${p.color}66`, color: p.color }
                    }
                  >
                    <PriorityBars priority={p.value} size={20} inverted={active} />
                    {p.label}
                  </button>
                )
              })}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}

// "Remind me" for one task: quick choices counted from its due date, or any date. The push arrives at 9 AM that day.
export function ReminderSheet({ task, onPick, onClose }: { task: Task; onPick: (date: string | null) => void; onClose: () => void }) {
  const choices = reminderChoices(task.due_date)
  const [custom, setCustom] = useState('')
  const earliest = earliestReminderDate()
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
        <Input type="date" min={earliest} value={custom} onChange={(e) => setCustom(e.target.value)} className="flex-1" />
        <Button
          variant="primary"
          disabled={!custom || custom < earliest}
          onClick={() => {
            onPick(custom)
            onClose()
          }}
        >
          Set
        </Button>
      </div>
      <p className="mt-2 text-[0.8125rem] text-text-faint">
        You'll get a notification at 9 AM that day, if reminders are on in Settings.
        {earliest > isoLocal(new Date()) && " Today's 9 AM has already passed, so the earliest is tomorrow."}
      </p>
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
