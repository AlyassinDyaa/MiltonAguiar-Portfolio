/* Words for a screen reader, said out loud without moving the focus (WCAG 4.1.3, status messages):
   "added to your cart", "removed"... The <Announcer /> in App.jsx keeps the one hidden place they
   are said from. */
export const announce = (text) => {
  if (typeof window === 'undefined' || !text) return
  window.dispatchEvent(new CustomEvent('ma:say', { detail: String(text) }))
}
