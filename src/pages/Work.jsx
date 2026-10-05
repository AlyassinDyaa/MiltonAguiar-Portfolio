import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { categories, day, heroPanels, home, pages, redraws, work } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Poster from '../components/Poster'
import Compare from '../components/Compare'
import Lightbox from '../components/Lightbox'
import PageTitle from '../components/PageTitle'
import Runner from '../components/Runner'

export default function Work() {
  const [filter, setFilter] = useState('All')
  const [sel, setSel] = useState(null)
  const shown = useMemo(() => (filter === 'All' ? work : work.filter((p) => p.category === filter)), [filter])
  const count = (c) => (c === 'All' ? work.length : work.filter((p) => p.category === c).length)
  const choose = (c) => { setSel(null); setFilter(c) }
  return (
    <Page title="Work">
      <PageTitle label={pages.work.label} title={pages.work.title} lead={pages.work.intro} art={(heroPanels[1] || work[0])?.src}>
        {categories.length > 1 && (
          <div className="filters" role="group" aria-label="Show">
            {['All', ...categories].map((c) => (
              <button key={c} type="button" className={`chip ${filter === c ? 'on' : ''}`} aria-pressed={filter === c} onClick={() => choose(c)}>
                {c}<small>{count(c)}</small>
              </button>
            ))}
          </div>
        )}
      </PageTitle>

      <section className="spread">
        <div className="container">
          <Runner label={filter === 'All' ? 'Every piece' : filter} page={2} />
          <motion.ul className="grid" layout>
            <AnimatePresence mode="popLayout" initial={false}>
              {shown.map((p, i) => (
                <motion.li key={p.slug} layout initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
                  <button type="button" className="hp tile" onClick={() => setSel(i)} aria-label={`Open ${p.title}`}>
                    <span className="hp-in">
                      <Poster title={p.title} src={p.src} eager={i < 4} />
                      <span className="caption"><strong>{p.title}</strong><small>{[p.category, day(p.date)].filter(Boolean).join(' · ')}</small></span>
                    </span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        </div>
      </section>

      {redraws.length > 0 && filter === 'All' && (
        <section className="spread">
          <div className="container">
            <Runner label={home.redrawLabel} page={3} />
            <div className="spread-head"><h2 className="display h-lg">{home.redrawTitle}</h2></div>
            <div className="compare-grid">
              {redraws.map((r, i) => <Reveal key={r.slug} delay={i * 0.1}><Compare set={r} /></Reveal>)}
            </div>
          </div>
        </section>
      )}

      <Lightbox items={shown} sel={sel} setSel={setSel} />
    </Page>
  )
}
