import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { asset, brand, commissions, day, events, fresh, hero, heroPanels, home, marquee, nameParts, project, quote, redraws, shop, shows, work } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Magnetic from '../components/Magnetic'
import Marquee from '../components/Marquee'
import Compare from '../components/Compare'
import ScrollRow from '../components/ScrollRow'
import Lightbox from '../components/Lightbox'
import Inked from '../components/Inked'
import Runner from '../components/Runner'
import QuoteLink, { QuoteGo, quoteSign } from '../components/QuoteLink'
import { useFinePointer, useReducedMotion } from '../hooks/useMedia'

const EASE = [0.16, 1, 0.3, 1]

/* The whole home page is a comic, one page of panels after another, and this is page one. Its
   first panel is the title panel: the name, set like a masthead, with a drawing beside it (the
   admin picks the drawing: a cut-out stands in the panel, any other picture is laid in it as a
   sheet of art board). The panels beside it are the first four pieces ticked "Show on the home
   page", and each one opens when it is clicked.
   With a mouse, the drawing and the pictures inside their frames drift a little against each
   other as the pointer moves, the way near and far things do. Without one, or with reduced
   motion, everything holds still. */
/* One of the buttons under the name, as set in the admin (Home page → Buttons): its words, where it
   goes and its style. A button to a page that is switched off, or to the Shop while it is off,
   or to an address that is not a web address, is left out. */
const PAGE_OF = { shop: '/shop', work: '/work', commissions: '/commissions', about: '/about', contact: '/contact', gallery: '/gallery' }
function HeroButton({ b }) {
  const cls = `btn ${b.tone === 'quiet' ? 'ghost' : ''}`
  if (b.to === 'quote') return <Magnetic><QuoteLink className={cls}>{b.words}</QuoteLink></Magnetic>
  if (b.to === 'link') {
    const url = String(b.address || '').trim()
    return /^https?:\/\//i.test(url) ? <Magnetic><a className={cls} href={url} target="_blank" rel="noreferrer">{b.words} <span className="arrow">↗</span></a></Magnetic> : null
  }
  const path = PAGE_OF[b.to]
  const on = b.to === 'shop' ? shop.enabled && shows('pages', 'shop') : shows('pages', b.to)
  return path && on ? <Magnetic><Link className={cls} to={path}>{b.words} <span className="arrow">→</span></Link></Magnetic> : null
}

