import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useReducedMotion } from '../hooks/useMedia'

/* A word set very large and in outline only, behind a heading. It slides sideways as the page
   scrolls past it. Decoration: hidden from screen readers. */
export default function Ghost({ children, className = '' }) {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const x = useTransform(scrollYProgress, [0, 1], ['6%', '-22%'])
  return (
    <span ref={ref} className={`ghost-word ${className}`} aria-hidden="true">
      <motion.span style={reduced ? undefined : { x }}>{children}</motion.span>
    </span>
  )
}
