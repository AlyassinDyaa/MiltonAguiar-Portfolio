import { Link } from 'react-router-dom'
import { about, asset, brand, events, shows, social, work } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Inked from '../components/Inked'
import SocialIcon from '../components/SocialIcon'
import PageTitle from '../components/PageTitle'
import Runner from '../components/Runner'

export default function About() {
  // the art on this page: the newest original piece leads it, and two more of different kinds sit under the text
  const lead = work.find((p) => p.src && /original/i.test(p.category || '')) || work.find((p) => p.src)
  const first = work.find((p) => p.src && p !== lead)
  const second = work.find((p) => p.src && p !== lead && p !== first && p.category !== first?.category)
  const art = [first, second].filter(Boolean)
  return (
    <Page title="About">
      <PageTitle label={brand.artist || brand.name} title={about.title} art={lead?.src} />

      <section className="spread">
        <div className="container">
          <Runner label="Who" page={2} />
          <div className="ab" data-art={art.length}>
            <Reveal className="hp ab-text">
              <div className="hp-in">
                <div className="words">
                  {about.paragraphs.map((p, i) => <p key={i} className={i === 0 ? 'lead' : 'dim'}>{p}</p>)}
                  <div className="actions">
                    {shows('pages', 'commissions') && <Link className="btn" to="/commissions">Commission a piece <span className="arrow">→</span></Link>}
                    {shows('pages', 'work') && <Link className="btn ghost" to="/work">See the work</Link>}
                  </div>
                </div>
              </div>
            </Reveal>
            {about.facts.length > 0 && (
              <Reveal className="hp is-loud ab-facts" delay={0.08}>
                <div className="hp-in">
                  <div className="words">
                    {/* set out like the file a comic keeps on one of its characters */}
                    <div className="file-head">
                      {brand.logo && <img src={asset(brand.logo)} alt="" width="36" height="36" />}
                      <span>Artist file</span>
                      <b>{brand.artist || brand.name}</b>
                    </div>
                    <dl className="facts">
                      {about.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
                    </dl>
                  </div>
                </div>
              </Reveal>
            )}
            {art.map((p, i) => (
              <Reveal className="hp ab-art" key={p.slug} delay={0.06 * i} aria-hidden="true">
                <div className="hp-in"><Inked src={p.src} /><span className="caption">{p.title}</span></div>
              </Reveal>
            ))}
            {(social.length > 0 || events.length > 0) && (
              <Reveal className="hp ab-links" delay={0.12}>
                <div className="hp-in">
                  <div className="words">
                    {social.length > 0 && (
                      <>
                        <div className="label">Online</div>
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
                      </>
                    )}
                    {events.length > 0 && (
                      <>
                        <div className="label" style={{ marginTop: social.length ? 26 : 0 }}>In person</div>
                        <ul className="events" style={{ width: '100%' }}>
                          {events.map((e) => (
                            <li key={e.slug}>
                              <a className="event" href={e.url || undefined} target={e.url ? '_blank' : undefined} rel="noreferrer">
                                <span className="event-when">{e.when}</span>
                                <span className="event-name">{e.name}</span>
                                <span className="event-where">{[e.role, e.place].filter(Boolean).join(' · ')}</span>
                                {e.url && <span className="arrow" aria-hidden="true">↗</span>}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </div>
              </Reveal>
            )}
          </div>
        </div>
      </section>
    </Page>
  )
}
