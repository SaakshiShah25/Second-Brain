import { ChevronRight } from 'lucide-react'
import { useInitiatives } from '../api/initiatives'
import type { Task } from '../api/types'
import { isoLocal, shortDate, timeLabel } from '../lib/dates'
import { getInitiativeStyle } from '../lib/initiativeStyle'
import { isOverdue } from '../lib/items'
import { taskInitiativeId } from '../lib/taskOptions'
import { inHowLong, remindedOnly, timeToday, type UpNext as Next } from '../lib/timeline'

// The top of Today: how much is on the list, and the one thing to do next - so the page answers "what now?" before it
// shows everything. Tapping it opens that to-do.
export default function UpNext({ count, overdue, next, now, onOpen }: { count: number; overdue: number; next: Next; now: Date; onOpen: (t: Task) => void }) {
  const { data: initiatives = [] } = useInitiatives()
  const { task, label } = next
  const today = isoLocal(now)
  const spaceId = taskInitiativeId(task)
  const space = initiatives.find((i) => i.id === spaceId)
  const style = getInitiativeStyle(space)

  const time = timeToday(task, today)
  const late = isOverdue(task, now)
  // The big figure on the left: its time when it has one today, else the day it belongs to.
  const when =
    label === 'Coming up'
      ? shortDate(task.due_date)
      : time
        ? timeLabel(time)
        : late
          ? 'Overdue'
          : task.due_date === today
            ? 'Today'
            : 'Priority'
  const detail = [
    space?.name ?? 'Others',
    label === 'Up next' && time ? (remindedOnly(task, today) ? `reminder ${inHowLong(time, now)}` : inHowLong(time, now)) : '',
    remindedOnly(task, today) && task.due_date ? `due ${shortDate(task.due_date)}` : '',
    label === 'Coming up' ? timeLabel(task.due_time) : '', // its day is already the big figure on the left
    late && task.due_date !== today ? `was due ${shortDate(task.due_date)}` : '',
  ].filter(Boolean)

  const headline = count === 0 ? 'Nothing left for today' : `${count} ${count === 1 ? 'thing' : 'things'} on your list today`

  return (
    <section aria-label="Summary" className="mb-5 rounded-2xl border border-border bg-bg-card p-2">
      <p className="px-2 pt-1 pb-2.5 text-[1.0625rem] font-semibold tracking-tight">
        {headline}
        {overdue > 0 && <span className="text-danger"> · {overdue} overdue</span>}
      </p>
      <button type="button" onClick={() => onOpen(task)} className="pressable flex w-full items-center gap-3.5 rounded-xl bg-accent-soft px-3 py-3 text-left">
        <span className="w-[5.25rem] flex-shrink-0">
          <span className="block text-[0.6875rem] font-bold uppercase tracking-wide text-accent">{label}</span>
          <span className="mt-0.5 block whitespace-nowrap text-[1.0625rem] font-bold leading-tight tracking-tight">{when}</span>
        </span>
        <span className="min-w-0 flex-1 border-l border-border-strong pl-3.5">
          <span className="line-clamp-2 text-[0.9375rem] font-semibold leading-snug">{task.description}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[0.8125rem] text-text-muted">
            {style && <style.Icon size={13} strokeWidth={2.2} style={{ color: style.color }} className="flex-shrink-0" />}
            <span className="truncate">{detail.join(' · ')}</span>
          </span>
        </span>
        <ChevronRight size={17} strokeWidth={2} className="flex-shrink-0 text-text-faint" />
      </button>
    </section>
  )
}
