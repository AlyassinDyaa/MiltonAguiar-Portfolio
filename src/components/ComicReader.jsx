import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { asset } from '../data/site'
import { useFinePointer, useMedia, useReducedMotion } from '../hooks/useMedia'

const ZOOM = 2.2 // how far in a double click (or double tap) takes a page
const TAP = 280 // ms: a second tap within this is a double tap

/* The comic as a list of pictures: the cover, then each page with its number. Page 1 is the first
   page after the cover; a spread is one picture with two numbers. */
const sheetsOf = (comic) => {
  let n = 1
  return [
    { src: comic.cover, cover: true },
    ...comic.pages.map((p) => {
      const from = n
      n += p.spread ? 2 : 1
      return { src: p.src, spread: p.spread, from, to: p.spread ? from + 1 : from }
    }),
  ]
}
const nameOf = (s) => (s.cover ? 'Cover' : s.spread ? `Pages ${s.from}–${s.to}` : `Page ${s.from}`)
const shortOf = (s) => (s.cover ? 'Cover' : s.spread ? `${s.from}–${s.to}` : String(s.from))

/* What is seen at once. On a wide screen, like a printed comic: the cover alone (it is not a page),
   then page 1 alone on the right, as inside a comic, then facing pairs, 2–3, 4–5... Even pages are
   left-hand pages and odd ones right-hand pages. A spread fills a whole pair; a left-hand page left
   without its partner just before one stands alone. On a narrow screen, one picture at a time. Each
   view is a list of sheet indexes. */
/* On a narrow screen one page at a time, and a spread is read as its two pages, its left half then
   its right half (the right half is the sheet's index plus 0.5); a phone on its side shows it whole. */
const viewsOf = (sheets, wide) => {
  if (!wide) return sheets.flatMap((s, i) => (s.spread ? [[i], [i + 0.5]] : [[i]]))
  const views = [[0]]
  let left = null // a left-hand (even) page waiting for the right-hand page beside it
  sheets.forEach((s, i) => {
    if (i === 0) return
    if (s.spread) {
      if (left != null) views.push([left])
      left = null
      views.push([i])
    } else if (s.from % 2 === 1) {
      // a right-hand page: beside the left-hand one waiting, or alone (page 1)
      views.push(left != null ? [left, i] : [i])
      left = null
    } else {
      if (left != null) views.push([left])
      left = i
    }
  })
  if (left != null) views.push([left])
  return views
}

/* Turning a page, as in a printed comic. The open book is two page boxes either side of the spine;
   what each shows is a whole page, one half of a two-page spread, or nothing (the cover has no page
   to its left). Turning forward, the right-hand page lifts and turns over on the spine: its front is
   the page being left, its back the next left-hand page, and the next right-hand page is under it.
   Turning back is the same the other way. On a phone (one page at a time) the page peels away to the
   left, or comes back from there. With reduced motion the page simply changes. */
const half = (s, part) => (s ? { src: s.src, part, name: nameOf(s) } : null)
const halvesOf = (shown) => {
  if (shown[0].spread) return { L: half(shown[0], 'left'), R: half(shown[0], 'right') }
  if (shown.length === 2) return { L: half(shown[0], 'whole'), R: half(shown[1], 'whole') }
  // a page alone: the cover and odd pages on the right, even pages on the left
  return shown[0].cover || shown[0].from % 2 === 1 ? { L: null, R: half(shown[0], 'whole') } : { L: half(shown[0], 'whole'), R: null }
}
const TURN_MS = 850
/* How far a page has turned, in degrees, as a CSS variable the page and its shadows follow. On a
   wide screen the right-hand page turns from 0 to -180 (forward) and the left-hand one from 0 to 180
   (back). On a phone the page peels from 0 to -180, or comes back from -180 to 0. */
const startOf = (wide, dir) => (wide ? 0 : dir > 0 ? 0 : -180)
const endOf = (wide, dir) => (wide ? (dir > 0 ? -180 : 180) : dir > 0 ? -180 : 0)