function Hero({ onOpen }) {
  const ref = useRef(null)
  const [a, b] = nameParts(brand.name)
  const figure = hero.figure?.src ? hero.figure : null
  const fine = useFinePointer(), reduced = useReducedMotion()
  const live = fine && !reduced
  const mx = useMotionValue(0), my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 70, damping: 18 }), sy = useSpring(my, { stiffness: 70, damping: 18 })
  const figX = useTransform(sx, [-1, 1], [-12, 12]), figY = useTransform(sy, [-1, 1], [-7, 7])
  const artX = useTransform(sx, [-1, 1], [9, -9]), artY = useTransform(sy, [-1, 1], [7, -7])
  const move = (e) => {
    if (!live) return
    const r = ref.current.getBoundingClientRect()
    mx.set(((e.clientX - r.left) / r.width) * 2 - 1); my.set(((e.clientY - r.top) / r.height) * 2 - 1)
  }
  const rest = () => { mx.set(0); my.set(0) }
  // Is the drawing a cut-out? One with a see-through corner is; the look of it follows from that.
  const [cutout, setCutout] = useState(false)
  const look = (e) => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 8
      const pen = canvas.getContext('2d')
      pen.drawImage(e.currentTarget, 0, 0, 8, 8)
      const px = pen.getImageData(0, 0, 8, 8).data
      setCutout([3, 31, 227, 255].some((corner) => px[corner] < 128))
    } catch { /* a picture the page may not read: treated as a sheet */ }
  }
  const num = (v, fallback) => (v === '' || v == null || Number.isNaN(Number(v)) ? fallback : Number(v))
  const rise = (delay) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.8, ease: EASE } })
  const [year] = useState(() => new Date().getFullYear())
  return (
    <section ref={ref} className="hero" onMouseMove={move} onMouseLeave={rest}>
      <div className="container hero-in">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.0, duration: 0.8 }}>
          <Runner label={`${brand.artist || brand.name} · Portfolio ${year}`} page={1} />
        </motion.div>
        <div className="hero-page" data-panels={heroPanels.length}>
          <motion.div className="hp hp-title" {...rise(1.0)}>
            <div className={`hp-in ${figure ? 'has-figure' : ''} ${figure && cutout ? 'has-cutout' : ''}`}>
              {figure && cutout && <span className="hero-rays" aria-hidden="true" />}
              {figure && (
                <motion.img
                  className={`hero-figure ${cutout ? 'is-cutout' : 'is-sheet'}`} src={asset(figure.src)} alt="" aria-hidden="true" draggable="false" onLoad={look}
                  style={{ x: figX, y: figY, '--fig-size': num(figure.size, 100) / 100, '--fig-x': num(figure.x, 0), '--fig-y': num(figure.y, 0) }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3, duration: 1 }}
                />
              )}
              <div className="hero-copy">
                {hero.kicker && <motion.div className="label accent" {...rise(1.1)}>{hero.kicker}</motion.div>}
                <h1 className="hero-name" aria-label={brand.name}>
                  <span className="hero-line"><motion.span initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ delay: 1.05, duration: 0.9, ease: EASE }}>{a}</motion.span></span>
                  {b && <span className="hero-line is-accent"><motion.span initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ delay: 1.15, duration: 0.9, ease: EASE }}>{b}</motion.span></span>}
                </h1>
                <motion.p className="hero-tag" {...rise(1.35)}>{brand.tagline}</motion.p>
                <motion.p className="lead" {...rise(1.45)}>{hero.text}</motion.p>
                <motion.div className="hero-actions" {...rise(1.55)}>
                  {hero.buttons.map((b, i) => <HeroButton key={`${b.to}-${i}`} b={b} />)}
                </motion.div>
              </div>
            </div>
          </motion.div>
          {heroPanels.map((p, i) => (
            <motion.button
              key={p.slug} type="button" className={`hp hp-${i + 1}`} aria-label={`Open ${p.title}`} onClick={() => onOpen(work.indexOf(p))}
              initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 + i * 0.09, duration: 0.8, ease: EASE }}
            >
              <span className="hp-in">
                <motion.img src={asset(p.src)} alt="" draggable="false" style={{ x: artX, y: artY }} />
                <span className="caption">{p.title}</span>
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  )
}

/* The comic or series on the drawing board now, as one wide splash panel: its own cover blown
   up behind the words and washed in the brand colour, the title very large, and the cover
   itself standing at the right, breaking out of the panel top and bottom the way a figure
   breaks a panel border. Two buttons: where to read it, and one more (the publisher's site). */
function Project({ page }) {
  const { label, title, subtitle, text, image, url, buttonLabel, secondLabel, secondUrl } = project
  const name = `${title}${subtitle ? `: ${subtitle}` : ''}`
  return (
    <section className="spread">
      <div className="container">
        <Runner label={label} page={page} />
        <div className={`pj ${image ? 'has-cover' : ''}`}>
          <Reveal className="hp pj-splash">
            <div className="hp-in">
              {image && <span className="pj-bg" style={{ backgroundImage: `url("${asset(image)}")` }} aria-hidden="true" />}
              <div className="words">
                <h2 className="display pj-title">{title}{subtitle && <small>{subtitle}</small>}</h2>
                {text && <p className="lead">{text}</p>}
                <div className="actions">
                  {url && <Magnetic><a className="btn" href={url} target="_blank" rel="noreferrer">{buttonLabel} <span className="arrow">↗</span></a></Magnetic>}
                  {secondUrl && <Magnetic><a className="btn ghost" href={secondUrl} target="_blank" rel="noreferrer">{secondLabel || 'More about it'} <span className="arrow">↗</span></a></Magnetic>}
                </div>
              </div>
            </div>
          </Reveal>
          {image && (
            <Reveal className="pj-cover" delay={0.12}>
              {url
                ? <a className="pj-book" href={url} target="_blank" rel="noreferrer" aria-label={`${name}: ${buttonLabel}`}><Inked src={image} alt={name} /></a>
                : <span className="pj-book"><Inked src={image} alt={name} /></span>}
            </Reveal>
          )}
        </div>
      </div>
    </section>
  )
}

/* The newest pieces that are not already up beside the name, as a page of panels cut by slanted
   gutters. The first panel is the page's title. Each piece arrives in pencil grey and is
   coloured as it scrolls into view; a panel opens the piece. */
