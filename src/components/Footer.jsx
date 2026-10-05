import { useState } from 'react'
import { Link } from 'react-router-dom'
import { brand, footer, nav, social } from '../data/site'
import SocialIcon from './SocialIcon'
import Wordmark from './Wordmark'
import Runner from './Runner'

/* The last page of the comic: the name and what the site is, the pages, where else to find the
   artist, and the red caption that closes an issue. */
export default function Footer() {
  const [year] = useState(() => new Date().getFullYear()) // read on every visit, so the © line rolls over by itself on 1 January
  return (
    <footer className="footer">
      <div className="container">
        <Runner label="Last page" />
        <div className="ft">
          <div className="hp ft-main">
            <div className="hp-in">
              <div className="words">
                <Wordmark className="lg" />
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
                  {nav.map((n) => <li key={n.to}><Link to={n.to}>{n.label}</Link></li>)}
                </ul>
              </div>
            </div>
          </div>
          <div className="hp is-red ft-end" aria-hidden={footer.line ? undefined : 'true'}>
            <div className="hp-in">
              <div className="words">{footer.line && <span>{footer.line}</span>}</div>
            </div>
          </div>
          {social.length > 0 && (
            <div className="hp ft-social">
              <div className="hp-in">
                <div className="words">
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
