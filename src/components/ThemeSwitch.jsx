import { useEffect, useState } from 'react'
import { themeOnly } from '../data/site'

/* The light / dark switch in the top bar. The site is dark unless the visitor chooses otherwise;
   their choice is kept in their browser (the small script in index.html applies it before the
   page is drawn, so a visitor who chose light never sees a flash of dark).
   The admin can switch either theme off (Show or hide → Dark and light). Then the site is always
   the other one, whatever a visitor chose before, and there is no switch to show. */
const KEY = 'ma.theme'
const PAGE = { dark: '#0b0b0c', light: '#eeede8' } // the colour a phone's browser bar takes
const SUN = 'M12 7.500a4.500 4.500 0 1 0 0 9 4.500 4.500 0 0 0 0-9z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M4.900 4.900l1.400 1.400 M17.700 17.700l1.400 1.400 M4.900 19.100l1.400-1.400 M17.700 6.300l1.400-1.400'
const MOON = 'M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500z'

const saved = () => {
  try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark' } catch { return 'dark' } // storage switched off: dark
}

export default function ThemeSwitch() {
  const only = themeOnly()
  const [chosen, setChosen] = useState(saved)
  const theme = only || chosen
  useEffect(() => {
    if (theme === 'light') document.documentElement.dataset.theme = 'light'
    else delete document.documentElement.dataset.theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PAGE[theme])
  }, [theme])
  if (only) return null
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setChosen(next)
    try { localStorage.setItem(KEY, next) } catch { /* not remembered, still applied */ }
  }
  const to = theme === 'dark' ? 'light' : 'dark'
  return (
    <button type="button" className="theme-btn" onClick={flip} title={`Switch to ${to} mode`} aria-label={`Switch to ${to} mode`}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={theme === 'dark' ? SUN : MOON} /></svg>
    </button>
  )
}
