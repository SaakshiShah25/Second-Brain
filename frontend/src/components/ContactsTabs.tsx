import { NavLink } from 'react-router-dom'
import { usePeople } from '../api/people'
import { keepInTouchStatus } from '../lib/keepInTouch'

// "All | Keep in touch" switcher shared by both Contacts screens, so Keep in
// touch lives under Contacts instead of taking a sixth slot in the bottom bar.
// The Keep in touch tab shows how many catch-ups are due or overdue.
export default function ContactsTabs() {
  const { data: people } = usePeople()
  const due = (people ?? []).filter((p) => (keepInTouchStatus(p)?.daysOverdue ?? -1) >= 0).length

  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
      isActive ? 'bg-accent text-accent-contrast' : 'text-text-muted hover:text-text'
    }`

  return (
    <div className="mb-4 inline-flex gap-1 rounded-lg bg-bg-elevated p-1 text-sm">
      <NavLink to="/people" end className={tab}>
        All
      </NavLink>
      <NavLink to="/people/keep-in-touch" className={tab}>
        Keep in touch
        {due > 0 && (
          <span className="rounded-full bg-danger px-1.5 text-[11px] font-semibold leading-4 text-white">{due}</span>
        )}
      </NavLink>
    </div>
  )
}
