import { useEffect, useRef, useState } from 'react'
import Poster from './Poster'

/* Step by step: every stage of the same piece on top of each other (pencils, inks, colours; or an
   old drawing and its redraw), side by side, with a line between each two that you drag to wipe
   from one to the next. Three stages get two lines, two stages one. `year` is what a stage is
   called: "Pencils", "Inks", "2019". Each line is a slider: it is dragged with a finger or the
   mouse (anywhere on the picture moves the nearest line), and moved with the arrow keys too.
   `show` (a stage's number, or null for all of them evenly) moves the lines by themselves: the
   Commissions page shows the stage of the step being pointed at. */
const GAP = 6 // the closest two lines may come, in percent of the width

export default function Compare({ set, show = null }) {
  const stages = set.stages
  const lines = stages.length - 1
  // where the lines start: evenly spread (one line: the middle; two: a third and two thirds)
  const [pos, setPos] = useState(() => Array.from({ length: lines }, (_, i) => Math.round(((i + 1) * 100) / stages.length)))
  const box = useRef(null)
  const held = useRef(-1)
  const [gliding, setGliding] = useState(false)
  const even = () => Array.from({ length: lines }, (_, i) => Math.round(((i + 1) * 100) / stages.length))
  useEffect(() => {
    if (show === undefined) return
    // the stage asked for fills the picture; the others keep a sliver at the edges
    const t = show === null ? null : Math.min(stages.length - 1, Math.max(0, show))
    setPos(t === null ? even() : Array.from({ length: lines }, (_, i) => (i < t ? 3 + i * GAP : 97 - (lines - 1 - i) * GAP)))
    setGliding(true)
    const done = setTimeout(() => setGliding(false), 750)
    return () => clearTimeout(done)
  }, [show]) // eslint-disable-line react-hooks/exhaustive-deps

  const place = (i, value) => setPos((now) => {
    const lo = i ? now[i - 1] + GAP : 0
    const hi = i < now.length - 1 ? now[i + 1] - GAP : 100
    const next = [...now]
    next[i] = Math.round(Math.min(hi, Math.max(lo, value)) * 10) / 10
    return next
  })
  const percentAt = (e) => {
    const r = box.current.getBoundingClientRect()
    return ((e.clientX - r.left) / r.width) * 100
  }
  const down = (e) => {
    if (e.button !== undefined && e.button !== 0) return
    const at = percentAt(e)
    // the nearest line follows the pointer
    let i = 0
    pos.forEach((p, k) => { if (Math.abs(p - at) < Math.abs(pos[i] - at)) i = k })
    held.current = i
    setGliding(false)
    box.current.setPointerCapture?.(e.pointerId)
    place(i, at)
  }
  const move = (e) => { if (held.current >= 0) place(held.current, percentAt(e)) }
  const up = () => { held.current = -1 }
  const key = (i) => (e) => {
    const step = e.shiftKey ? 10 : 2
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); place(i, pos[i] - step) }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); place(i, pos[i] + step) }
    if (e.key === 'Home') { e.preventDefault(); place(i, 0) }
    if (e.key === 'End') { e.preventDefault(); place(i, 100) }
  }

  const last = stages[stages.length - 1]
  const edges = [0, ...pos, 100] // stage k shows from edges[k] to edges[k + 1]
  return (
    <figure className={`compare ${gliding ? 'is-gliding' : ''}`}>
      <div className="compare-stage" ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <Poster title={set.title} src={last.src} />
        {/* the earlier stages over it, each cut off at its line; the earliest on top */}
        {stages.slice(0, -1).map((s, k) => ({ s, k })).reverse().map(({ s, k }) => (
          <div key={`${s.year}-${k}`} className="compare-then" style={{ clipPath: `inset(0 ${100 - pos[k]}% 0 0)` }}>
            <Poster title={set.title} src={s.src} rough />
          </div>
        ))}
        {stages.map((s, k) => (
          (edges[k + 1] - edges[k] >= 14 || k === 0 || k === stages.length - 1) && (
            <span key={`label-${k}`} className={`compare-year ${k === stages.length - 1 ? 'now' : 'then'}`} style={k === stages.length - 1 ? undefined : { left: `calc(${edges[k]}% + 10px)` }}>{s.year}</span>
          )
        ))}
        {pos.map((p, i) => (
          <span
            key={`line-${i}`}
            className="compare-line"
            style={{ left: `${p}%` }}
            role="slider"
            tabIndex={0}
            aria-label={`${set.title}: line between ${stages[i].year} and ${stages[i + 1].year}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(p)}
            aria-valuetext={`${Math.round(p)}%`}
            onKeyDown={key(i)}
          >
            <i aria-hidden="true">↔</i>
          </span>
        ))}
      </div>
      <figcaption>
        <h3 className="display h-sm">{set.title}</h3>
        {set.text && <p className="dim">{set.text}</p>}
      </figcaption>
    </figure>
  )
}
