import { useEffect, useState } from 'react'
import ConfiaLogo from './ConfiaLogo'

// Full-screen startup splash - shown while auth/settings resolve before
// the real app can render (RequireAuth, TermsGate): centered mark, serif
// wordmark, tagline, and a 3-dot loading indicator, on the plain page
// ground of whichever theme is already active - so it reads as the
// installed app's own launch screen, flowing straight into the UI.
const TAGLINE = 'Your notes, your tasks, your day — always at hand.'
const DOT_COUNT = 3
const DOT_INTERVAL_MS = 700

export default function LoadingScreen() {
  const [activeDot, setActiveDot] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setActiveDot((i) => (i + 1) % DOT_COUNT), DOT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  return (
    // h-dvh, not h-screen - see Layout.tsx's comment on the same swap;
    // the absolutely-positioned dots below are pinned relative to this
    // container's height, so a 100vh/real-viewport mismatch on mobile
    // would shift them out of the actually-visible area too.
    <div className="relative flex h-dvh flex-col items-center justify-center bg-bg px-8 text-center">
      <div className="mb-5 text-text">
        <ConfiaLogo size={72} />
      </div>
      <div className="font-display text-[2.25rem] font-semibold tracking-[-0.035em] text-text">MyConfía</div>
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
