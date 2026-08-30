import { useEffect, useState } from 'react'
import ConfiaLogo from './ConfiaLogo'

// Full-screen startup splash - shown while auth/settings resolve before
// the real app can render (RequireAuth, TermsGate). Matches the brand's
// splash mockup: centered mark, wordmark, one-line tagline, and a simple
// 3-dot loading indicator - themed via the same CSS variables/data-theme
// attribute as the rest of the app (see .confia-splash-bg/.confia-splash-glow
// in styles/index.css), so it shows the light or dusk treatment
// depending on whichever theme is already active, not a hardcoded one.
const TAGLINE = 'Your ideas, your people, every conversation — always at hand.'
const DOT_COUNT = 3
const DOT_INTERVAL_MS = 700

export default function LoadingScreen() {
  const [activeDot, setActiveDot] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setActiveDot((i) => (i + 1) % DOT_COUNT), DOT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="confia-splash-bg relative flex h-screen flex-col items-center justify-center px-8 text-center">
      <div className="confia-splash-glow mb-6 text-text">
        <ConfiaLogo size={88} />
      </div>
      <div className="text-[34px] font-semibold tracking-[-0.02em] text-text">Confía</div>
      <p className="mt-2.5 max-w-xs text-[15px] leading-[1.5] tracking-[-0.006em] text-text-muted">{TAGLINE}</p>

      <div className="absolute bottom-16 flex items-center gap-1.5">
        {Array.from({ length: DOT_COUNT }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === activeDot ? 'w-5 rounded bg-accent' : 'w-1.5 bg-border-strong'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
