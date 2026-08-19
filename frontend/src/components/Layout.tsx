import { NavLink, Outlet } from 'react-router-dom'
import { Brain, Briefcase, MessageSquare, Sunrise, Users, type LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

const navItems: { to: string; label: string; icon: LucideIcon; end: boolean }[] = [
  { to: '/', label: 'Chat', icon: MessageSquare, end: true },
  { to: '/digest', label: 'Digest', icon: Sunrise, end: false },
  { to: '/people', label: 'People', icon: Users, end: false },
  { to: '/clients', label: 'Clients', icon: Briefcase, end: false },
]

export default function Layout() {
  const { user, signOut } = useAuth()

  return (
    <div className="flex h-screen bg-bg text-text">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-56 md:flex-shrink-0 md:flex-col md:border-r md:border-border md:bg-bg-elevated md:p-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Brain size={18} strokeWidth={2} />
          </span>
          <span className="text-base font-semibold tracking-tight">Second Brain</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-accent-soft text-accent' : 'text-text-muted hover:bg-bg-hover hover:text-text'
                }`
              }
            >
              <item.icon size={18} strokeWidth={2} />
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
              className="text-xs font-medium text-text-muted transition-colors hover:text-danger"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <div className="mx-auto max-w-3xl p-4 md:p-8">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-bg-elevated md:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
                  isActive ? 'text-accent' : 'text-text-muted'
                }`
              }
            >
              <item.icon size={20} strokeWidth={2} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
