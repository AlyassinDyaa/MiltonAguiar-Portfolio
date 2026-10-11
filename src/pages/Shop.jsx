import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { artForSale, brand, forSale, merchForSale, salesNow, shop, shopCats, shows, soldOut, subCats, types, work } from '../data/site'
import { saleLine } from '../data/sales'
import Dropdown from '../components/Dropdown'
import { useCart } from '../hooks/useCart'
import { useAccount } from '../hooks/useAccount'
import { capturePaypal } from '../data/checkout'
import Page from '../components/Page'
import PageTitle from '../components/PageTitle'
import Runner from '../components/Runner'
import Lightbox from '../components/Lightbox'
import ShopCard from '../components/ShopCard'
import MerchShelf from '../components/MerchShelf'
import Pager, { usePaged } from '../components/Pager'
import Magnetic from '../components/Magnetic'

const EASE = [0.16, 1, 0.3, 1]

/* The shop's three drop-downs, each shown once it has two or more choices in use (and not switched
   off under Show or hide → Parts of the Shop page). The lists and
   their order are kept in the admin (Shop → Categories & sizes, and the kinds under Settings). */
const FILTERS = [
  { field: 'category', label: 'Category', all: 'All categories', list: () => shopCats, show: 'category' },
  { field: 'universe', label: 'Sub category', all: 'All', list: () => subCats, show: 'subcategory' },
  { field: 'type', label: 'Type', all: 'Everything', list: () => types, show: 'type' },
]
const noneOf = (filters) => Object.fromEntries(filters.map((f) => [f.field, 'All']))
const fitsIn = (filters) => (p, chosen) => filters.every((f) => chosen[f.field] === 'All' || String(p[f.field] || '').trim() === chosen[f.field])

/* Everything for sale: the pieces with a price, newest first, sold-out ones waiting at the end.
   Open one to see it whole and buy it (components/Buy.jsx). Stripe sends a buyer back here with
   "?thanks=1", which shows the thank-you panel and takes what was bought out of the cart; a
   logged-in buyer is sent to the orders in their account instead (api/checkout.js). */
export default function Shop() {
  const [params] = useSearchParams()
  // back from paying: Stripe comes back with ?thanks=1 (already paid); PayPal with ?paypal=return
  // and its order, which is only paid once it is taken here
  const paypalOrder = params.get('paypal') === 'return' ? params.get('token') : ''
  const [paypal, setPaypal] = useState(paypalOrder ? { state: 'taking' } : null)
  const thanks = params.get('thanks') === '1' || paypal?.state === 'paid'
  // back from paying: exactly what was bought leaves the cart; a logged-in PayPal buyer goes on to their orders
  const settle = useCart().settle
  const account = useAccount()
  const navigate = useNavigate()
  useEffect(() => { if (thanks) settle() }, [thanks, settle])
  // the capture says whether they are logged in, so it does not depend on the page having checked yet
  useEffect(() => { if (paypal?.state === 'paid' && (paypal.account || account.user)) navigate('/account?tab=orders&thanks=1', { replace: true }) }, [paypal, account.user, navigate])
  useEffect(() => {
    if (!paypalOrder) return
    let gone = false
    capturePaypal(paypalOrder).then((r) => { if (!gone) setPaypal(r.ok ? { state: 'paid', account: r.account } : { state: 'failed', message: r.message }) })
    return () => { gone = true }
  }, [paypalOrder])
  // the art is the shop; the small things (Shop → Stickers & more) are the merch table under it
  // (components/MerchShelf.jsx), unless switched off (Show / hide). With nothing but small things for sale, the table is the shop.
  const merchOn = merchForSale.length > 0 && shows('shop', 'merch')
  const anything = artForSale.length > 0 || merchOn
  // the shop sales running now, each a red band above the pieces (read as the page is drawn, so a
  // sale shows from its start and goes at its end without the site being rebuilt)
  const running = forSale.length ? salesNow() : []
  const salesBand = running.length > 0 && shows('shop', 'banners') && (
    <ul className="shop-sales" aria-label="Sales on now">
      {running.map((s, i) => (
        <li key={`${s.name}-${i}`} className="shop-sale">
          {s.name && <b>{s.name}</b>}
          <span>{saleLine(s)}</span>
        </li>
      ))}
    </ul>
  )
  // the three steps under the introduction: the admin's own (Page text → Shop), else the usual ones worded for how buyers pay and whether pieces are posted
  const payStep = shop.payments === 'paypal' ? 'Pay with PayPal' : shop.payments === 'both' ? 'Pay by card or PayPal' : 'Pay securely by card'
  const own = (Array.isArray(shop.steps) ? shop.steps : []).map((s) => String(s || '').trim()).filter(Boolean)
  const steps = (own.length ? own : ['Pick a piece', payStep, shop.shipping !== false ? 'Posted to your door' : 'Sent to your inbox']).slice(0, 4)

  return (
    <Page title="Shop">
      <PageTitle label={shop.label} title={shop.title} lead={shop.intro} slides={forSale.length ? forSale : work} tone="red">
        {paypal?.state === 'taking' ? (
          <div className="thanks is-wait" role="status"><i aria-hidden="true" className="buy-spin" /><div><strong>Finishing your PayPal payment…</strong><span>One moment, and do not close this page.</span></div></div>
        ) : paypal?.state === 'failed' ? (
          <div className="thanks is-failed" role="alert"><i aria-hidden="true">!</i><div><strong>The payment did not go through</strong><span>{paypal.message}</span></div></div>
        ) : thanks ? (
          <motion.div className="thanks" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5, ease: EASE }}>
            <i aria-hidden="true">✓</i>
            <div><strong>{shop.thanksTitle}</strong><span>{shop.thanksText}</span>{account.user && <Link className="thanks-link" to="/account?tab=orders">See it in your account →</Link>}</div>
          </motion.div>
        ) : forSale.length > 0 && shows('shop', 'steps') && (
          <ol className="how-buy">{steps.map((s, i) => <li key={s}><b>{String(i + 1).padStart(2, '0')}</b>{s}</li>)}</ol>
        )}
      </PageTitle>

      {(!anything || artForSale.length > 0) && (
      <section className="spread">
        <div className="container">
          {!anything ? (
            <>
              <Runner label={shop.listLabel} page={2} />
              <div className="hp dm shop-soon">
                <div className="hp-in">
                  <div className="words">
                    <p className="dm-say">{shop.emptyTitle}</p>
                    {shop.emptyText && <p className="lead">{shop.emptyText}</p>}
                    {brand.instagram && <Magnetic><a className="btn" href={brand.instagram} target="_blank" rel="noreferrer">Follow on Instagram <span className="arrow">↗</span></a></Magnetic>}
                  </div>
                </div>
              </div>
            </>
          ) : <ShopList pool={artForSale} label={shop.listLabel} page={2}>{salesBand}</ShopList>}
        </div>
      </section>
      )}

      {/* the small things: the merch table, under the art and before the last page */}
      {merchOn && <MerchShelf items={merchForSale} page={artForSale.length ? 3 : 2}>{!artForSale.length && salesBand}</MerchShelf>}
    </Page>
  )
}

