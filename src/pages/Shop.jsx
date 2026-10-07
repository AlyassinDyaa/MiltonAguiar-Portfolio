import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { brand, forSale, shop, shopCats, soldOut, subCats, types, work } from '../data/site'
import Dropdown from '../components/Dropdown'
import { useCart } from '../hooks/useCart'
import Page from '../components/Page'
import PageTitle from '../components/PageTitle'
import Runner from '../components/Runner'
import Lightbox from '../components/Lightbox'
import ShopCard from '../components/ShopCard'
import Magnetic from '../components/Magnetic'

const EASE = [0.16, 1, 0.3, 1]

/* The shop's three drop-downs, each shown once it has two or more choices in use. The lists and
   their order are kept in the admin (Shop → Categories & sizes, and the kinds under Settings). */
const FILTERS = [
  { field: 'category', label: 'Category', all: 'All categories', list: () => shopCats },
  { field: 'universe', label: 'Sub category', all: 'All', list: () => subCats },
  { field: 'type', label: 'Type', all: 'Everything', list: () => types },
]
const NONE = Object.fromEntries(FILTERS.map((f) => [f.field, 'All']))
const fits = (p, chosen) => FILTERS.every((f) => chosen[f.field] === 'All' || String(p[f.field] || '').trim() === chosen[f.field])

/* Everything for sale: the pieces with a price, newest first, sold-out ones waiting at the end.
   Open one to see it whole and buy it (components/Buy.jsx). Stripe sends a buyer back here with
   "?thanks=1", which shows the thank-you panel and empties the cart. */
export default function Shop() {
  const [params] = useSearchParams()
  const thanks = params.get('thanks') === '1'
  const clearCart = useCart().clear
  useEffect(() => { if (thanks) clearCart() }, [thanks, clearCart])
  const [pick, setPick] = useState(NONE)
  const [sel, setSel] = useState(null)
  const shown = useMemo(() => {
    const list = forSale.filter((p) => fits(p, pick))
    return [...list.filter((p) => !soldOut(p)), ...list.filter(soldOut)]
  }, [pick])
  const choose = (field, value) => { setSel(null); setPick((was) => ({ ...was, [field]: value })) }
  const clear = () => { setSel(null); setPick(NONE) }
  const filtering = FILTERS.some((f) => pick[f.field] !== 'All')
  // each count reads with the other drop-downs' choices, so it says what picking it would show
  const count = (field, value) => forSale.filter((p) => fits(p, { ...pick, [field]: value })).length
  const menus = FILTERS.map((f) => ({ ...f, list: f.list() })).filter((f) => f.list.length > 1)
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
      </PageTitle>

      <section className="spread">
        <div className="container">
          <Runner label={filtering ? FILTERS.map((f) => pick[f.field]).filter((x) => x !== 'All').join(' · ') : 'For sale'} page={2} />
          {menus.length > 0 && (
            <div className="shop-filters">
              {menus.map((f) => (
                <Dropdown key={f.field} label={f.label} value={pick[f.field]} onChange={(v) => choose(f.field, v)}
                  options={['All', ...f.list].map((v) => ({ value: v, label: v === 'All' ? f.all : v, count: count(f.field, v) }))} />
              ))}
              {filtering && <button type="button" className="shop-filters-clear" onClick={clear}>Clear</button>}
              <span className="shop-filters-count">{shown.length} {shown.length === 1 ? 'piece' : 'pieces'}</span>
            </div>
          )}
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
            <p className="shop-none">Nothing in that combination. <button type="button" onClick={clear}>Show everything</button></p>
          ) : (
            <motion.ul className="shop-grid" layout>
              <AnimatePresence mode="popLayout" initial={false}>
                {shown.map((p, i) => (
                  <motion.li key={p.slug} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.04, ease: EASE }}>
                    <ShopCard p={p} onOpen={() => setSel(i)} eager={i < 4} />
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
