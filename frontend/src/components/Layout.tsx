import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CalendarCheck, Home, Keyboard, LayoutGrid, Settings as SettingsIcon, type LucideIcon } from 'lucide-react'
import ConfiaLogo from './ConfiaLogo'
import Toaster from './Toast'
import ConnectionBanner from './ConnectionBanner'
import { syncReminders } from '../lib/push'
import NotificationPrompt from './NotificationPrompt'
import AlarmOverlay from './AlarmOverlay'
import Sheet from './Sheet'
import { useInitiatives } from '../api/initiatives'
import { getInitiativeStyle } from '../lib/initiativeStyle'
import { useInitiativeFilter } from '../lib/initiativeFilter'
import { useOpenSpace } from '../lib/useOpenSpace'

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

// Keyboard shortcuts for a laptop (ignored while typing in a field, and on a phone-sized window):
//   g then t / h / s   go to Today / Home / Spaces      / or n   jump to the add / search box      ?   this list
const SHORTCUTS: { keys: string; does: string }[] = [
  { keys: 'g  then  t', does: 'Go to Today' },
  { keys: 'g  then  h', does: 'Go to Home' },
  { keys: 'g  then  s', does: 'Go to Spaces' },
  { keys: '/   or   n', does: 'Jump to the add / search box' },
  { keys: 'Esc', does: 'Close a pop-up' },
  { keys: '?', does: 'Show this list' },
]

function useShortcuts(onHelp: () => void) {
  const navigate = useNavigate()
  useEffect(() => {
    let waitingForSecondKey = false
    let timer = 0
    const isTyping = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      if (!window.matchMedia('(min-width: 1024px)').matches) return
      if (document.querySelector('[role="dialog"]')) return // a pop-up is open
      if (waitingForSecondKey) {
        waitingForSecondKey = false
        window.clearTimeout(timer)
        const to = { t: '/today', h: '/', s: '/notes' }[e.key.toLowerCase()]
        if (to) {
          e.preventDefault()
          navigate(to)
        }
        return
      }
      if (e.key === 'g') {
        waitingForSecondKey = true
        timer = window.setTimeout(() => (waitingForSecondKey = false), 1200)
      } else if (e.key === '/' || e.key === 'n') {
        const box = document.querySelector<HTMLElement>('main textarea, main input[type="search"], main input:not([type="checkbox"])')
        if (box) {
          e.preventDefault()
          box.focus()
        }
      } else if (e.key === '?') {
        onHelp()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(timer)
    }
  }, [navigate, onHelp])
}

// The sidebar's list of spaces under "Spaces": one click goes straight into one.
function SidebarSpaces() {
  const { data: initiatives } = useInitiatives()
  const [filter] = useInitiativeFilter()
  const openSpace = useOpenSpace()
  const { pathname } = useLocation()
  if (!initiatives || initiatives.length === 0) return null
  const rows = [...initiatives.map((i) => ({ id: i.id as number | null, name: i.name, style: getInitiativeStyle(i), key: i.id })), { id: null, name: 'Others', style: null, key: -1 }]
  return (
    <div className="mt-1 mb-1 ml-5 flex flex-col gap-0.5 border-l border-border pl-2">
      {rows.map((r) => {
        const active = pathname.startsWith('/notes') && filter === (r.id === null ? -1 : r.id)
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => openSpace(r.id)}
            className={`pressable flex h-8 items-center gap-2 rounded-lg px-2.5 text-left text-[0.8125rem] ${
              active ? 'bg-bg-hover font-semibold text-text' : 'text-text-muted hover:bg-bg-hover'
            }`}
          >
            {r.style ? <r.style.Icon size={14} strokeWidth={2} style={{ color: r.style.color }} className="flex-shrink-0" /> : <span className="h-3.5 w-3.5 flex-shrink-0" />}
            <span className="truncate">{r.name}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function Layout() {
  useHoverLabels()
  const { pathname } = useLocation()
  const [help, setHelp] = useState(false)
  useShortcuts(() => setHelp(true))
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
            <div key={tab.to}>
              <NavLink
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
              {tab.to === '/notes' && <SidebarSpaces />}
            </div>
          ))}
        </nav>
        <span className="flex-1" />
        <button type="button" onClick={() => setHelp(true)} className="pressable mb-2 flex h-9 items-center gap-2 rounded-lg px-3 text-left text-[0.8125rem] text-text-faint hover:bg-bg-hover">
          <Keyboard size={18} strokeWidth={1.8} className="flex-shrink-0" />
          Keyboard shortcuts
        </button>
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
          <div className="mx-auto flex min-h-full w-full flex-col px-4 pt-2 pb-6 lg:max-w-4xl lg:pt-6">
            <Outlet />
          </div>
        </main>

        <Toaster />
        <NotificationPrompt />
        <AlarmOverlay />
        {help && (
          <Sheet onClose={() => setHelp(false)} title="Keyboard shortcuts">
            <ul className="flex flex-col divide-y divide-border">
              {SHORTCUTS.map((s) => (
                <li key={s.keys} className="flex items-center justify-between gap-4 py-3 text-[0.9375rem]">
                  <span>{s.does}</span>
                  <kbd className="whitespace-pre rounded-lg border border-border-strong bg-bg-elevated px-2 py-1 text-[0.8125rem] font-medium text-text-muted">{s.keys}</kbd>
                </li>
              ))}
            </ul>
          </Sheet>
        )}

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
