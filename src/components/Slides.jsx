import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { asset } from '../data/site'
import { useReducedMotion } from '../hooks/useMedia'

/* A panel of art that keeps changing: it goes through the pieces it is given in a random order
   (a new order on every visit), each one wiped in across the last, with its title in a caption
   box. It waits while the tab is in the background, and holds still for reduced motion. */
const shuffled = (list) => {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export default function Slides({ items, every = 4200 }) {
  const reduced = useReducedMotion()
  const [order] = useState(() => shuffled(items.filter((p) => p && p.src)))
  const [at, setAt] = useState(0)
  useEffect(() => {
    if (reduced || order.length < 2) return
    const tick = setInterval(() => { if (!document.hidden) setAt((a) => (a + 1) % order.length) }, every)
    return () => clearInterval(tick)
  }, [reduced, order, every])
  // fetch the next picture ahead of its turn, so the wipe never uncovers an empty panel
  useEffect(() => {
    const next = order[(at + 1) % order.length]
    if (next && order.length > 1) new Image().src = asset(next.src)
  }, [at, order])
  const cur = order[at]
  if (!cur) return null
  return (
    <span className="slides">
      <AnimatePresence initial={false}>
        <motion.img
          key={cur.src} src={asset(cur.src)} alt="" draggable="false"
          initial={{ clipPath: 'inset(0 0 0 100%)' }} animate={{ clipPath: 'inset(0 0 0 0%)' }} exit={{ opacity: 0.999 }}
          transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
        />
      </AnimatePresence>
      {cur.title && <span className="caption" key={cur.title}>{cur.title}</span>}
    </span>
  )
}
