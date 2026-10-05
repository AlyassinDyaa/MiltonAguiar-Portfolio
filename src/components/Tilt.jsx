import { useRef } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'
import { useFinePointer, useReducedMotion } from '../hooks/useMedia'

/* Leans its child toward the pointer, the way a comic held in the hand catches the light. */
export default function Tilt({ children, className = '', max = 9 }) {
  const ref = useRef(null)
  const fine = useFinePointer(), reduced = useReducedMotion()
  const rx = useMotionValue(0), ry = useMotionValue(0)
  const sx = useSpring(rx, { stiffness: 140, damping: 14 }), sy = useSpring(ry, { stiffness: 140, damping: 14 })
  const move = (e) => {
    if (!fine || reduced) return
    const r = ref.current.getBoundingClientRect()
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 2 * max)
    rx.set(((e.clientY - r.top) / r.height - 0.5) * -2 * max)
  }
  const rest = () => { rx.set(0); ry.set(0) }
  return (
    <motion.div ref={ref} className={`tilt ${className}`} style={{ rotateX: sx, rotateY: sy, transformPerspective: 900 }} onMouseMove={move} onMouseLeave={rest}>
      {children}
    </motion.div>
  )
}
