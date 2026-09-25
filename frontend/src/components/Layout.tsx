import { Link, NavLink, Outlet } from 'react-router-dom'
import { LogOut, MessageSquare, NotebookText, Settings, Sunrise, Users, type LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import ConfiaLogo from './ConfiaLogo'

const navItems: { to: string; label: string; icon: LucideIcon; end: boolean }[] = [
  { to: '/', label: 'Chat', icon: MessageSquare, end: true },
  { to: '/notes', label: 'Notes', icon: NotebookText, end: false },
  { to: '/digest', label: 'Today', icon: Sunrise, end: false },
  { to: '/people', label: 'People', icon: Users, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
]

export default function Layout() {
  const { user, signOut } = useAuth()

  return (
    // h-dvh, not h-screen (100vh) - 100vh is calculated against the
    // LARGEST possible viewport (browser chrome collapsed), so on a
    // phone with its address bar showing, the real visible area is
    // shorter than the app's whole layout thinks it is. That single
    // mismatch is what caused several different-looking mobile bugs at
    // once: content pinned near the bottom (e.g. Settings' Delete
    // account button) reading as "no space below it", and scrollable
    // pages (People, Notes) appearing to stop short of their real end -
    // both because the fixed bottom nav's actual on-screen position
    // didn't line up with where this container's math placed it. dvh
    // (dynamic viewport height) tracks the real, currently-visible area
    // instead, including as the browser's chrome shows/hides.
    <div className="flex h-dvh bg-bg text-text">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-56 md:flex-shrink-0 md:flex-col md:border-r md:border-border md:bg-bg-elevated md:p-4">
        {/* Clicking the wordmark goes home (Chat), same as clicking a
            logo does in most apps - this is a logged-in productivity
            tool, not a marketing site, so "home" is the right landing
            spot rather than a separate splash/landing page. */}
        <Link to="/" className="mb-6 flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-bg-hover">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-text">
            <ConfiaLogo size={18} />
          </span>
          <span className="text-base font-semibold tracking-[-0.02em]">Confía</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              // Read directly by Tour.tsx to spotlight this exact icon
              // while it's describing this section - see its own comment
              // for why the tour finds elements this way instead of
              // Layout reporting anything back up.
              data-tour-nav={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm tracking-[-0.006em] transition-colors ${
                  isActive
                    ? 'bg-accent-soft font-semibold text-accent'
                    : 'font-medium text-text-muted hover:bg-bg-hover hover:text-text'
                }`
              }
            >
              <item.icon size={18} strokeWidth={1.6} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        {user && (
          <div className="mt-4 border-t border-border pt-3 px-2">
            <p className="mb-2 truncate text-xs text-text-faint">{user.email}</p>
            <button
              type="button"
              onClick={() => signOut()}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <LogOut size={18} strokeWidth={1.6} />
              Sign out
            </button>
          </div>
        )}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {/* flex + h-full so a page like ChatPage that itself uses
              "h-full flex-col" (to pin its input bar to the bottom)
              actually has a real height to fill, instead of collapsing
              to its own content's height and leaving dead space below
              a short empty state - overflow-y-auto stays on <main>
              above, so pages with content taller than the viewport
              still scroll normally. */}
          <div className="mx-auto flex h-full max-w-3xl flex-col p-4 md:p-8">
            <Outlet />
            {/* Clearance for the fixed mobile nav below - deliberately a
                real flex sibling to <Outlet/> HERE (inside the h-full
                flex column), not padding-bottom on <main>, and not a
                sibling of this wrapper div either - both of those were
                tried and confirmed empirically NOT to work: this
                wrapper's own h-full box doesn't grow for overflowing
                content on a long page (Settings/People/Notes), so
                anything placed outside/after the wrapper itself still
                gets positioned against the wrapper's fixed box, not
                where the real content actually ends - meaning the true
                tail of the page (e.g. Settings' Delete account button)
                stayed hidden under the nav with no way to scroll further
                and reveal it. A flex sibling INSIDE this same column
                participates in the actual overflow instead, landing
                right after the real content wherever it ends - verified
                this produces real, reachable clearance above the nav. */}
            <div className="h-16 flex-shrink-0 md:hidden" />
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-bg-elevated md:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-tour-nav={item.to}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
                  isActive ? 'text-accent' : 'text-text-muted'
                }`
              }
            >
              <item.icon size={20} strokeWidth={1.6} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
