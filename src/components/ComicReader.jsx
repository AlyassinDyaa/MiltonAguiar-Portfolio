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

/* What is seen at once. On a wide screen, like a printed comic: the cover alone, then facing pairs.
   A spread fills a whole pair, so a page left without a partner just before it stands alone and the
   spread lines up. On a narrow screen, one picture at a time. Each view is a list of sheet indexes. */
const viewsOf = (sheets, wide) => {
  if (!wide) return sheets.map((s, i) => [i])
  const views = [[0]]
  let left = null
  sheets.forEach((s, i) => {
    if (i === 0) return
    if (s.spread) {
      if (left != null) views.push([left])
      left = null
      views.push([i])
    } else if (left == null) left = i
    else { views.push([left, i]); left = null }
  })
  if (left != null) views.push([left])
  return views
}

// a page turning: in from the side it is going to, out the other way (only a fade with reduced motion)
const turn = {
  enter: ({ dir, still }) => (still ? { opacity: 0 } : { opacity: 0, x: dir * 70, rotateY: dir * -10 }),
  show: { opacity: 1, x: 0, rotateY: 0 },
  leave: ({ dir, still }) => (still ? { opacity: 0 } : { opacity: 0, x: dir * -70, rotateY: dir * 10 }),
}

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
  const [dir, setDir] = useState(1)
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

  const v = Math.max(0, views.findIndex((list) => list.includes(at)))
  const view = views[v]
  const shown = view.map((i) => sheets[i])
  const inside = shown.filter((s) => !s.cover)
  const lo = inside.length ? inside[0].from : 0
  const hi = inside.length ? inside[inside.length - 1].to : 0
  const where = !inside.length ? 'Cover' : `${lo === hi ? `Page ${lo}` : `Pages ${lo}–${hi}`} of ${comic.count}`
  const stripShown = stripOpen ?? tall
  const first = v === 0, last = v === views.length - 1

  const go = (to) => {
    const next = Math.min(views.length - 1, Math.max(0, to))
    if (next === v) return
    setDir(next > v ? 1 : -1)
    setAt(views[next][0])
    setZoom(null)
  }
  const jump = (i) => { if (!view.includes(i)) { setDir(i > at ? 1 : -1); setAt(i); setZoom(null) } }
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
    for (const near of [views[v + 1], views[v - 1]]) for (const i of near || []) { const img = new Image(); img.src = asset(sheets[i].src) }
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
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, zx: zoom?.x ?? 0, zy: zoom?.y ?? 0, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const move = (e) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const mx = e.clientX - d.x, my = e.clientY - d.y
    if (!d.moved && Math.hypot(mx, my) < 8) return
    if (!d.moved) { d.moved = true; setPanning(true) }
    if (zoom) setZoom(fit(d.zx + mx, d.zy + my))
    else if (Math.abs(mx) > Math.abs(my)) setDx(mx)
  }
  const up = (e) => {
    const d = drag.current
    drag.current = null
    setPanning(false)
    setDx(0)
    if (!d || e.type === 'pointercancel') return
    const mx = e.clientX - d.x, my = e.clientY - d.y
    if (d.moved) {
      // a sideways swipe turns the page
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

  const page = (s, side) => (
    <div className={`reader-page ${side}`} key={s.src + side}>
      <img src={asset(s.src)} alt={`${comic.title}, ${nameOf(s).toLowerCase()}`} draggable="false" />
    </div>
  )
  const lone = shown.length === 1
  const spreadOnPhone = !wide && shown[0].spread
  const look = zoom ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${ZOOM})` } : dx ? { transform: `translateX(${dx}px)` } : undefined

  return (
    <motion.div ref={box} className="reader" role="dialog" aria-modal="true" aria-label={`${comic.title}: comic reader`} tabIndex={-1} data-lenis-prevent
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <div ref={stage} className={`reader-stage ${zoom ? 'is-zoomed' : ''} ${panning ? 'is-panning' : ''}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="reader-zoom" style={look}>
          <AnimatePresence initial={false} custom={{ dir, still }}>
            <motion.div key={`${wide}:${view.join('-')}`} className={`reader-view ${wide && !shown[0].spread ? 'is-pair' : 'is-one'}`}
              custom={{ dir, still }} variants={turn} initial="enter" animate="show" exit="leave"
              transition={{ duration: still ? 0.15 : 0.38, ease: [0.16, 1, 0.3, 1] }}>
              {wide && !shown[0].spread
                ? lone
                  ? shown[0].cover ? [<div className="reader-page is-left is-blank" key="blank" />, page(shown[0], 'is-right')] : [page(shown[0], 'is-left'), <div className="reader-page is-right is-blank" key="blank" />]
                  : [page(shown[0], 'is-left'), page(shown[1], 'is-right')]
                : page(shown[0], shown[0].spread ? 'is-spread' : 'is-single')}
            </motion.div>
          </AnimatePresence>
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
              const on = view.includes(i)
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
