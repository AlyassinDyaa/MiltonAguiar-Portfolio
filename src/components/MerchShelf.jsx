import { useEffect, useMemo, useState } from 'react'
import { asset, badge, canBuy, fullPrice, merchKinds, money, nowPrice, onSale, shop, sizesOf, soldOut, topSize } from '../data/site'
import { useCart } from '../hooks/useCart'
import Runner from './Runner'
import ScrollRow from './ScrollRow'
import Lightbox from './Lightbox'
import Pager, { usePaged } from './Pager'

const ROW = 12 // up to this many sit in one row that swipes; past it, "See all" opens them a page at a time
const TILTS = [-2.2, 1.6, -1.2, 2.4, -1.8, 1.1] // each sticker sits a little crooked, never two the same way in a row
const QUICK = 3 // up to this many options are picked right on the card; more, and the card opens instead

/* The merch table: the small things sold beside the art (Shop → Stickers & more), on a band of
   their own under the art, before the last page. A caption box and a heading (Page text → Shop),
   chips for each kind (Stickers, Bookmarks...), and the items as stickers, a little crooked, each
   with its price and an Add button (and its options to tap, when it has a few), so one tap puts it
   in the cart. Up to twelve sit in one row that swipes; with more, "See all" lays them all out a
   page at a time. A tap on the picture opens the item whole, as in the rest of the shop. */
export default function MerchShelf({ items, page = 3, children }) {
  const [kind, setKind] = useState('All')
  const [all, setAll] = useState(false)
  const [sel, setSel] = useState(null)
  const list = useMemo(() => {
    const picked = items.filter((p) => kind === 'All' || String(p.type || '').trim() === kind)
    return [...picked.filter((p) => !soldOut(p)), ...picked.filter(soldOut)]
  }, [items, kind])
  const paged = usePaged(list, 'shop-merch', kind)
  const choose = (k) => { setKind(k); setSel(null) }
  const count = (k) => items.filter((p) => k === 'All' || String(p.type || '').trim() === k).length
  const many = list.length > ROW
  const open = (p) => setSel(list.indexOf(p))
  return (
    <section className="spread merch-band" id="merch">
      <div className="container">
        <Runner label={shop.merchLabel} page={page} />
        <div className="merch-head">
          <p className="merch-caption">{shop.merchCaption}</p>
          <h2 className="display h-lg">{shop.merchTitle}</h2>
          {shop.merchIntro && <p className="dim">{shop.merchIntro}</p>}
        </div>
        {children}
        {merchKinds.length > 1 && (
          <div className="merch-chips" role="group" aria-label="What kind">
            {['All', ...merchKinds].map((k) => (
              <button key={k} type="button" className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => choose(k)}>
                {k === 'All' ? 'All' : k}<b>{count(k)}</b>
              </button>
            ))}
          </div>
        )}
        {all && many ? (
          <>
            <ul ref={paged.top} className="merch-grid">
              {paged.rows.map((p, n) => <li key={p.slug}><MerchCard p={p} tilt={TILTS[(paged.from + n) % TILTS.length]} onOpen={() => open(p)} /></li>)}
            </ul>
            <Pager paged={paged} what={['item', 'items']} />
            <button type="button" className="merch-more" onClick={() => setAll(false)}>Show fewer</button>
          </>
        ) : (
          <>
            <ScrollRow as="ul" className="merch-row" label={shop.merchTitle}>
              {list.slice(0, ROW).map((p, n) => <li key={p.slug}><MerchCard p={p} tilt={TILTS[n % TILTS.length]} onOpen={() => open(p)} /></li>)}
            </ScrollRow>
            {many && <button type="button" className="merch-more" onClick={() => setAll(true)}>See all {list.length} <span aria-hidden="true">→</span></button>}
          </>
        )}
      </div>
      <Lightbox items={list} sel={sel} setSel={setSel} />
    </section>
  )
}

/* One item as a sticker: the picture on a white die-cut edge whose corner peels up when it is
   pointed at, the New / Sale tag, its name, its options to tap (when it has a few), the price of the
   one picked, and Add. */
function MerchCard({ p, tilt, onOpen }) {
  const cart = useCart()
  const rows = sizesOf(p)
  const [opt, setOpt] = useState(rows[0]?.name || '')
  const [added, setAdded] = useState(false)
  useEffect(() => { if (!added) return; const t = setTimeout(() => setAdded(false), 1600); return () => clearTimeout(t) }, [added])
  const gone = soldOut(p)
  const tag = badge(p)
  const quick = rows.length <= QUICK // a few options: picked here; more: the item opens to pick one
  const add = () => {
    if (!quick) return onOpen()
    cart.add(p.slug, false, opt)
    setAdded(true)
  }
  const sale = quick && onSale(p, opt)
  return (
    <article className={`mc ${gone ? 'is-gone' : ''}`} style={{ '--tilt': `${tilt}deg` }}>
      <button type="button" className="mc-open" onClick={onOpen} aria-label={`Open ${p.title}`}>
        <span className="mc-sticker">{p.src && <img src={asset(p.src)} alt="" loading="lazy" draggable="false" />}</span>
        {tag && <span className={`mc-tag is-${tag.kind}`}>{tag.text}</span>}
      </button>
      <div className="mc-info">
        <strong className="mc-title">{p.title}</strong>
        {quick && rows.length > 1 && !gone && (
          <div className="mc-opts" role="radiogroup" aria-label={`Options of ${p.title}`}>
            {rows.map((r) => <button key={r.name} type="button" role="radio" aria-checked={opt === r.name} className={opt === r.name ? 'on' : ''} onClick={() => setOpt(r.name)}>{r.name}</button>)}
          </div>
        )}
        <div className="mc-buy">
          <span className="mc-price">
            {gone ? <b className="is-out">Sold out</b>
              : quick ? <><b className={sale ? 'is-sale' : ''}>{money(nowPrice(p, opt), true)}</b>{sale && <s>{money(fullPrice(p, opt), true)}</s>}</>
                : <b>{money(nowPrice(p, topSize(p)), true)}</b>}
          </span>
          {canBuy(p) && (
            <button type="button" className={`mc-add ${added ? 'is-added' : ''}`} onClick={add} aria-label={quick ? `Add ${p.title}${opt ? `, ${opt}` : ''} to the cart` : `Choose an option of ${p.title}`}>
              {added ? 'Added ✓' : quick ? '+ Add' : 'Choose'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
