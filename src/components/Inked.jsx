import { useRef, useState } from 'react'
import { useInView } from 'framer-motion'
import { asset } from '../data/site'

/* A picture that arrives the way a page is made. It is first seen in grey, like pencils; once it
   has scrolled into view a line crosses it and the colour comes in behind the line.
   The grey is a filter on a sheet laid over the picture, so the picture is only loaded once. */
export default function Inked({ src, alt = '', eager = false }) {
  const ref = useRef(null)
  const seen = useInView(ref, { once: true, margin: '-12% 0px' })
  const [loaded, setLoaded] = useState(false)
  return (
    <span ref={ref} className={`inked ${seen && loaded ? 'is-in' : ''}`}>
      <img className={loaded ? undefined : 'pending'} src={asset(src)} alt={alt} loading={eager ? 'eager' : 'lazy'} draggable="false" onLoad={() => setLoaded(true)} />
      <span className="inked-pencil" aria-hidden="true" />
    </span>
  )
}
