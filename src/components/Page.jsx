import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { brand } from '../data/site'

/* Wraps every route: scrolls to top, sets the title, animates in/out. It is the page's main
   content (#main, where "Skip to content" goes), and after a move to another page the keyboard
   starts at its top, not on the link that was pressed in the menu that has gone. */
export default function Page({ title, children, className = '' }) {
  useEffect(() => {
    document.title = title ? `${title} — ${brand.name}` : `${brand.name} — ${brand.tagline}`
    if (window.__lenis) window.__lenis.scrollTo(0, { immediate: true })
    else window.scrollTo(0, 0)
  }, [title])
  useEffect(() => {
    const at = document.activeElement
    // only after a move made from the site's own links (not on arriving, nor when something on the page has the focus)
    if (at && at !== document.body && at.closest('.nav, .menu, .footer')) document.getElementById('main')?.focus({ preventScroll: true })
  }, [])
  return (
    <motion.main id="main" tabIndex={-1} className={`page ${className}`} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.45, delay: 0.3 } }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
      {children}
    </motion.main>
  )
}