function Latest({ page, onOpen }) {
  return (
    <section className="spread">
      <div className="container">
        <Runner label={home.latestLabel} page={page} />
        <ol className="pg">
          <Reveal as="li" className="pg-title" y={24}>
            <div className="hp is-loud">
              <div className="hp-in">
                <div className="words">
                  <h2 className="display h-lg">{home.latestTitle}</h2>
                  {shows('pages', 'work') && <Link className="btn" to="/work">All {work.length} pieces <span className="arrow">→</span></Link>}
                </div>
              </div>
            </div>
          </Reveal>
          {fresh.map((p, i) => (
            <Reveal as="li" key={p.slug} delay={((i + 1) % 3) * 0.08} y={24}>
              <button type="button" className="hp" onClick={() => onOpen(work.indexOf(p))} aria-label={`Open ${p.title}`}>
                <span className="hp-in">
                  {p.src
                    ? <Inked src={p.src} />
                    : <span className="poster-gen"><span className="poster-title">{p.title}</span></span>}
                  <span className="pg-no" aria-hidden="true">{i + 1}</span>
                  <span className="caption"><strong>{p.title}</strong><small>{[p.category, day(p.date, true)].filter(Boolean).join(' · ')}</small></span>
                </span>
              </button>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* Commissions, shouted the way the artist announces them, in a red panel. Each offer is a panel
   of its own beside it, and a link to where quotes are given (his Instagram). */
function Hire({ page }) {
  const { open, intro, tiers } = commissions
  return (
    <section className="spread">
      <div className="container">
        <Runner label="Commissions" page={page} />
        <div className="cm">
          <Reveal className="hp is-red cm-text">
            <div className="hp-in">
              <div className="words">
                <h2 className="shout">
                  <span>{home.commissionsTitle}</span>
                  <b className={open ? 'is-open' : ''}>{open ? 'Open!' : 'Closed'}</b>
                </h2>
                <p className="lead">{intro}</p>
                <div className="actions">
                  <Magnetic><Link className="btn" to="/commissions">{home.commissionsButton} <span className="arrow">→</span></Link></Magnetic>
                  {!quote.closed && <Magnetic><QuoteLink className="btn ghost">{quote.label}</QuoteLink></Magnetic>}
                </div>
              </div>
            </div>
          </Reveal>
          {tiers.length > 0 && (
            <ul className="offers">
              {tiers.map((t, i) => {
                // the offer's price (or the quote button's words), or, closed, that it is closed for now
                const inside = <span className="hp-in"><strong>{t.name}</strong><span>{t.text}</span><em>{quote.closed ? 'Closed for now' : t.price || quote.label} <i aria-hidden="true">{quoteSign()}</i></em></span>
                return (
                  <Reveal as="li" className="cell" key={t.name} delay={0.06 + i * 0.06} y={20}>
                    <QuoteGo className="hp is-loud offer" tier={t.name}>{inside}</QuoteGo>
                  </Reveal>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  const [sel, setSel] = useState(null)
  // the pages after the first are numbered as they come, so a part that is switched off leaves no gap
  let n = 1
  return (
    <Page>
      <Hero onOpen={setSel} />
      {shows('home', 'ticker') && <Marquee items={marquee} />}

      {shows('home', 'project') && project.title && <Project page={++n} />}

      {shows('home', 'latest') && fresh.length > 0 && <Latest page={++n} onOpen={setSel} />}

      {/* Step by step */}
      {shows('home', 'redraws') && redraws.length > 0 && (
        <section className="spread">
          <div className="container">
            <Runner label={home.redrawLabel} page={++n} />
            <div className="spread-head">
              <h2 className="display h-lg">{home.redrawTitle}</h2>
              {home.redrawText && <p className="dim">{home.redrawText}</p>}
            </div>
            {/* a row to scroll through, however many sets there are */}
            <ScrollRow className="compare-row" label="Pencils to colours, one piece at each stage">
              {redraws.map((r, i) => <Reveal key={r.slug} delay={Math.min(i, 3) * 0.1} className="compare-slot"><Compare set={r} /></Reveal>)}
            </ScrollRow>
          </div>
        </section>
      )}

      {shows('home', 'commissions') && shows('pages', 'commissions') && <Hire page={++n} />}

      {/* Conventions */}
      {shows('home', 'events') && events.length > 0 && (
        <section className="spread">
          <div className="container">
            <Runner label={home.eventsLabel} page={++n} />
            <Reveal className="hp ev">
              <div className="hp-in">
                <div className="words">
                  <h2 className="display h-lg">{home.eventsTitle}</h2>
                  <ul className="events">
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
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      <Lightbox items={work} sel={sel} setSel={setSel} />
    </Page>
  )
}
