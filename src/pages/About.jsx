import { useState } from 'react'
import { Link } from 'react-router-dom'
import { about, asset, brand, day, shows, social, work } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Inked from '../components/Inked'
import Poster from '../components/Poster'
import Lightbox from '../components/Lightbox'
import SocialIcon from '../components/SocialIcon'
import PageTitle from '../components/PageTitle'
import Runner from '../components/Runner'

/* The colour of each story panel's words, in turn, so the page reads as a sequence. */
const TONES = ['is-loud', 'is-red', '']

/* The About page is the artist's origin story, told the way a comic tells one: a title page,
   then the story a panel at a time (a picture and the words beside it, swapping sides as it
   goes), then his file, where to find him, and the books he has drawn for other people. */
export default function About() {
  const [sel, setSel] = useState(null)
  // work done for others: the covers and the collaborations
  const credits = work.filter((p) => /cover|collab/i.test(p.category || ''))
  let n = 1
  return (
    <Page title="About">
      <PageTitle tone="red" label={brand.artist || brand.name} title={about.title} lead={about.intro} art={about.image} slides={work}>
        <div className="actions">
          {shows('pages', 'commissions') && <Link className="btn" to="/commissions">Commission a piece <span className="arrow">→</span></Link>}
          {shows('pages', 'work') && <Link className="btn ghost" to="/work">See the work</Link>}
        </div>
      </PageTitle>

      {about.story.length > 0 && (
        <section className="spread">
          <div className="container">
            <Runner label="Origin story" page={++n} />
            <ol className="story">
              {about.story.map((s, i) => (
                <Reveal as="li" key={i} className={`story-row ${s.image ? 'has-art' : ''} ${i % 2 ? 'is-flipped' : ''}`} y={28}>
                  {s.image && (
                    <div className="hp story-art" aria-hidden="true">
                      <div className="hp-in"><Inked src={s.image} /></div>
                    </div>
                  )}
                  <div className={`hp story-text ${TONES[i % TONES.length]}`}>
                    <div className="hp-in">
                      <div className="words">
                        <span className="story-no" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                        {s.title && <h2 className="display h-lg">{s.title}</h2>}
                        <p className="lead">{s.text}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>
      )}

      {(about.facts.length > 0 || social.length > 0) && (
        <section className="spread">
          <div className="container">
            <Runner label="The file" page={++n} />
            <div className="ab">
              {about.facts.length > 0 && (
                <Reveal className="hp is-loud ab-facts">
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
              {social.length > 0 && (
                <Reveal className="hp ab-links" delay={0.08}>
                  <div className="hp-in">
                    <div className="words">
                      <h2 className="display h-md">Find me</h2>
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
                </Reveal>
              )}
            </div>
          </div>
        </section>
      )}

      {credits.length > 0 && (
        <section className="spread">
          <div className="container">
            <Runner label="Covers and collaborations" page={++n} />
            <ul className="grid">
              {credits.map((p, i) => (
                <Reveal as="li" key={p.slug} delay={Math.min(i, 6) * 0.05} y={20}>
                  <button type="button" className="hp tile" onClick={() => setSel(i)} aria-label={`Open ${p.title}`}>
                    <span className="hp-in">
                      <Poster title={p.title} src={p.src} />
                      <span className="caption"><strong>{p.title}</strong><small>{[p.category, day(p.date)].filter(Boolean).join(' · ')}</small></span>
                    </span>
                  </button>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      )}

      <Lightbox items={credits} sel={sel} setSel={setSel} />
    </Page>
  )
}
