import Runner from './Runner'
import Inked from './Inked'
import Slides from './Slides'

/* The first page of every part of the site but the home page, built the way the home page's is:
   a title panel, and beside it, across a slanted gutter, a panel of art. Whatever is passed
   inside (filters, a status) goes into the title panel under the words. `tone` makes the title
   panel white ("loud") or red. The art is one picture (`art`), or, given a list of pieces
   (`slides`), a panel that goes through them at random. */
export default function PageTitle({ label, title, lead, art, slides, tone = '', children }) {
  const many = !art && slides?.some((p) => p.src)
  return (
    <header className="container title-page">
      <Runner label={label} page={1} />
      <div className={`tp ${art || many ? 'has-art' : ''}`}>
        <div className={`hp tp-text ${tone ? `is-${tone}` : ''}`}>
          <div className="hp-in">
            <div className="words">
              <h1 className="display h-xl">{title}</h1>
              {lead && <p className="lead">{lead}</p>}
              {children}
            </div>
          </div>
        </div>
        {(art || many) && (
          <div className="hp tp-art" aria-hidden="true">
            <div className="hp-in">{art ? <Inked src={art} eager /> : <Slides items={slides} />}</div>
          </div>
        )}
      </div>
    </header>
  )
}
