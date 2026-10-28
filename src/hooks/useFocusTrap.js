import { useEffect } from 'react'

/* A window that opens over the page (the cart, a picture, the menu, a notice) keeps the keyboard
   inside it while open, as WCAG asks (2.4.3, 2.1.2 without a trap that cannot be left: Escape and
   its own buttons close it):
   - on opening, the first thing in it that can be used is focused (unless something in it already is);
   - Tab and Shift+Tab go round the things in it, never out to the page behind;
   - on closing, the focus goes back to what opened it (the button pressed), so a keyboard user
     carries on where they were.
   `boxes` is a ref, or a list of refs (the menu counts its top bar too, where its own × is). */
// the windows open now, the newest last: only the one on top keeps the keyboard (the cart can open over a picture)
const open_ = []
const USABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(open, boxes) {
  useEffect(() => {
    if (!open) return undefined
    const me = {}
    open_.push(me)
    const back = document.activeElement
    const list = () => (Array.isArray(boxes) ? boxes : [boxes]).map((r) => r && r.current).filter(Boolean)
    const inside = (el) => list().some((b) => b.contains(el))
    const usable = () => list().flatMap((b) => [...b.querySelectorAll(USABLE)]).filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
    // (a moment after opening: the window is drawn by then)
    const first = setTimeout(() => {
      if (inside(document.activeElement)) return
      const [one] = usable()
      const target = one || list()[0]
      if (target) { if (!one && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }) }
    }, 80)
    const onKey = (e) => {
      if (e.key !== 'Tab' || open_[open_.length - 1] !== me) return
      const all = usable()
      if (!all.length) { e.preventDefault(); return }
      const at = all.indexOf(document.activeElement)
      if (at === -1) { e.preventDefault(); (e.shiftKey ? all[all.length - 1] : all[0]).focus(); return }
      if (e.shiftKey && at === 0) { e.preventDefault(); all[all.length - 1].focus() }
      else if (!e.shiftKey && at === all.length - 1) { e.preventDefault(); all[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(first)
      document.removeEventListener('keydown', onKey)
      open_.splice(open_.indexOf(me), 1)
      // back to what opened it, if it is still on the page
      if (back && typeof back.focus === 'function' && document.contains(back)) back.focus({ preventScroll: true })
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
}
