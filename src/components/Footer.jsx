import { useState } from 'react'
import { Link } from 'react-router-dom'
import { asset, brand, commissions, footer, nav, shows, social } from '../data/site'
import SocialIcon from './SocialIcon'
import Wordmark from './Wordmark'
import Runner from './Runner'
import QuoteLink from './QuoteLink'

/* The last page of the comic. It ends the way an issue does, on one wide red panel with the
   closing line and what to do next; under it, who this is, the pages, and where else to find him. */
export default function Footer() {
  const [year] = useState(() => new Date().getFullYear()) // read on every visit, so the © line rolls over by itself on 1 January
  const hire = shows('pages', 'commissions')
  return (
    <footer className="footer">
      <div className="container">
        <Runner label="Last page" />
        <div className="ft">
          <div className="hp is-red ft-end">
            <div className="hp-in">
              <div className="words">
                {footer.line && <p className="ft-line">{footer.line}</p>}
                <div className="actions">
                  {hire && <QuoteLink>{commissions.open ? 'Commission a piece' : 'Ask about commissions'}</QuoteLink>}
                  {hire && <Link className="btn ghost" to="/commissions">How it works <span className="arrow">→</span></Link>}
                </div>
              </div>
            </div>
          </div>
          <div className="hp ft-brand">
            <div className="hp-in">
              <div className="words">
                <Link to="/" className="ft-mark" aria-label={`${brand.name} home`}>
                  {brand.logo && <img src={asset(brand.logo)} alt="" width="54" height="54" />}
                  <Wordmark className="lg" />
                </Link>
                <p className="dim">{brand.blurb}</p>
                {brand.email && <a className="mail" href={`mailto:${brand.email}`}>{brand.email}</a>}
              </div>
            </div>
          </div>
          <div className="hp ft-pages">
            <div className="hp-in">
              <div className="words">
                <div className="label">Pages</div>
                <ul className="ft-list">
                  {nav.map((n, i) => <li key={n.to}><Link to={n.to}><i aria-hidden="true">{String(i + 1).padStart(2, '0')}</i>{n.label}</Link></li>)}
                </ul>
              </div>
            </div>
          </div>
          {social.length > 0 && (
            <div className="hp ft-follow">
              <div className="hp-in">
                <div className="words">
                  <div className="label">Find me</div>
                  <ul className="social">
                    {social.map((s) => (
                      <li key={s.label + s.url}>
                        <a href={s.url} target="_blank" rel="noreferrer">
                          <SocialIcon name={s.label} />
                          <span><strong>{s.label}</strong>{s.handle && <small>{s.handle}</small>}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="footer-fine">
          <span>© {year} {brand.artist || brand.name}. {footer.fine}</span>
          {brand.location && <span>{brand.location}</span>}
        </div>
      </div>
    </footer>
  )
}
