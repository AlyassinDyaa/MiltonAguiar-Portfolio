import { useEffect, useRef, useState } from 'react'
import { asset } from '../data/site'
import Book from './Book'
import ComicReader from './ComicReader'
import Reveal from './Reveal'

/* One comic on the shelf: its cover as a small 3D book, and under it the title, the line about it
   and how many pages it has. With a mouse the book turns when pointed at and a click opens it.
   On a touch screen the first tap turns it and a second tap opens it; a tap anywhere else, or a
   scroll, puts it back. The tap is read from the finger going down and up in place, not from the
   click, because phones differ in when they send that click (as on the Imagine Action site). */
function ComicCard({ comic, onOpen }) {
  const [turned, setTurned] = useState(false)
  const card = useRef(null)
  const press = useRef(null)
  const swallow = useRef(false)

  useEffect(() => {
    if (!turned) return
    const away = (e) => { if (!card.current?.contains(e.target)) setTurned(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [turned])

  const down = (e) => {
    swallow.current = false
    press.current = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY, at: e.timeStamp }
  }
  const up = (e) => {
    const p = press.current
    press.current = null
    if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 16 || e.timeStamp - p.at > 900) return
    if (!turned) { swallow.current = true; setTurned(true) }
  }
  // the browser took the finger over (the page started to scroll)
  const cancel = () => { press.current = null; setTurned(false) }
  const click = () => {
    if (swallow.current) { swallow.current = false; return }
    setTurned(false)
    onOpen()
  }
  const pages = comic.count === 1 ? '1 page' : `${comic.count} pages`

  return (
    <button ref={card} type="button" className="comic-card" onPointerDown={down} onPointerUp={up} onPointerCancel={cancel} onClick={click} aria-label={`Read ${comic.title}`}>
      <Book turned={turned}>
        <img src={asset(comic.cover)} alt="" loading="lazy" draggable="false" />
      </Book>
      <span className="comic-meta">
        <strong className="display">{comic.title}</strong>
        {comic.text && <span className="dim">{comic.text}</span>}
        <small>{comic.count ? pages : 'Cover only'}{turned && <em> · Tap again to read</em>}</small>
      </span>
    </button>
  )
}

/* The comic samples on the Work page: every comic as a book, and the reader for the one opened. */
export default function ComicShelf({ comics }) {
  const [open, setOpen] = useState(null) // index of the comic being read
  return (
    <>
      <ul className="comic-shelf">
        {comics.map((c, i) => (
          <li key={c.slug}>
            <Reveal delay={i * 0.08}><ComicCard comic={c} onOpen={() => setOpen(i)} /></Reveal>
          </li>
        ))}
      </ul>
      <ComicReader comic={open != null ? comics[open] : null} onClose={() => setOpen(null)} />
    </>
  )
}
