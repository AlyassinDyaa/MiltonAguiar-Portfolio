import { useState } from 'react'
import { asset } from '../data/site'

/* One piece of art at comic-cover proportions. With a picture it shows the picture. Until a
   picture has been uploaded it shows a blank art board with the title pencilled in, so the site
   never has holes. `rough` is the earlier stage of a step-by-step pair. */
export default function Poster({ title, src, rough = false, eager = false, className = '' }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className={`poster ${rough ? 'is-rough' : ''} ${className}`}>
      {src ? (
        <img className={loaded ? undefined : 'pending'} src={asset(src)} alt={title} loading={eager ? 'eager' : 'lazy'} draggable="false" onLoad={() => setLoaded(true)} />
      ) : (
        <div className="poster-gen" role="img" aria-label={title}>
          <span className="poster-title">{title}</span>
        </div>
      )}
    </div>
  )
}
