import Inked from './Inked'

/* One piece of art at comic-cover proportions. With a picture it shows the picture. Until a
   picture has been uploaded it shows a blank art board with the title pencilled in, so the site
   never has holes. `rough` is the earlier stage of a step-by-step pair. */
export default function Poster({ title, src, rough = false, eager = false, className = '' }) {
  return (
    <div className={`poster ${rough ? 'is-rough' : ''} ${className}`}>
      {src ? (
        <Inked src={src} alt={title} eager={eager} />
      ) : (
        <div className="poster-gen" role="img" aria-label={title}>
          <span className="poster-title">{title}</span>
        </div>
      )}
    </div>
  )
}
