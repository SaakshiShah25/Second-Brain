import { useState } from 'react'
import { Cake, CalendarDays, Heart, Plus, Trash2 } from 'lucide-react'
import { useUpdatePerson } from '../api/people'
import type { ImportantDate, Person } from '../api/types'
import {
  MONTHS,
  daysInMonth,
  daysUntil,
  describeWhen,
  formatMonthDay,
  sameDate,
  turningAge,
} from '../lib/importantDates'
import Button from './Button'
import { Input } from './fields'

const selectClass =
  'rounded-lg border border-border-strong bg-bg-card px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

const PRESETS = ['Birthday', 'Anniversary']
const OTHER = '__other__'

function iconFor(label: string) {
  const l = label.toLowerCase()
  if (l === 'birthday') return Cake
  if (l.includes('anniversary')) return Heart
  return CalendarDays
}

// Birthdays and anniversaries live here, on the profile, instead of as
// ordinary dated notes that scroll away into the timeline - they come
// round every year, so what matters is "when is the next one", which the
// list shows. Notes that mention one ("her birthday is March 14") add it
// here automatically; this is also where to add or correct one by hand.
export default function ImportantDates({ person }: { person: Person }) {
  const update = useUpdatePerson(person.id)
  const dates = person.important_dates ?? []

  const [preset, setPreset] = useState(PRESETS[0])
  const [customLabel, setCustomLabel] = useState('')
  const [month, setMonth] = useState(1)
  const [day, setDay] = useState(1)
  const [year, setYear] = useState('')

  const label = preset === OTHER ? customLabel.trim() : preset

  function save(next: ImportantDate[]) {
    update.mutate({ important_dates: next })
  }

  function handleAdd() {
    if (!label) return
    const parsedYear = Number(year)
    const entry: ImportantDate = {
      label,
      month,
      day: Math.min(day, daysInMonth(month)),
      year: year && parsedYear >= 1900 && parsedYear <= 2100 ? parsedYear : null,
    }
    if (dates.some((d) => sameDate(d, entry))) return
    save([...dates, entry])
    setCustomLabel('')
    setYear('')
  }

  const sorted = dates
    .map((entry, index) => ({ entry, index, until: daysUntil(entry.month, entry.day) }))
    .sort((a, b) => a.until - b.until)

  return (
    <div className="mt-2">
      <p className="mb-1 text-xs font-medium text-text-muted">Important dates</p>
      {sorted.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1">
          {sorted.map(({ entry, index, until }) => {
            const Icon = iconFor(entry.label)
            const turning = turningAge(entry)
            return (
              <li key={`${entry.label}-${entry.month}-${entry.day}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon size={14} strokeWidth={1.6} className="flex-shrink-0 text-accent" />
                  <span className="min-w-0 text-text">
                    {entry.label} · {formatMonthDay(entry.month, entry.day)}
                    {turning ? ` · turns ${turning}` : ''}
                  </span>
                  <span className={`flex-shrink-0 text-xs ${until <= 7 ? 'font-medium text-accent' : 'text-text-faint'}`}>
                    {describeWhen(until)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => save(dates.filter((_, i) => i !== index))}
                  disabled={update.isPending}
                  className="flex-shrink-0 text-text-faint hover:text-danger"
                  title="Remove this date"
                  aria-label={`Remove ${entry.label}`}
                >
                  <Trash2 size={13} strokeWidth={1.6} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="important-date-label"
          aria-label="Occasion"
          className={selectClass}
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
        >
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </select>
        {preset === OTHER && (
          <Input
            id="important-date-custom"
            aria-label="Occasion name"
            placeholder="e.g. Work anniversary"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            className="w-44 text-sm"
          />
        )}
        <select
          id="important-date-month"
          aria-label="Month"
          className={selectClass}
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select
          id="important-date-day"
          aria-label="Day"
          className={selectClass}
          value={Math.min(day, daysInMonth(month))}
          onChange={(e) => setDay(Number(e.target.value))}
        >
          {Array.from({ length: daysInMonth(month) }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <Input
          id="important-date-year"
          aria-label="Year (optional)"
          placeholder="Year (optional)"
          inputMode="numeric"
          maxLength={4}
          value={year}
          onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
          className="w-32 text-sm"
        />
        <Button type="button" onClick={handleAdd} disabled={update.isPending || !label} title="Add date">
          <Plus size={14} strokeWidth={1.6} />
        </Button>
      </div>
      {update.isError && (
        <p className="mt-1 text-xs text-danger">Couldn't save that date. Please try again in a moment.</p>
      )}
    </div>
  )
}
