import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { asset, brand, commissions, day, events, galleryHome, hero, home, latest, marquee, nameParts, project, quote, redraws, shows, work } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Magnetic from '../components/Magnetic'
import Marquee from '../components/Marquee'
import Compare from '../components/Compare'
import GalleryGrid from '../components/GalleryGrid'
import ViewSwitch from '../components/ViewSwitch'
import Lightbox from '../components/Lightbox'
import Inked from '../components/Inked'
import Tilt from '../components/Tilt'
import Ghost from '../components/Ghost'
import { useFinePointer, useReducedMotion } from '../hooks/useMedia'
import { useGalleryView } from '../hooks/useGalleryView'

const EASE = [0.16, 1, 0.3, 1]

/* The top of the home page is laid out as a comic page. The first panel is the title panel: the
   name, set like a masthead, with a drawing beside it (the admin picks the drawing: a cut-out
   stands in the panel, any other picture is laid in it as a sheet of art board). The panels beside it are the
   pieces ticked "Show on the home page", and each one opens when it is clicked.
   With a mouse, the drawing and the pictures inside their frames drift a little against each
   other as the pointer moves, the way near and far things do. Without one, or with reduced
   motion, everything holds still. */
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
  // the side panels: the pieces picked for the home page, then the rest, leaving out the drawing already standing in the title panel
  const panels = [...latest, ...work.filter((p) => !latest.includes(p))].filter((p) => p.src && p.src !== figure?.src).slice(0, 4)
  const [year] = useState(() => new Date().getFullYear())
  return (
    <section ref={ref} className="hero" onMouseMove={move} onMouseLeave={rest}>
      <div className="container hero-in">
        {/* the line of boxes printed across the top of a comic art board */}
        <motion.div className="board-head" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.0, duration: 0.8 }}>
          <span><b>Book</b>{brand.artist || brand.name}</span>
          <span><b>Issue</b>Portfolio {year}</span>
          <span><b>Page</b>01</span>
        </motion.div>
        <div className="hero-page" data-panels={panels.length}>
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
                  {shows('pages', 'work') && <Magnetic><Link className="btn" to="/work">{hero.primaryLabel} <span className="arrow">→</span></Link></Magnetic>}
                  {shows('pages', 'commissions') && <Magnetic><Link className="btn ghost" to="/commissions">{hero.secondaryLabel}</Link></Magnetic>}
                </motion.div>
              </div>
            </div>
          </motion.div>
          {panels.map((p, i) => (
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

/* What is on the drawing board now: the comic or series in progress. Its cover stands in front of
   itself: the same picture, blown up, drained and washed in the brand colour, fills the block
   behind it, with the title in giant outline sliding across as the page scrolls. The cover leans
   toward the pointer. */
function Project() {
  const { label, title, subtitle, text, image, url, buttonLabel } = project
  const cover = image && <img src={asset(image)} alt={`${title}${subtitle ? `: ${subtitle}` : ''}`} loading="lazy" draggable="false" />
  return (
    <section className="project">
      {image && <div className="project-bg" style={{ backgroundImage: `url("${asset(image)}")` }} aria-hidden="true" />}
      <Ghost className="project-ghost">{title}</Ghost>
      <div className="container project-in">
        {cover && (
          <Reveal className="project-art">
            <Tilt>
              {url ? <a className="dots" href={url} target="_blank" rel="noreferrer">{cover}</a> : <span className="dots">{cover}</span>}
            </Tilt>
          </Reveal>
        )}
        <Reveal className="project-copy" delay={0.1}>
          {label && <div className="label accent">{label}</div>}
          <h2 className="display h-xl">{title}{subtitle && <small>{subtitle}</small>}</h2>
          {text && <p className="lead">{text}</p>}
          {url && <Magnetic><a className="btn" href={url} target="_blank" rel="noreferrer">{buttonLabel} <span className="arrow">↗</span></a></Magnetic>}
        </Reveal>
      </div>
    </section>
  )
}

/* The newest pieces, set out as the panels of a comic page: two tiers, cut by slanted gutters,
   numbered, each with its title in a caption box. Each panel arrives in pencil grey and is
   coloured as it scrolls into view. A panel opens the piece. */
function Latest({ onOpen }) {
  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <div><div className="label accent">{home.latestLabel}</div><h2 className="display h-lg">{home.latestTitle}</h2></div>
          {shows('pages', 'work') && <Link className="btn ghost sm" to="/work">All {work.length} pieces <span className="arrow">→</span></Link>}
        </div>
        <ol className="pg">
          {latest.map((p, i) => (
            <Reveal as="li" key={p.slug} delay={(i % 3) * 0.08} y={24}>
              <button type="button" className="pg-panel" onClick={() => onOpen(work.indexOf(p))} aria-label={`Open ${p.title}`}>
                <span className="pg-in">
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

/* Commissions, shouted the way the artist announces them: a red splash panel with the offers
   hanging beside it as price tags. A tag goes to his Instagram, where quotes are given. */
function Hire() {
  const { open, intro, tiers } = commissions
  return (
    <section className="section">
      <div className="container">
        <Reveal className="hire dots">
          <div className="hire-in">
            <div className="hire-copy">
              <h2 className="hire-shout">
                <span>{home.commissionsTitle}</span>
                <b className={open ? 'is-open' : ''}>{open ? 'Open!' : 'Closed'}</b>
              </h2>
              <p className="lead">{intro}</p>
              <div className="hero-actions">
                <Magnetic><Link className="btn" to="/commissions">{home.commissionsButton} <span className="arrow">→</span></Link></Magnetic>
                {quote.url && <Magnetic><a className="btn ghost" href={quote.url} target="_blank" rel="noreferrer">{quote.label} <span className="arrow">↗</span></a></Magnetic>}
              </div>
            </div>
            {tiers.length > 0 && (
              <ul className="tags">
                {tiers.map((t) => (
                  <li key={t.name}>
                    <a className="tag" href={quote.url || undefined} target="_blank" rel="noreferrer">
                      <strong>{t.name}</strong>
                      <span>{t.text}</span>
                      <em>{t.price || quote.label} <i aria-hidden="true">↗</i></em>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export default function Home() {
  const [sel, setSel] = useState(null)
  const [view, setView] = useGalleryView()
  return (
    <Page>
      <Hero onOpen={setSel} />
      {shows('home', 'ticker') && <Marquee items={marquee} />}

      {shows('home', 'project') && project.title && <Project />}

      {shows('home', 'latest') && latest.length > 0 && <Latest onOpen={setSel} />}

      {/* Gallery */}
      {shows('home', 'gallery') && galleryHome.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-head">
              <div><div className="label accent">{home.galleryLabel}</div><h2 className="display h-lg">{home.galleryTitle}</h2></div>
              <div className="section-tools">
                <ViewSwitch view={view} onChange={setView} />
                {shows('pages', 'gallery') && <Link className="btn ghost sm" to="/gallery">Full gallery <span className="arrow">→</span></Link>}
              </div>
            </div>
            <GalleryGrid items={galleryHome} view={view} />
          </div>
        </section>
      )}

      {/* Step by step */}
      {shows('home', 'redraws') && redraws.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-head">
              <div><div className="label accent">{home.redrawLabel}</div><h2 className="display h-lg">{home.redrawTitle}</h2></div>
              {home.redrawText && <p className="dim section-note">{home.redrawText}</p>}
            </div>
            <div className="compare-grid">
              {redraws.map((r, i) => <Reveal key={r.slug} delay={i * 0.1}><Compare set={r} /></Reveal>)}
            </div>
          </div>
        </section>
      )}

      {shows('home', 'commissions') && shows('pages', 'commissions') && <Hire />}

      {/* Conventions */}
      {shows('home', 'events') && events.length > 0 && (
        <section className="section tight">
          <div className="container">
            <div className="section-head">
              <div><div className="label accent">{home.eventsLabel}</div><h2 className="display h-lg">{home.eventsTitle}</h2></div>
            </div>
            <ul className="events">
              {events.map((e, i) => (
                <Reveal as="li" key={e.slug} delay={i * 0.06} y={20}>
                  <a className="event" href={e.url || undefined} target={e.url ? '_blank' : undefined} rel="noreferrer">
                    <span className="event-when">{e.when}</span>
                    <span className="event-name">{e.name}</span>
                    <span className="event-where">{[e.role, e.place].filter(Boolean).join(' · ')}</span>
                    {e.url && <span className="arrow" aria-hidden="true">↗</span>}
                  </a>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      )}

      <Lightbox items={work} sel={sel} setSel={setSel} />
    </Page>
  )
}
