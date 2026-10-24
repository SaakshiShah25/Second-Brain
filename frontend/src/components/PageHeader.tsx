import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

interface PageHeaderProps {
  title?: ReactNode
  subtitle?: ReactNode
  // Where the back chevron goes - shown only on pushed (non-tab) screens.
  // Standalone PWAs have no browser back button on iOS, so every pushed
  // screen needs its own.
  backTo?: string
  backLabel?: string
  actions?: ReactNode
  // Top-level tabs show the profile button (the way into Settings).
  showProfile?: boolean
}

export function ProfileButton() {
  const { user } = useAuth()
  const initial = (user?.email?.[0] ?? '?').toUpperCase()
  return (
    <Link
      to="/settings"
      aria-label="Settings and profile"
      // Read by Tour.tsx to spotlight this button on its Settings step.
      data-tour-nav="/settings"
      className="pressable flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-bg-elevated text-sm font-semibold text-text-muted ring-1 ring-border"
    >
      {initial}
    </Link>
  )
}

// iOS-style large title header: a compact top row (back chevron / page
// actions / profile) above a big serif title - the pattern Apple Notes,
// Things and Bear all use, so a screen's name is unmissable without a
// desktop-style toolbar.
export default function PageHeader({ title, subtitle, backTo, backLabel = 'Back', actions, showProfile = false }: PageHeaderProps) {
  const navigate = useNavigate()
  const hasTopRow = backTo || actions || showProfile
  return (
    <header className="mb-4">
      {hasTopRow && (
        <div className="flex h-11 items-center gap-2">
          {backTo && (
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(backTo))}
              className="pressable -ml-2 flex h-11 items-center gap-0.5 pr-2 text-[0.9375rem] font-medium text-link"
            >
              <ChevronLeft size={24} strokeWidth={2} />
              {backLabel}
            </button>
          )}
          <span className="flex-1" />
          {actions}
          {showProfile && <ProfileButton />}
        </div>
      )}
      {title && (
        <h1 className="font-display text-[2rem] leading-[1.15] font-semibold tracking-[-0.03em] text-text">{title}</h1>
      )}
      {subtitle && <p className="mt-1 text-[0.9375rem] text-text-muted">{subtitle}</p>}
    </header>
  )
}
