import { useEffect, useState } from 'react'

/* The light / dark switch in the top bar. The site is dark unless the visitor chooses otherwise;
   their choice is kept in their browser (the small script in index.html applies it before the
   page is drawn, so a visitor who chose light never sees a flash of dark). */
const KEY = 'ma.theme'
const PAGE = { dark: '#0e0c0d', light: '#f4f0e6' } // the colour a phone's browser bar takes
const SUN = 'M12 7.500a4.500 4.500 0 1 0 0 9 4.500 4.500 0 0 0 0-9z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M4.900 4.900l1.400 1.400 M17.700 17.700l1.400 1.400 M4.900 19.100l1.400-1.400 M17.700 6.300l1.400-1.400'
const MOON = 'M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500z'

const saved = () => {
  try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark' } catch { return 'dark' } // storage switched off: dark
}

export default function ThemeSwitch() {
  const [theme, setTheme] = useState(saved)
  useEffect(() => {
    if (theme === 'light') document.documentElement.dataset.theme = 'light'
    else delete document.documentElement.dataset.theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PAGE[theme])
  }, [theme])
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try { localStorage.setItem(KEY, next) } catch { /* not remembered, still applied */ }
  }
  const to = theme === 'dark' ? 'light' : 'dark'
  return (
    <button type="button" className="theme-btn" onClick={flip} title={`Switch to ${to} mode`} aria-label={`Switch to ${to} mode`}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={theme === 'dark' ? SUN : MOON} /></svg>
    </button>
  )
}
