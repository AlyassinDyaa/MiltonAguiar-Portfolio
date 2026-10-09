import { useEffect, useRef, useState } from 'react'

/* A row that scrolls sideways when it holds more than fits (the pencils-to-colours sets, the comic
   samples): each item keeps its size and the row snaps to them. Arrows at the sides move it along
   (they show only when there is more to see, and go dim at an end); a finger swipes it, a trackpad
   or Shift + wheel scrolls it, and the arrow keys do once it has the focus. `as` is the row's own
   element (a list: 'ul'), `label` names it for a screen reader. */
export default function ScrollRow({ children, label, as: Track = 'div', className = '' }) {
  const track = useRef(null)
  const [edge, setEdge] = useState({ start: true, end: true })
  const look = () => {
    const t = track.current
    if (!t) return
    const start = t.scrollLeft <= 4
    const end = t.scrollLeft + t.clientWidth >= t.scrollWidth - 4
    setEdge((was) => (was.start === start && was.end === end ? was : { start, end }))
  }
  useEffect(() => {
    const t = track.current
    if (!t) return
    look()
    const watch = new ResizeObserver(look)
    watch.observe(t)
    for (const c of t.children) watch.observe(c)
    return () => watch.disconnect()
  }, [children])
  const by = (way) => {
    const t = track.current
    if (!t) return
    const item = t.firstElementChild
    const step = item ? item.getBoundingClientRect().width + parseFloat(getComputedStyle(t).columnGap || 0) : 240
    // as many whole items as fit, at least one
    t.scrollBy({ left: way * Math.max(step, Math.floor(t.clientWidth / step) * step), behavior: 'smooth' })
  }
  const scrolls = !(edge.start && edge.end)
  return (
    <div className={`srow ${scrolls ? 'can-scroll' : ''} ${edge.start ? 'at-start' : ''} ${edge.end ? 'at-end' : ''} ${className}`}>
      <Track ref={track} className="srow-track" onScroll={look} aria-label={label} tabIndex={scrolls ? 0 : undefined}
        onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === 'ArrowRight') { e.preventDefault(); by(1) } if (e.key === 'ArrowLeft') { e.preventDefault(); by(-1) } }}>
        {children}
      </Track>
      {scrolls && (
        <>
          <button type="button" className="srow-arrow is-prev" onClick={() => by(-1)} disabled={edge.start} aria-label="Scroll back">‹</button>
          <button type="button" className="srow-arrow is-next" onClick={() => by(1)} disabled={edge.end} aria-label="Scroll on">›</button>
        </>
      )}
    </div>
  )
}
