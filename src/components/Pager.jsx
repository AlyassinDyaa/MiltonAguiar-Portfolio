import { useEffect, useRef, useState } from 'react'

/* A long list shown a page at a time (the Work page's pieces, the Shop): 10, 15, 20, 25 or 50 to a
   page, as the visitor picks (kept in this browser, one choice per list), and a bar under the list to
   go page to page. `usePaged(list, key, reset)` answers the rows of the page being read and the bar's
   wiring; `reset` (the filters) brings the visitor back to page 1 when it changes. Changing page
   brings the top of the list back into view. */
export const PER = [10, 15, 20, 25, 50]
const read = (key) => { try { const n = Number(localStorage.getItem(`ma.per.${key}`)); return PER.includes(n) ? n : 15 } catch { return 15 } }

export function usePaged(list, key, reset) {
  const [per, setPerState] = useState(() => read(key))
  const [page, setPageState] = useState(1)
  const top = useRef(null) // the start of the list, scrolled to on a new page
  const pages = Math.max(1, Math.ceil(list.length / per))
  const at = Math.min(page, pages)
  useEffect(() => { setPageState(1) }, [reset]) // eslint-disable-line react-hooks/exhaustive-deps
  const toTop = () => {
    const el = top.current
    if (!el) return
    const y = el.getBoundingClientRect().top + window.scrollY - 110 // below the menu
    if (window.__lenis?.scrollTo) window.__lenis.scrollTo(y)
    else window.scrollTo({ top: y, behavior: 'smooth' })
  }
  const setPage = (n) => { const next = Math.min(pages, Math.max(1, n)); if (next !== at) { setPageState(next); toTop() } }
  const setPer = (n) => {
    try { localStorage.setItem(`ma.per.${key}`, String(n)) } catch { /* only for this visit */ }
    // stay on the piece at the top of what is showing
    const first = (at - 1) * per
    setPerState(n)
    setPageState(Math.floor(first / n) + 1)
  }
  const from = (at - 1) * per
  return { rows: list.slice(from, from + per), from, per, page: at, pages, total: list.length, setPage, setPer, top }
}

/* The bar: which pieces these are, the pages (the first and last, and those either side of this
   one; a gap shown as …), and how many to a page. */
export default function Pager({ paged, what = ['piece', 'pieces'] }) {
  const { from, per, page, pages, total, setPage, setPer, rows } = paged
  if (!total) return null
  const show = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)
  return (
    <nav className="pager" aria-label="Pages">
      <span className="pager-info">{from + 1}–{from + rows.length} of {total} {total === 1 ? what[0] : what[1]}</span>
      {pages > 1 && (
        <div className="pager-pages">
          <button type="button" className="pager-step" onClick={() => setPage(page - 1)} disabled={page === 1} aria-label="Previous page">‹</button>
          {show.map((n, i) => (
            <span key={n} className="pager-group">
              {i > 0 && n - show[i - 1] > 1 && <span className="pager-gap" aria-hidden="true">…</span>}
              <button type="button" className={`pager-num ${n === page ? 'on' : ''}`} aria-current={n === page ? 'page' : undefined} aria-label={`Page ${n}`} onClick={() => setPage(n)}>{n}</button>
            </span>
          ))}
          <button type="button" className="pager-step" onClick={() => setPage(page + 1)} disabled={page === pages} aria-label="Next page">›</button>
        </div>
      )}
      <label className="pager-per">
        <span>Per page</span>
        <select value={per} onChange={(e) => setPer(Number(e.target.value))}>
          {PER.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </nav>
  )
}