/* The comic reader: a comic full screen, page by page. Turn the page with the arrows at the sides,
   the arrow keys (also Page Up / Page Down, Home and End), a sideways swipe, or a click on the right
   or left half of the page. The bar at the foot says where you are and lists every page to jump to.
   A double click (or double tap) zooms in on that spot; drag to look around, double again to come
   back out. Escape or the × closes it. `comic` is the comic to read, or null when closed. */
export default function ComicReader({ comic, onClose }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>{comic && <Reader key={comic.slug} comic={comic} onClose={onClose} />}</AnimatePresence>,
    document.body,
  )
}

function Reader({ comic, onClose }) {
  const wide = useMedia('(min-width: 700px) and (min-aspect-ratio: 5/4)') // room for two pages side by side
  const tall = useMedia('(min-height: 560px)') // room for the strip of pages under them
  const still = useReducedMotion()
  const fine = useFinePointer()
  const sheets = useMemo(() => sheetsOf(comic), [comic])
  const views = useMemo(() => viewsOf(sheets, wide), [sheets, wide])
  const [at, setAt] = useState(0) // the sheet being read (its view is worked out from it, so a turned phone keeps the place)
  const [flip, setFlip] = useState(null) // a page turning: { from, to, dir, n, drag, cancel } (views)
  const [angle, setAngle] = useState(0) // how far it has turned
  const flipping = useRef(null)
  flipping.current = flip
  const bookRef = useRef(null)
  const [ratio, setRatio] = useState(0.66) // a page's width to its height, from the cover
  const [zoom, setZoom] = useState(null) // { x, y }: how far a zoomed page is moved, in px
  const [dx, setDx] = useState(0) // how far a finger has pulled the page sideways
  const [panning, setPanning] = useState(false)
  const [stripOpen, setStripOpen] = useState(null) // the visitor's own choice; until then, shown when there is room
  const box = useRef(null)
  const stage = useRef(null)
  const strip = useRef(null)
  const drag = useRef(null)
  const lastTap = useRef(null)
  const tapTimer = useRef(0)

  // the view a sheet is in: exactly, or (a half of a spread read on a phone, then the phone turned) the one holding its sheet
  const viewOf = (x) => { const k = views.findIndex((list) => list.includes(x)); return k >= 0 ? k : views.findIndex((list) => list.some((y) => Math.floor(y) === Math.floor(x))) }
  const settled = Math.max(0, viewOf(at))
  const v = flip && !flip.drag && !flip.cancel ? flip.to : settled // where the reader is going (the label, the strip and the keys follow it)
  const view = views[v]
  const shown = view.map((i) => sheets[Math.floor(i)])
  // a spread read on a phone shows one of its halves: which one, and so which page number
  const partOf = (x) => (wide || !sheets[Math.floor(x)].spread ? 'whole' : x % 1 ? 'right' : 'left')
  const inside = shown.filter((s) => !s.cover)
  const part = partOf(view[0])
  const lo = inside.length ? (part === 'right' ? inside[0].to : inside[0].from) : 0
  const hi = inside.length ? (part === 'left' ? inside[0].from : inside[inside.length - 1].to) : 0
  const where = !inside.length ? 'Cover' : `${lo === hi ? `Page ${lo}` : `Pages ${lo}–${hi}`} of ${comic.count}`
  const stripShown = stripOpen ?? tall
  const first = v === 0, last = v === views.length - 1

  // a page turned: it lifts and turns over (a turn still going lands at once); the next view is where the reader is
  const go = (to) => {
    const next = Math.min(views.length - 1, Math.max(0, to))
    if (next === v) return
    setZoom(null)
    if (still) { setFlip(null); setAt(views[next][0]); return }
    const dir = next > v ? 1 : -1
    setAt(views[v][0])
    const n = Date.now()
    // the page is first put where it starts (without moving there), then turns: two frames, so the
    // browser has drawn the start before the turn begins
    setFlip({ from: v, to: next, dir, n, starting: true })
    setAngle(startOf(wide, dir))
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setFlip((f) => (f && f.n === n ? { ...f, starting: false } : f))
      setAngle(endOf(wide, dir))
    }))
  }
  // the turn is over: on the next view, or (a drag let go too early) back where it was
  const landed = () => { const f = flipping.current; if (!f || f.drag || f.starting) return; if (!f.cancel) setAt(views[f.to][0]); setFlip(null) }
  const jump = (i) => { const to = viewOf(i); if (to >= 0) go(to) }
  // should the animation's end never be heard (a hidden tab), the page lands anyway
  useEffect(() => { if (!flip || flip.drag) return; const t = setTimeout(landed, TURN_MS + 250); return () => clearTimeout(t) }, [flip]) // eslint-disable-line react-hooks/exhaustive-deps
  // a phone turned mid-turn: the views change, so the turn just lands
  useEffect(() => { setFlip(null) }, [wide])
  // the shape of a page, from the cover, so the open book is the comic's own shape
  useEffect(() => {
    const img = new Image()
    img.onload = () => { if (img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight) }
    img.src = asset(sheets[0].src)
  }, [sheets])
  // the keys and the delayed tap act on whatever is showing when they happen
  const act = useRef({})
  act.current = { go, v, views, zoom, onClose }

  // the page behind stays put, and the reader takes the keyboard; on closing, focus goes back
  useEffect(() => {
    const opener = document.activeElement
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.__lenis?.stop?.()
    box.current?.focus()
    return () => {
      document.body.style.overflow = before
      window.__lenis?.start?.()
      clearTimeout(tapTimer.current)
      if (opener && opener.isConnected) opener.focus?.({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    const key = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const a = act.current
      const moves = { ArrowRight: a.v + 1, PageDown: a.v + 1, ArrowLeft: a.v - 1, PageUp: a.v - 1, Home: 0, End: a.views.length - 1 }
      if (e.key === 'Escape') { e.preventDefault(); if (a.zoom) setZoom(null); else a.onClose() }
      else if (e.key in moves) { e.preventDefault(); a.go(moves[e.key]) }
      else if (e.key === 'Tab') {
        // the keyboard stays inside the reader
        const stops = [...box.current.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
        if (!stops.length) return
        const i = stops.indexOf(document.activeElement)
        const next = e.shiftKey ? (i <= 0 ? stops.length - 1 : i - 1) : (i === -1 || i === stops.length - 1 ? 0 : i + 1)
        e.preventDefault()
        stops[next].focus()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  // the pictures either side of these are fetched ahead, so a turned page is there at once
  useEffect(() => {
    for (const near of [views[v + 1], views[v - 1]]) for (const i of near || []) { const img = new Image(); img.src = asset(sheets[Math.floor(i)].src) }
  }, [v, views, sheets])

  // the strip keeps the page being read in the middle of it
  useEffect(() => {
    const row = strip.current
    const on = row && row.querySelector('.on')
    if (!on) return
    row.scrollTo({ left: on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2, behavior: still ? 'auto' : 'smooth' })
  }, [v, stripShown, still])

  // a zoomed page can be moved until its edge meets the edge of the screen, no further
  const fit = (x, y) => {
    const r = stage.current.getBoundingClientRect()
    const mx = ((ZOOM - 1) * r.width) / 2, my = ((ZOOM - 1) * r.height) / 2
    return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) }
  }
  // zoom in on the spot double clicked (it stays under the pointer), or back out
  const toggleZoom = (cx, cy) => {
    if (zoom) { setZoom(null); return }
    const r = stage.current.getBoundingClientRect()
    setZoom(fit(-(ZOOM - 1) * (cx - (r.left + r.width / 2)), -(ZOOM - 1) * (cy - (r.top + r.height / 2))))
  }

  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, zx: zoom?.x ?? 0, zy: zoom?.y ?? 0, moved: false, last: e.clientX, at: e.timeStamp, speed: 0 }
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* a pointer the browser no longer tracks */ }
  }
  const move = (e) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const mx = e.clientX - d.x, my = e.clientY - d.y
    if (!d.moved && Math.hypot(mx, my) < 8) return
    if (!d.moved) { d.moved = true; setPanning(true) }
    if (zoom) { setZoom(fit(d.zx + mx, d.zy + my)); return }
    d.speed = (e.clientX - d.last) / Math.max(1, e.timeStamp - d.at) // px per ms
    d.last = e.clientX
    d.at = e.timeStamp
    if (!d.turning && Math.abs(mx) <= Math.abs(my)) return
    // the page under the finger lifts and turns as far as it is pulled (at either end it only gives a little)
    if (!d.turning) {
      const dir = mx < 0 ? 1 : -1
      const to = v + dir
      if (still || flipping.current || to < 0 || to >= views.length) { setDx(mx * 0.2); return }
      const w = bookRef.current ? bookRef.current.getBoundingClientRect().width / (wide ? 2 : 1) : 300
      d.turning = { dir, w }
      setAt(views[v][0])
      setFlip({ from: v, to, dir, n: Date.now(), drag: true })
    }
    const t = d.turning
    d.p = Math.min(1, Math.max(0, (-mx * t.dir) / t.w))
    setAngle(startOf(wide, t.dir) + (endOf(wide, t.dir) - startOf(wide, t.dir)) * d.p)
  }
  const up = (e) => {
    const d = drag.current
    drag.current = null
    setPanning(false)
    setDx(0)
    if (d && d.turning && e.type === 'pointercancel') { setFlip((f) => (f ? { ...f, drag: false, cancel: true } : f)); setAngle(startOf(wide, d.turning.dir)); return }
    if (!d || e.type === 'pointercancel') return
    const mx = e.clientX - d.x, my = e.clientY - d.y
    if (d.turning) {
      // let go: far enough (or flicked), the page turns over; otherwise it falls back
      const t = d.turning
      const done = d.p > 0.33 || -d.speed * t.dir > 0.45
      setFlip((f) => (f ? { ...f, drag: false, cancel: !done } : f))
      setAngle(done ? endOf(wide, t.dir) : startOf(wide, t.dir))
      return
    }
    if (d.moved) {
      // with reduced motion, a sideways swipe turns the page at once
      if (!zoom && Math.abs(mx) > 50 && Math.abs(mx) > Math.abs(my)) go(v + (mx < 0 ? 1 : -1))
      return
    }
    // a tap: two quickly in the same place zoom; one alone turns the page by the half it fell on
    const t = lastTap.current
    if (t && e.timeStamp - t.at < TAP && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 30) {
      clearTimeout(tapTimer.current)
      lastTap.current = null
      toggleZoom(e.clientX, e.clientY)
      return
    }
    lastTap.current = { at: e.timeStamp, x: e.clientX, y: e.clientY }
    if (zoom) return
    const r = stage.current.getBoundingClientRect()
    const way = e.clientX > r.left + r.width / 2 ? 1 : -1
    clearTimeout(tapTimer.current)
    tapTimer.current = setTimeout(() => act.current.go(act.current.v + way), TAP)
  }

  // one page box's picture: a whole page, a half of a spread, or nothing
  const face = (c, cls = '') => (
    <div className={`reader-face ${cls} ${c ? '' : 'is-blank'}`}>
      {c && <img src={asset(c.src)} className={`is-${c.part}`} alt={c.part === 'right' ? '' : `${comic.title}, ${c.name.toLowerCase()}`} draggable="false" />}
    </div>
  )
  const sheetsAt = (i) => views[i].map((k) => sheets[Math.floor(k)])
  const leaf = (cls, front, back) => (
    <div key={flip.n} className={`reader-leaf ${cls}`}>
      {face(front, 'is-front')}{face(back, 'is-back')}
    </div>
  )
  // the open book; while a page turns it carries how far (--turn), and which way (for the shadows)
  const turning = flip ? `is-turning is-${flip.dir > 0 ? (wide ? 'fwd' : 'peel') : wide ? 'back' : 'unpeel'} ${flip.drag || flip.starting ? 'is-dragging' : ''}` : ''
  const bookProps = (r) => ({
    ref: bookRef,
    style: { '--r': r, '--turn': `${flip ? angle : 0}deg`, '--turn-ms': `${TURN_MS}ms` },
    onTransitionEnd: (e) => { if (e.target === e.currentTarget && e.propertyName === '--turn') landed() },
  })
  const pair = (L, R, leafEl, under) => (
    <div className={`reader-book is-pair ${turning}`} {...bookProps(2 * ratio)}>
      <div className={`reader-cell is-left ${under === 'L' ? 'is-under' : ''}`}>{face(L)}</div>
      <div className={`reader-cell is-right ${under === 'R' ? 'is-under' : ''}`}>{face(R)}</div>
      {leafEl}
    </div>
  )
  // one page on a phone: a whole page, or one half of a spread (a page the shape of the others)
  const one = (x, leafEl) => {
    const sh = sheets[Math.floor(x)]
    const pt = partOf(x)
    return (
      <div className={`reader-book is-one ${turning}`} {...bookProps(pt === 'whole' && sh.spread ? 2 * ratio : ratio)}>
        <div className={`reader-cell ${leafEl ? 'is-under' : ''}`}>{face(half(sh, pt))}</div>
        {leafEl}
      </div>
    )
  }
  let book
  if (wide) {
    if (!flip) { const h = halvesOf(shown); book = pair(h.L, h.R) }
    else {
      const a = halvesOf(sheetsAt(flip.from)), b = halvesOf(sheetsAt(flip.to))
      book = flip.dir > 0 ? pair(a.L, b.R, leaf('is-fwd', a.R, b.L), 'R') : pair(b.L, a.R, leaf('is-back', a.L, b.R), 'L')
    }
  } else if (!flip) book = one(view[0])
  else {
    const a = views[flip.from][0], b = views[flip.to][0]
    const pageAt = (x) => half(sheets[Math.floor(x)], partOf(x))
    book = flip.dir > 0 ? one(b, leaf('is-peel', pageAt(a), null)) : one(a, leaf('is-unpeel', pageAt(b), null))
  }
  const spreadOnPhone = false // a spread is read page by page on a phone now
  const look = zoom ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${ZOOM})` } : dx ? { transform: `translateX(${dx}px)` } : undefined

  return (
    <motion.div ref={box} className="reader" role="dialog" aria-modal="true" aria-label={`${comic.title}: comic reader`} tabIndex={-1} data-lenis-prevent
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <div ref={stage} className={`reader-stage ${zoom ? 'is-zoomed' : ''} ${panning ? 'is-panning' : ''}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="reader-zoom" style={look}>
          {book}
        </div>
        {spreadOnPhone && !zoom && <p className="reader-note">A two-page spread: turn the phone sideways, or double-tap to zoom in</p>}
      </div>

      <button type="button" className="reader-x" onClick={onClose} aria-label="Close the comic">×</button>
      <button type="button" className="reader-nav prev" onClick={() => go(v - 1)} disabled={first} aria-label="Previous page"><span aria-hidden="true">←</span></button>
      <button type="button" className="reader-nav next" onClick={() => go(v + 1)} disabled={last} aria-label="Next page"><span aria-hidden="true">→</span></button>

      <div className="reader-foot">
        <div className="reader-bar">
          <strong className="reader-title">{comic.title}</strong>
          <span className="reader-where" aria-live="polite">{where}</span>
          <span className="reader-hint">{fine ? '← → to turn · double-click to zoom' : 'Swipe to turn · double-tap to zoom'}</span>
          <button type="button" className={`reader-toggle ${stripShown ? 'on' : ''}`} aria-expanded={stripShown} onClick={() => setStripOpen(!stripShown)}>Pages</button>
        </div>
        {stripShown && (
          <div ref={strip} className="reader-strip" role="group" aria-label="Go to a page"
            onWheel={(e) => { if (!e.deltaX && e.deltaY) e.currentTarget.scrollLeft += e.deltaY }}>
            {sheets.map((s, i) => {
              const on = view.some((x) => Math.floor(x) === i)
              return (
                <button key={i} type="button" className={`reader-thumb ${s.spread ? 'is-spread' : ''} ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined} aria-label={nameOf(s)} onClick={() => jump(i)}>
                  <img src={asset(s.src)} alt="" loading="lazy" draggable="false" />
                  <span>{shortOf(s)}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}
