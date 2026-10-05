import Runner from './Runner'
import Slides from './Slides'

/* The first page of every part of the site but the home page: a title panel the full width of
   the page, and standing in front of it at the right, whole and at a slight angle, a piece of
   art, the way the cover stands in front of the project panel on the home page. Whatever is
   passed inside (filters, a status) goes into the title panel under the words. `tone` makes the
   title panel white ("loud") or red. The art is one picture (`art`), or, given a list of pieces
   (`slides`), a deck that deals through the finished ones at random. */
export default function PageTitle({ label, title, lead, art, slides, tone = '', children }) {
  const deck = art ? [{ src: art }] : (slides || []).filter((p) => p.src)
  return (
    <header className="container title-page">
      <Runner label={label} page={1} />
      <div className={`tp ${deck.length ? 'has-art' : ''}`}>
        <div className={`hp tp-text ${tone ? `is-${tone}` : ''}`}>
          <div className="hp-in">
            <div className="words">
              <h1 className="display h-xl">{title}</h1>
              {lead && <p className="lead">{lead}</p>}
              {children}
            </div>
          </div>
        </div>
        {deck.length > 0 && <div className="tp-deck" aria-hidden="true"><Slides items={deck} /></div>}
      </div>
    </header>
  )
}
