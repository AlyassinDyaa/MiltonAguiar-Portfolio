import { useEffect, useState } from 'react'
import { asset, badge, brand, canBuy, filedUnder, fromPrice, fullPrice, manyPrices, money, nowPrice, onSale, shop, sizesOf, soldOut } from '../data/site'
import { useCart } from '../hooks/useCart'
import Poster from './Poster'
import CartIcon from './CartIcon'

/* A piece in the shop. The piece fills the card, shown as the thing the buyer gets (its "look",
   chosen in the admin per kind or per piece): a printed poster with its white paper edge, a framed
   print, an original art board, a comic book, or the art alone. Its New / Sale / Sold out tag sits
   in the corner; its second picture, when it has one, fades in when the card is pointed at, with a
   small cart button (Choose size, for a piece sold in several sizes, opens it instead). Under it,
   on one line, the title and the price; under that, what it is. */
export default function ShopCard({ p, onOpen, eager = false }) {
  const cart = useCart()
  const [added, setAdded] = useState(false)
  const [altReady, setAltReady] = useState(false) // the second picture fades in only once it has fully loaded
  useEffect(() => { if (!added) return; const t = setTimeout(() => setAdded(false), 1600); return () => clearTimeout(t) }, [added])
  const tag = badge(p)
  const gone = soldOut(p)
  const sizes = sizesOf(p)
  const choose = sizes.length > 1 // more than one size: the size is picked on the piece itself
  const add = () => {
    if (choose) return onOpen()
    cart.add(p.slug, false, sizes[0]?.name || ''); setAdded(true); setTimeout(() => cart.setOpen(true), 300)
  }
  const from = manyPrices(p)
  const one = sizes[0]?.name // the size whose price shows when there is only one price
  const sale = !from && onSale(p, one)
  const what = [p.type, filedUnder(p), sizes.length > 1 ? `${sizes.length} sizes` : sizes[0]?.name].filter(Boolean).join(' · ')
  const look = p.src ? p.look || 'poster' : 'plain'
  return (
    <article className={`pc look-${look} ${gone ? 'is-gone' : ''}`}>
      <div className="pc-art">
        <button type="button" className="pc-open" onClick={onOpen} aria-label={`Open ${p.title}`}>
          <span className="pc-frame">
            {p.src ? <img src={asset(p.src)} alt="" loading={eager ? 'eager' : 'lazy'} draggable="false" /> : <Poster title={p.title} />}
            {p.hover && <span className={`pc-alt ${altReady ? 'is-ready' : ''}`} aria-hidden="true"><img src={asset(p.hover)} alt="" decoding="async" draggable="false" onLoad={() => setAltReady(true)} /></span>}
            {look === 'board' && <span className="pc-note" aria-hidden="true">{brand.artist || brand.name}</span>}
          </span>
        </button>
        {tag && shop.tagPlace !== 'below' && <span className={`sc-tag is-${tag.kind}`}>{tag.text}</span>}
        {canBuy(p) && (
          <button type="button" className={`pc-add ${added ? 'is-added' : ''}`} onClick={add} aria-label={choose ? `Choose a size of ${p.title}` : `Add ${p.title} to the cart`} title={choose ? 'Choose a size' : 'Add to cart'}>
            {added ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> : <CartIcon />}
          </button>
        )}
      </div>
      <button type="button" className="pc-info" onClick={onOpen} tabIndex={-1} aria-hidden="true">
        <span className="pc-row">
          <strong className="pc-title">{p.title}</strong>
          <span className="pc-price">
            {gone ? <b className="is-out">Sold out</b> : from ? <><i>from</i><b>{money(fromPrice(p), true)}</b></> : <><b className={sale ? 'is-sale' : ''}>{money(nowPrice(p, one), true)}</b>{sale && <s>{money(fullPrice(p, one), true)}</s>}</>}
          </span>
        </span>
        {(what || (tag && shop.tagPlace === 'below')) && (
          <span className="pc-meta">
            {what && <small>{what}</small>}
            {tag && shop.tagPlace === 'below' && <span className={`sc-tag is-inline is-${tag.kind}`}>{tag.text}</span>}
          </span>
        )}
      </button>
    </article>
  )
}
