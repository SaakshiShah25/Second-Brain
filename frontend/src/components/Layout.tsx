import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { CalendarCheck, Home, LayoutGrid, Settings as SettingsIcon, type LucideIcon } from 'lucide-react'
import ConfiaLogo from './ConfiaLogo'
import Toaster from './Toast'
import ConnectionBanner from './ConnectionBanner'
import { syncReminders } from '../lib/push'
import NotificationPrompt from './NotificationPrompt'

// Each tab has its own hue (index.css --sb-fun-*), shown when it's the
// active tab - full class strings so Tailwind can see them.
const tabs: { to: string; label: string; icon: LucideIcon; end: boolean; pill: string; text: string }[] = [
  { to: '/today', label: 'Today', icon: CalendarCheck, end: false, pill: 'bg-fun-pink/15 text-fun-pink', text: 'text-fun-pink' },
  { to: '/', label: 'Home', icon: Home, end: true, pill: 'bg-fun-orange/15 text-fun-orange', text: 'text-fun-orange' },
  { to: '/notes', label: 'Spaces', icon: LayoutGrid, end: false, pill: 'bg-fun-sky/15 text-fun-sky', text: 'text-fun-sky' },
]

// Screens pushed on top of a tab (Settings) hide the tab bar, like a
// native navigation stack - they have their own back button instead
// (PageHeader's backTo).
const TABLESS = [/^\/settings$/, /^\/admin$/]

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

// Hover labels for icon-only buttons: when a mouse moves over a button that has an aria-label but no title, the label
// becomes its tooltip. (A phone has no hover, so there the icons themselves have to be clear.)
function useHoverLabels() {
  useEffect(() => {
    function onOver(e: PointerEvent) {
      if (e.pointerType !== 'mouse') return
      const el = (e.target as Element | null)?.closest?.('button[aria-label], a[aria-label]')
      if (el && !el.hasAttribute('title')) el.setAttribute('title', el.getAttribute('aria-label') ?? '')
    }
    document.addEventListener('pointerover', onOver)
    return () => document.removeEventListener('pointerover', onOver)
  }, [])
}

export default function Layout() {
  useHoverLabels()
  const { pathname } = useLocation()
  // If task reminders are on, tell the server this device's current time zone each time the app opens.
  useEffect(() => {
    syncReminders()
  }, [])
  const keyboardOpen = useKeyboardOpen()
  const showTabs = !TABLESS.some((re) => re.test(pathname)) && !keyboardOpen

  return (
    // Two layouts from one codebase. Below 1024px (phones, and a phone-sized browser window) the app is one
    // phone-width column with a tab bar along the bottom - exactly the installed-app experience. From 1024px up
    // (a laptop or desktop browser) it is a simple web app: a navigation sidebar on the left and a wider, centred
    // content column.
    //
    // h-dvh (dynamic viewport height), not 100vh, so the column tracks
    // the real visible area as mobile browser chrome shows/hides. The tab
    // bar is an in-flow flex child below the scroll area, not
    // position:fixed, so content can never end up hidden underneath it.
    <div className="bg-bg text-text lg:flex lg:h-dvh">
      {/* Sidebar: web only. */}
      <aside className="hidden w-60 flex-shrink-0 flex-col border-r border-border px-3 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-3">
          <ConfiaLogo size={30} className="text-accent" />
          <span className="font-display text-xl font-semibold tracking-tight">MyConfía</span>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              data-tour-nav={tab.to}
              className={({ isActive }) =>
                `pressable flex h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] ${isActive ? `${tab.pill} font-semibold` : 'text-text-muted hover:bg-bg-hover'}`
              }
            >
              <tab.icon size={20} strokeWidth={1.9} />
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <span className="flex-1" />
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `pressable flex h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] ${isActive ? 'bg-bg-hover font-semibold' : 'text-text-muted hover:bg-bg-hover'}`
          }
        >
          <SettingsIcon size={20} strokeWidth={1.9} />
          Settings
        </NavLink>
      </aside>
      <div className="pt-safe relative mx-auto flex h-dvh max-w-[480px] flex-col bg-bg min-[481px]:border-x min-[481px]:border-border lg:max-w-none lg:min-w-0 lg:flex-1 lg:border-x-0">
        <ConnectionBanner />
        <main id="app-scroll" className="flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex min-h-full w-full flex-col px-4 pt-2 pb-6 lg:max-w-3xl lg:pt-6">
            <Outlet />
          </div>
        </main>

        <Toaster />
      <NotificationPrompt />

        {showTabs && (
          <nav className="pb-safe flex-shrink-0 border-t border-border bg-bg/90 backdrop-blur-xl lg:hidden">
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
