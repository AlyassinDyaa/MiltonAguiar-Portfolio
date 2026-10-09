import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { catOf, categories, comics, day, home, pages, redraws, work } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Poster from '../components/Poster'
import Compare from '../components/Compare'
import ScrollRow from '../components/ScrollRow'
import Lightbox from '../components/Lightbox'
import PageTitle from '../components/PageTitle'
import Runner from '../components/Runner'
import ShopTags from '../components/ShopTags'
import ComicShelf from '../components/ComicShelf'
import Pager, { usePaged } from '../components/Pager'

export default function Work() {
  const [filter, setFilter] = useState('All')
  const [sel, setSel] = useState(null)
  const shown = useMemo(() => (filter === 'All' ? work : work.filter((p) => p.category === filter)), [filter])
  const count = (c) => (c === 'All' ? work.length : work.filter((p) => p.category === c).length)
  const choose = (c) => { setSel(null); setFilter(c) }
  const paged = usePaged(shown, 'work', filter) // a page at a time: 10 to 50, as the visitor picks
  return (
    <Page title="Work">
      <PageTitle label={pages.work.label} title={pages.work.title} lead={pages.work.intro} slides={work}>
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
          <motion.ul ref={paged.top} className="grid" layout>
            <AnimatePresence mode="popLayout" initial={false}>
              {paged.rows.map((p, n) => { const i = paged.from + n; return (
                <motion.li key={p.slug} layout initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
                  <button type="button" className="hp tile" onClick={() => setSel(i)} aria-label={`Open ${p.title}`}>
                    <span className="hp-in">
                      <Poster title={p.title} src={p.src} eager={n < 4} />
                      <ShopTags p={p} place="art" />
                      <span className="caption"><strong>{p.title}</strong><small>{[catOf(p), day(p.date)].filter(Boolean).join(' · ')}</small><ShopTags p={p} place="cap" /></span>
                    </span>
                  </button>
                </motion.li>
              ) })}
            </AnimatePresence>
          </motion.ul>
          <Pager paged={paged} />
        </div>
      </section>

      {comics.length > 0 && filter === 'All' && (
        <section className="spread">
          <div className="container">
            <Runner label={pages.samples.label} page={3} />
            <div className="spread-head">
              <h2 className="display h-lg">{pages.samples.title}</h2>
              {pages.samples.intro && <p className="dim">{pages.samples.intro}</p>}
            </div>
            <ComicShelf comics={comics} />
          </div>
        </section>
      )}

      {redraws.length > 0 && filter === 'All' && (
        <section className="spread">
          <div className="container">
            <Runner label={home.redrawLabel} page={comics.length > 0 ? 4 : 3} />
            <div className="spread-head"><h2 className="display h-lg">{home.redrawTitle}</h2></div>
            {/* a row to scroll through, however many sets there are */}
            <ScrollRow className="compare-row" label="Pencils to colours, one piece at each stage">
              {redraws.map((r, i) => <Reveal key={r.slug} delay={Math.min(i, 3) * 0.1} className="compare-slot"><Compare set={r} /></Reveal>)}
            </ScrollRow>
          </div>
        </section>
      )}

      <Lightbox items={shown} sel={sel} setSel={setSel} />
    </Page>
  )
}
