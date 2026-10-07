import { useEffect, useState } from 'react'
import { asset, badge, brand, canBuy, filedUnder, fromPrice, fullPrice, manyPrices, money, nowPrice, onSale, shop, sizesOf, soldOut } from '../data/site'
import { useCart } from '../hooks/useCart'
import Poster from './Poster'
import CartIcon from './CartIcon'

const MAX_CHIPS = 3

/* A piece in the shop, the way a print shop hangs it: on a lit wall, as the thing being sold (its
   "look", chosen in the admin per kind or per piece: a printed poster, a framed print, an original
   art board, a comic book, or the art alone), with only its New / Sale / Sold out tag in the
   corner; its second picture, when it has one, fades in over it. Pointing at it slides up a bar with Quick view and Add to cart (Choose size, for a piece
   sold in several sizes, which opens it). Under the wall, like a gallery label: what it is, the
   title, its sizes and its price ("from" when the sizes cost different amounts). */
export default function ShopCard({ p, onOpen, eager = false }) {
  const cart = useCart()
  const [added, setAdded] = useState(false)
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
  const was = !from && onSale(p, one) ? fullPrice(p, one) : 0
  const what = [p.type, filedUnder(p)].filter(Boolean).join(' · ')
  const mock = p.src && p.look !== 'plain'
  return (
    <article className={`pc ${gone ? 'is-gone' : ''}`}>
      <div className="pc-top">
        <button type="button" className="pc-stage" onClick={onOpen} aria-label={`Open ${p.title}`}>
          <span className={`sc-art ${mock ? `is-mock look-${p.look}` : ''}`}>
            {!p.src ? <Poster title={p.title} />
              : mock ? (
                <span className="mock">
                  <span className="mock-item">
                    <img src={asset(p.src)} alt="" loading={eager ? 'eager' : 'lazy'} draggable="false" />
                    {p.look === 'board' && <span className="mock-note" aria-hidden="true">{brand.artist || brand.name}</span>}
                  </span>
                </span>
              ) : <img src={asset(p.src)} alt="" loading={eager ? 'eager' : 'lazy'} draggable="false" />}
            {p.hover && <span className="pc-alt" aria-hidden="true"><img src={asset(p.hover)} alt="" loading="lazy" draggable="false" /></span>}
            {tag && shop.tagPlace !== 'below' && <span className={`sc-tag is-${tag.kind}`}>{tag.text}</span>}
          </span>
        </button>
        <div className="pc-actions">
          <button type="button" className="pc-quick" onClick={onOpen}>Quick view</button>
          {canBuy(p) && (
            <button type="button" className={`pc-add ${added ? 'is-added' : ''}`} onClick={add} aria-label={choose ? `Choose a size of ${p.title}` : `Add ${p.title} to the cart`}>
              <span>{added ? 'Added' : choose ? 'Choose size' : 'Add to cart'}</span>
              {added ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> : <CartIcon />}
            </button>
          )}
        </div>
      </div>
      <button type="button" className="pc-info" onClick={onOpen} tabIndex={-1} aria-hidden="true">
        {(what || (tag && shop.tagPlace === 'below')) && (
          <span className="pc-meta">
            {what && <small>{what}</small>}
            {tag && shop.tagPlace === 'below' && <span className={`sc-tag is-inline is-${tag.kind}`}>{tag.text}</span>}
          </span>
        )}
        <strong className="pc-title">{p.title}</strong>
        <span className="pc-row">
          <span className="pc-sizes">
            {sizes.slice(0, MAX_CHIPS).map((r) => <i key={r.name}>{r.name}</i>)}
            {sizes.length > MAX_CHIPS && <i>+{sizes.length - MAX_CHIPS}</i>}
          </span>
          <span className="pc-price">
            {from && <em>From</em>}
            {was > 0 && !gone && <s>{money(was, true)}</s>}
            <b className={was > 0 && !gone ? 'is-sale' : ''}>{money(from ? fromPrice(p) : nowPrice(p, one), true)}</b>
          </span>
        </span>
      </button>
    </article>
  )
}
