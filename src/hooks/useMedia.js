import { useEffect, useState } from 'react'

export function useMedia(query) {
  const get = () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false)
  const [match, setMatch] = useState(get)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setMatch(m.matches)
    on()
    m.addEventListener('change', on)
    // some browsers only say so on a resize or a turned phone: ask again then too
    addEventListener('resize', on)
    addEventListener('orientationchange', on)
    return () => { m.removeEventListener('change', on); removeEventListener('resize', on); removeEventListener('orientationchange', on) }
  }, [query])
  return match
}

export const useReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)')
export const useFinePointer = () => useMedia('(pointer: fine)')
export const useDesktop = () => useMedia('(min-width: 900px)')
