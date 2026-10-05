import Runner from './Runner'
import Inked from './Inked'

/* The first page of every part of the site but the home page, built the way the home page's is:
   a title panel, and beside it, across a slanted gutter, a panel of art. Whatever is passed
   inside (filters, a status) goes into the title panel under the words. */
export default function PageTitle({ label, title, lead, art, children }) {
  return (
    <header className="container title-page">
      <Runner label={label} page={1} />
      <div className={`tp ${art ? 'has-art' : ''}`}>
        <div className="hp tp-text">
          <div className="hp-in">
            <div className="words">
              <h1 className="display h-xl">{title}</h1>
              {lead && <p className="lead">{lead}</p>}
              {children}
            </div>
          </div>
        </div>
        {art && (
          <div className="hp tp-art" aria-hidden="true">
            <div className="hp-in"><Inked src={art} eager /></div>
          </div>
        )}
      </div>
    </header>
  )
}