/* The art for sale: its filters (each shown once it has two or more choices, and not switched off
   under Show or hide), its pieces a page at a time (10 to 50, as the visitor picks), and the window
   a piece opens in. `children` come between the label and the filters. */
function ShopList({ pool, label, page, children }) {
  const filters = FILTERS
  const fits = fitsIn(filters)
  const [pick, setPick] = useState(() => noneOf(filters))
  const [sel, setSel] = useState(null)
  const shown = useMemo(() => {
    const list = pool.filter((p) => fits(p, pick))
    return [...list.filter((p) => !soldOut(p)), ...list.filter(soldOut)]
  }, [pool, pick]) // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (field, value) => { setSel(null); setPick((was) => ({ ...was, [field]: value })) }
  const paged = usePaged(shown, 'shop', JSON.stringify(pick))
  const clear = () => { setSel(null); setPick(noneOf(filters)) }
  const filtering = filters.some((f) => pick[f.field] !== 'All')
  // each count reads with the other drop-downs' choices, so it says what picking it would show
  const count = (field, value) => pool.filter((p) => fits(p, { ...pick, [field]: value })).length
  const menus = filters.filter((f) => shows('shop', f.show)).map((f) => ({ ...f, list: f.list() })).filter((f) => f.list.length > 1)
  const noun = ['piece', 'pieces']
  return (
    <>
      <Runner label={filtering ? filters.map((f) => pick[f.field]).filter((x) => x !== 'All').join(' · ') : label} page={page} />
      {children}
      {menus.length > 0 && (
        <div className="shop-filters">
          {menus.map((f) => (
            <Dropdown key={f.field} label={f.label} value={pick[f.field]} onChange={(v) => choose(f.field, v)}
              options={['All', ...f.list].map((v) => ({ value: v, label: v === 'All' ? f.all : v, count: count(f.field, v) }))} />
          ))}
          {filtering && <button type="button" className="shop-filters-clear" onClick={clear}>Clear</button>}
          <span className="shop-filters-count">{shown.length} {shown.length === 1 ? noun[0] : noun[1]}</span>
        </div>
      )}
      {shown.length === 0 ? (
        <p className="shop-none">{shop.nothingText} <button type="button" onClick={clear}>Show everything</button></p>
      ) : (
        <>
          <motion.ul ref={paged.top} className="shop-grid" layout>
            <AnimatePresence mode="popLayout" initial={false}>
              {paged.rows.map((p, n) => (
                <motion.li key={p.slug} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.4, delay: Math.min(n, 8) * 0.04, ease: EASE }}>
                  <ShopCard p={p} onOpen={() => setSel(paged.from + n)} eager={n < 4} />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
          <Pager paged={paged} what={noun} />
        </>
      )}
      <Lightbox items={shown} sel={sel} setSel={setSel} />
    </>
  )
}
