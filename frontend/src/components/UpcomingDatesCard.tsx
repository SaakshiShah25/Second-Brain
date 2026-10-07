import { Link } from 'react-router-dom'
import { Cake, CalendarDays, Heart } from 'lucide-react'
import { useUpcomingDates } from '../api/people'
import { describeWhen, formatMonthDay } from '../lib/importantDates'
import Card from './Card'

function iconFor(label: string) {
  const l = label.toLowerCase()
  if (l === 'birthday') return Cake
  if (l.includes('anniversary')) return Heart
  return CalendarDays
}

// The next 30 days of birthdays/anniversaries across everyone saved. Shows
// nothing at all when there are none, so it never takes up space on a
// quiet month - and these dates also feed the morning brief, so the same
// information arrives without opening the app.
export default function UpcomingDatesCard() {
  const { data } = useUpcomingDates(30)
  if (!data || data.length === 0) return null

  return (
    <Card className="mb-4">
      <h2 className="mb-2 text-sm font-semibold tracking-tight text-text-muted">Coming up</h2>
      <ul className="flex flex-col gap-1.5">
        {data.map((d) => {
          const Icon = iconFor(d.label)
          return (
            <li key={`${d.person_id}-${d.label}-${d.date}`}>
              <Link
                to={`/people/${d.person_id}`}
                className="flex items-center justify-between gap-3 rounded-lg px-1 py-1 text-sm hover:bg-bg-hover"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon size={15} strokeWidth={1.6} className="flex-shrink-0 text-accent" />
                  <span className="min-w-0 truncate text-text">
                    <span className="font-medium">{d.person_name}</span> · {d.label.toLowerCase()}
                    {d.turning ? ` (turns ${d.turning})` : ''}
                  </span>
                </span>
                <span className={`flex-shrink-0 text-xs ${d.days_until <= 1 ? 'font-medium text-accent' : 'text-text-faint'}`}>
                  {formatMonthDay(d.month, d.day)} · {describeWhen(d.days_until)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
