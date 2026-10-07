import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { brand, canBuy, forSale, shop, soldOut, types, work } from '../data/site'
import { useCart } from '../hooks/useCart'
import Page from '../components/Page'
import PageTitle from '../components/PageTitle'
import Runner from '../components/Runner'
import Poster from '../components/Poster'
import Lightbox from '../components/Lightbox'
import ShopTags from '../components/ShopTags'
import Magnetic from '../components/Magnetic'

const EASE = [0.16, 1, 0.3, 1]

/* A row of chips that narrows the shop: every kind of thing sold, or every category. */
function Chips({ label, all, list, value, set, count }) {
  if (list.length < 2) return null
  return (
    <div className="shop-chips" role="group" aria-label={label}>
      <span className="shop-chips-label">{label}</span>
      {['All', ...list].map((c) => (
        <button key={c} type="button" className={`chip ${value === c ? 'on' : ''}`} aria-pressed={value === c} onClick={() => set(c)}>
          {c === 'All' ? all : c}<small>{count(c)}</small>
        </button>
      ))}
    </div>
  )
}

/* Everything for sale: the pieces with a price, newest first, sold-out ones waiting at the end.
   Open one to see it whole and buy it (components/Buy.jsx). Stripe sends a buyer back here with
   "?thanks=1", which shows the thank-you panel and empties the cart. */
export default function Shop() {
  const [params] = useSearchParams()
  const thanks = params.get('thanks') === '1'
  const clearCart = useCart().clear
  useEffect(() => { if (thanks) clearCart() }, [thanks, clearCart])
  const [kind, setKind] = useState('All')
  const [cat, setCat] = useState('All')
  const [sel, setSel] = useState(null)
  const cats = useMemo(() => [...new Set(forSale.map((p) => p.category).filter(Boolean))], [])
  const shown = useMemo(() => {
    const list = forSale.filter((p) => (kind === 'All' || p.type === kind) && (cat === 'All' || p.category === cat))
    return [...list.filter((p) => !soldOut(p)), ...list.filter(soldOut)]
  }, [kind, cat])
  // each count reads with the other row's choice, so it says what picking it would show
  const count = (field, value, other, otherValue) => forSale.filter((p) => (value === 'All' || p[field] === value) && (otherValue === 'All' || p[other] === otherValue)).length
  const pickKind = (k) => { setSel(null); setKind(k) }
  const pickCat = (c) => { setSel(null); setCat(c) }
  const steps = ['Pick a piece', 'Pay securely with Stripe', shop.shipping !== false ? 'Posted to your door' : 'Sent to your inbox']

  return (
    <Page title="Shop">
      <PageTitle label={shop.label} title={shop.title} lead={shop.intro} slides={forSale.length ? forSale : work} tone="loud">
        {thanks ? (
          <motion.div className="thanks" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5, ease: EASE }}>
            <i aria-hidden="true">✓</i>
            <div><strong>{shop.thanksTitle}</strong><span>{shop.thanksText}</span></div>
          </motion.div>
        ) : forSale.length > 0 && (
          <ol className="how-buy">{steps.map((s, i) => <li key={s}><b>{String(i + 1).padStart(2, '0')}</b>{s}</li>)}</ol>
        )}
        {(types.length > 1 || cats.length > 1) && (
          <div className="shop-filters">
            <Chips label="Type" all="Everything" list={types} value={kind} set={pickKind} count={(t) => count('type', t, 'category', cat)} />
            <Chips label="Category" all="Any" list={cats} value={cat} set={pickCat} count={(c) => count('category', c, 'type', kind)} />
          </div>
        )}
      </PageTitle>

      <section className="spread">
        <div className="container">
          <Runner label={kind === 'All' && cat === 'All' ? 'For sale' : [kind, cat].filter((x) => x !== 'All').join(' · ')} page={2} />
          {forSale.length === 0 ? (
            <div className="hp dm shop-soon">
              <div className="hp-in">
                <div className="words">
                  <p className="dm-say">{shop.emptyTitle}</p>
                  {shop.emptyText && <p className="lead">{shop.emptyText}</p>}
                  {brand.instagram && <Magnetic><a className="btn" href={brand.instagram} target="_blank" rel="noreferrer">Follow on Instagram <span className="arrow">↗</span></a></Magnetic>}
                </div>
              </div>
            </div>
          ) : shown.length === 0 ? (
            <p className="shop-none">Nothing in that combination. <button type="button" onClick={() => { pickKind('All'); pickCat('All') }}>Show everything</button></p>
          ) : (
            <motion.ul className="grid" layout>
              <AnimatePresence mode="popLayout" initial={false}>
                {shown.map((p, i) => (
                  <motion.li key={p.slug} layout initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ duration: 0.35, ease: EASE }}>
                    <button type="button" className={`hp tile ${soldOut(p) ? 'is-gone' : ''}`} onClick={() => setSel(i)} aria-label={`Open ${p.title}`}>
                      <span className="hp-in">
                        <Poster title={p.title} src={p.src} eager={i < 4} />
                        <ShopTags p={p} place="art" />
                        <span className="tile-cta">{canBuy(p) ? 'View & buy' : 'View'} <span className="arrow">→</span></span>
                        <span className="caption"><strong>{p.title}</strong><small>{[p.type, p.category].filter(Boolean).join(' · ')}</small><ShopTags p={p} place="cap" /></span>
                      </span>
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </div>
      </section>

      <Lightbox items={shown} sel={sel} setSel={setSel} />
    </Page>
  )
}
