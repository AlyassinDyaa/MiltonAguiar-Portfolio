import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { asset } from '../data/site'
import { useReducedMotion } from '../hooks/useMedia'

/* A deck of finished pieces, dealt one at a time: each piece is shown whole, at its own shape,
   as a printed page with a white edge lying at a slight angle, with its title in a caption box.
   The next one is dealt in from the right while the last slides away. The order is random, new
   on every visit. Pieces marked as pencils or work in progress are left out.
   Given one piece, it simply shows it. It waits while the tab is in the background, and holds
   still for reduced motion. */
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
  const [order] = useState(() => {
    const drawn = items.filter((p) => p && p.src)
    const finished = drawn.filter((p) => !p.rough)
    return shuffled(finished.length ? finished : drawn) // nothing finished yet: better pencils than nothing
  })
  const [at, setAt] = useState(0)
  useEffect(() => {
    if (reduced || order.length < 2) return
    const tick = setInterval(() => { if (!document.hidden) setAt((a) => (a + 1) % order.length) }, every)
    return () => clearInterval(tick)
  }, [reduced, order, every])
  // fetch the next picture ahead of its turn, so it is there when it is dealt
  useEffect(() => {
    const next = order[(at + 1) % order.length]
    if (next && order.length > 1) new Image().src = asset(next.src)
  }, [at, order])
  const cur = order[at]
  if (!cur) return null
  return (
    <span className="deck">
      <AnimatePresence initial={false}>
        <motion.span
          key={cur.src} className="deck-card"
          initial={{ opacity: 0, x: 80, rotate: 10 }}
          animate={{ opacity: 1, x: 0, rotate: at % 2 ? -2.5 : 3 }}
          exit={{ opacity: 0, x: -60, rotate: -9, transition: { duration: 0.45, ease: [0.76, 0, 0.24, 1] } }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        >
          <img src={asset(cur.src)} alt="" draggable="false" />
          {cur.title && <span className="caption">{cur.title}</span>}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
