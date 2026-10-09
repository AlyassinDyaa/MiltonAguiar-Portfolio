/* A small 3D comic book: the cover in front, a page edge down its side and a back behind it.
   Flat at rest, it turns to show its thickness when pointed at (components.css). A finger cannot
   point, so `turned` holds it turned (ComicShelf.jsx does that on a first tap).
   Ported from the Imagine Action site, drawn here in Milton's square-cornered ink. */
export default function Book({ children, turned = false, className = '' }) {
  return (
    <div className={`book ${turned ? 'is-turned' : ''} ${className}`} onDragStart={(e) => e.preventDefault()}>
      <div className="book-body">
        <div className="book-front">{children}</div>
      </div>
    </div>
  )
}
