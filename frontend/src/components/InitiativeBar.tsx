import { useEffect, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useInitiatives } from '../api/initiatives'
import { getInitiativeStyle } from '../lib/initiativeStyle'
import { useInitiativeFilter } from '../lib/initiativeFilter'
import Chip, { ChipRow } from './Chip'
import InitiativesManager from './InitiativesManager'
import Sheet from './Sheet'

// The one initiative picker, at the top of both Today and Notes. The
// selection is shared (lib/initiativeFilter), so switching tabs keeps the
// focus. `counts` (keyed by initiative id, -1 for Others) adds a small
// number to each chip - e.g. open tasks on Today; chips with no count
// still show, so an initiative never disappears just because it's quiet.
export default function InitiativeBar({ counts, className = '' }: { counts?: Map<number, number>; className?: string }) {
  const { data: initiatives } = useInitiatives()
  const [filter, setFilter] = useInitiativeFilter()
  const [managing, setManaging] = useState(false)

  // A deleted initiative can't stay selected.
  useEffect(() => {
    if (typeof filter === 'number' && filter > 0 && initiatives && !initiatives.some((i) => i.id === filter)) setFilter(null)
  }, [initiatives, filter, setFilter])

  const count = (key: number) => {
    const n = counts?.get(key)
    return n ? <span className="text-[0.75rem] opacity-75">{n}</span> : null
  }

  return (
    <>
      <ChipRow className={className}>
        <Chip active={filter === null} onClick={() => setFilter(null)}>
          All
        </Chip>
        {initiatives?.map((i) => {
          const style = getInitiativeStyle(i)
          return (
            <Chip key={i.id} active={filter === i.id} color={style?.color} onClick={() => setFilter(i.id)}>
              {style && <style.Icon size={14} strokeWidth={2} />}
              {i.name}
              {count(i.id)}
            </Chip>
          )
        })}
        <Chip active={filter === -1} onClick={() => setFilter(-1)}>
          Others
          {count(-1)}
        </Chip>
        <Chip onClick={() => setManaging(true)} aria-label="Manage initiatives" className="!min-w-0 !px-3">
          <SlidersHorizontal size={15} strokeWidth={2} />
        </Chip>
      </ChipRow>

      {managing && (
        <Sheet onClose={() => setManaging(false)} title="Initiatives" tall>
          <InitiativesManager />
        </Sheet>
      )}
    </>
  )
}
