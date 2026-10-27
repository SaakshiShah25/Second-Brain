import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { FolderOpen, Home, NotebookText, Sun, Users, type LucideIcon } from 'lucide-react'
import Toaster from './Toast'
import GoogleReturnHandler from './google/GoogleReturnHandler'

// Each tab has its own hue (index.css --sb-fun-*), shown when it's the
// active tab - full class strings so Tailwind can see them.
const tabs: { to: string; label: string; icon: LucideIcon; end: boolean; pill: string; text: string }[] = [
  { to: '/', label: 'Home', icon: Home, end: true, pill: 'bg-fun-orange/15 text-fun-orange', text: 'text-fun-orange' },
  { to: '/digest', label: 'Today', icon: Sun, end: false, pill: 'bg-fun-sun/15 text-fun-sun', text: 'text-fun-sun' },
  { to: '/notes', label: 'Notes', icon: NotebookText, end: false, pill: 'bg-fun-sky/15 text-fun-sky', text: 'text-fun-sky' },
  { to: '/documents', label: 'Docs', icon: FolderOpen, end: false, pill: 'bg-fun-teal/15 text-fun-teal', text: 'text-fun-teal' },
  { to: '/people', label: 'People', icon: Users, end: false, pill: 'bg-fun-pink/15 text-fun-pink', text: 'text-fun-pink' },
]

// Screens pushed on top of a tab (a person's profile, Settings) hide the
// tab bar, like a native navigation stack - they have their own back
// button instead (PageHeader's backTo).
const TABLESS = [/^\/people\/[^/]+$/, /^\/settings$/]

// While the on-screen keyboard is up, the tab bar would ride on top of
// it and eat a chunk of the little space left - native apps hide it, so
// this does too, keyed off any text field being focused.
function useKeyboardOpen() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.tagName === 'TEXTAREA' ||
        (el.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'file', 'button', 'submit'].includes((el as HTMLInputElement).type)) ||
        el.isContentEditable)
    let pointerDown = false
    let closeAfterPointer = false
    let timer: number | undefined
    const closeIfNoFieldFocused = () => {
      if (!isField(document.activeElement)) setOpen(false)
    }
    const onIn = (e: FocusEvent) => {
      if (isField(e.target)) {
        window.clearTimeout(timer)
        closeAfterPointer = false
        setOpen(true)
      }
    }
    // Tapping Send blurs the text box a moment BEFORE the tap completes. If the
    // tab bar came back right then, the composer would jump up by the bar's
    // height and the tap would land on empty space - the first press on
    // Send did nothing. So while a finger/mouse is still down, the bar stays
    // hidden; it returns once the press has finished (and its click has fired).
    const onOut = () => {
      if (pointerDown) {
        closeAfterPointer = true
        return
      }
      closeIfNoFieldFocused()
    }
    const onDown = () => {
      pointerDown = true
    }
    const onUp = () => {
      pointerDown = false
      if (closeAfterPointer) {
        closeAfterPointer = false
        timer = window.setTimeout(closeIfNoFieldFocused, 120)
      }
    }
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('pointerup', onUp, true)
    document.addEventListener('pointercancel', onUp, true)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('pointerup', onUp, true)
      document.removeEventListener('pointercancel', onUp, true)
    }
  }, [])
  return open
}

export default function Layout() {
  const { pathname } = useLocation()
  const keyboardOpen = useKeyboardOpen()
  const showTabs = !TABLESS.some((re) => re.test(pathname)) && !keyboardOpen

  return (
    // The whole app is one phone-width column - this is a mobile PWA,
    // not a responsive website. On a wider screen (a desktop browser,
    // a tablet) it simply stays a centered phone column rather than
    // stretching into a desktop layout.
    //
    // h-dvh (dynamic viewport height), not 100vh, so the column tracks
    // the real visible area as mobile browser chrome shows/hides. The tab
    // bar is an in-flow flex child below the scroll area, not
    // position:fixed, so content can never end up hidden underneath it.
    <div className="bg-bg text-text">
      <div className="pt-safe relative mx-auto flex h-dvh max-w-[480px] flex-col bg-bg min-[481px]:border-x min-[481px]:border-border">
        <main id="app-scroll" className="flex-1 overflow-y-auto overscroll-contain">
          <div className="flex min-h-full flex-col px-4 pt-2 pb-6">
            <Outlet />
          </div>
        </main>

        <Toaster />
        <GoogleReturnHandler />

        {showTabs && (
          <nav className="pb-safe flex-shrink-0 border-t border-border bg-bg/90 backdrop-blur-xl">
            <div className="flex h-16 items-stretch px-2">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  // Read by Tour.tsx to spotlight this exact tab while it's
                  // describing this section.
                  data-tour-nav={tab.to}
                  className="pressable flex flex-1 flex-col items-center justify-center gap-1"
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`flex h-8 w-12 items-center justify-center rounded-full transition-colors ${
                          isActive ? tab.pill : 'text-text-muted'
                        }`}
                      >
                        <tab.icon size={21} strokeWidth={isActive ? 2.2 : 1.8} />
                      </span>
                      <span className={`text-[0.6875rem] font-medium ${isActive ? `font-semibold ${tab.text}` : 'text-text-muted'}`}>
                        {tab.label}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </div>
    </div>
  )
}
