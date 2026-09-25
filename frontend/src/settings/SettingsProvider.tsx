import { useLayoutEffect, useEffect, type ReactNode } from 'react'
import { useSettings } from '../api/settings'
import type { FontSize, Theme } from '../api/types'
import { applyPalette, getStoredPalette } from '../lib/palette'

const THEME_KEY = 'sb-theme'
const FONT_SIZE_KEY = 'sb-font-size'

function applyToDocument(theme: Theme, fontSize: FontSize) {
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.fontSize = fontSize
}

// Applies the theme/font-size preference to <html> (see index.css's
// data-theme / data-font-size rules). Two layers, so a stored preference
// shows up instantly on load instead of flashing the dark default first:
//   1. useLayoutEffect applies last-known values from localStorage
//      synchronously, before the browser paints the first frame.
//   2. Once useSettings() resolves the real server value (the source of
//      truth - see api/routers/settings.py), it's re-applied and cached,
//      so a change made on another device shows up here too.
export default function SettingsProvider({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const cachedTheme = (localStorage.getItem(THEME_KEY) as Theme | null) || 'dark'
    const cachedFontSize = (localStorage.getItem(FONT_SIZE_KEY) as FontSize | null) || 'default'
    applyToDocument(cachedTheme, cachedFontSize)
    applyPalette(getStoredPalette())
  }, [])

  const { data: settings } = useSettings()

  useEffect(() => {
    if (!settings) return
    applyToDocument(settings.theme, settings.font_size)
    localStorage.setItem(THEME_KEY, settings.theme)
    localStorage.setItem(FONT_SIZE_KEY, settings.font_size)
  }, [settings])

  return <>{children}</>
}
