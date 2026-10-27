import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { useCreateInitiative, useDeleteInitiative, useInitiatives } from '../api/initiatives'
import { useNotes } from '../api/notes'
import { useUpdateSettings } from '../api/settings'
import type { UsageMode } from '../api/types'
import { SUGGESTED_INITIATIVES, USAGE_MODE_OPTIONS } from '../lib/usageMode'
import Button from './Button'
import Chip, { ChipRow } from './Chip'
import Sheet from './Sheet'

// First-run question: what will this account be used for? Asked once
// (TourGate shows it before the welcome tour while settings.usage_mode is
// null), then editable any time in Settings. Picking a mode also offers a
// matching set of starter categories, so a personal user doesn't start
// with "Clients" and a work user doesn't start with "Family".
export default function UsageModeSheet() {
  const updateSettings = useUpdateSettings()
  const { data: initiatives } = useInitiatives()
  const { data: notes } = useNotes()
  const createInitiative = useCreateInitiative()
  const deleteInitiative = useDeleteInitiative()

  const [mode, setMode] = useState<UsageMode | null>(null)
  // Lower-cased names the user wants to end up with.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const existing = useMemo(() => initiatives ?? [], [initiatives])
  // An existing category that already holds notes can't be dropped here -
  // this screen is for choosing a starting set, not for deleting data.
  const inUse = useMemo(() => {
    const ids = new Set((notes ?? []).map((n) => n.initiative_id).filter(Boolean))
    return new Set(existing.filter((i) => ids.has(i.id)).map((i) => i.name.toLowerCase()))
  }, [notes, existing])

  function chooseMode(m: UsageMode) {
    setMode(m)
    const { names, preselected } = SUGGESTED_INITIATIVES[m]
    // Pre-select the mode's top suggestions plus anything already in use.
    setSelected(new Set([...names.slice(0, preselected).map((n) => n.toLowerCase()), ...inUse]))
  }

  // Suggestions for the chosen mode, then any of the user's own existing
  // categories that aren't in that list.
  const options = useMemo(() => {
    if (!mode) return []
    const names = [...SUGGESTED_INITIATIVES[mode].names]
    for (const i of existing) {
      if (!names.some((n) => n.toLowerCase() === i.name.toLowerCase())) names.push(i.name)
    }
    return names
  }, [mode, existing])

  function toggle(name: string) {
    const key = name.toLowerCase()
    if (inUse.has(key)) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function finish() {
    if (!mode) return
    setSaving(true)
    setError('')
    try {
      const existingByKey = new Map(existing.map((i) => [i.name.toLowerCase(), i]))
      for (const name of options) {
        const key = name.toLowerCase()
        const current = existingByKey.get(key)
        if (selected.has(key) && !current) await createInitiative.mutateAsync({ name })
        if (!selected.has(key) && current && !inUse.has(key)) await deleteInitiative.mutateAsync(current.id)
      }
      // Saved last: this is what closes the sheet (TourGate stops showing
      // it once usage_mode is set), so categories are in place first.
      await updateSettings.mutateAsync({ usage_mode: mode })
    } catch {
      setError("Couldn't save that — please try again.")
      setSaving(false)
    }
  }

  return (
    <Sheet tall>
      <h2 className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.03em]">
        What will you use MyConfía for?
      </h2>
      <p className="mt-1.5 mb-5 text-[0.9375rem] leading-relaxed text-text-muted">
        We’ll tailor shortcuts and features to fit. You can change this any time in Settings.
      </p>

      <div className="flex flex-col gap-2.5">
        {USAGE_MODE_OPTIONS.map(({ value, label, icon: Icon, description }) => {
          const active = mode === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => chooseMode(value)}
              aria-pressed={active}
              className={`pressable flex items-center gap-3.5 rounded-2xl border-2 p-3.5 text-left ${
                active ? 'border-accent bg-accent-soft' : 'border-border bg-bg-card'
              }`}
            >
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                <Icon size={21} strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold">{label}</span>
                <span className="block text-sm text-text-muted">{description}</span>
              </span>
              <span
                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                  active ? 'border-accent bg-accent text-accent-contrast' : 'border-border-strong'
                }`}
              >
                {active && <Check size={14} strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>

      {mode && (
        <div className="mt-6" style={{ animation: 'fade-in 0.2s ease-out' }}>
          <p className="mb-1 text-[0.9375rem] font-semibold">Start with these categories</p>
          <p className="mb-3 text-sm text-text-muted">Notes get sorted into them automatically. Tap to add or remove.</p>
          <ChipRow className="flex-wrap !overflow-visible">
            {options.map((name) => {
              const key = name.toLowerCase()
              const on = selected.has(key)
              return (
                <Chip
                  key={key}
                  active={on}
                  onClick={() => toggle(name)}
                  disabled={inUse.has(key)}
                  title={inUse.has(key) ? 'Already has notes in it' : undefined}
                  className="disabled:opacity-100"
                >
                  {on && <Check size={14} strokeWidth={2.4} />}
                  {name}
                </Chip>
              )
            })}
          </ChipRow>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      <Button variant="primary" size="lg" block className="mt-7" disabled={!mode || saving} onClick={finish}>
        {saving ? 'Setting things up…' : 'Continue'}
      </Button>
    </Sheet>
  )
}
