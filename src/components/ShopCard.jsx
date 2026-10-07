import { useEffect, useState } from 'react'
import { asset, badge, canBuy, money, nowPrice, onSale, shop, soldOut } from '../data/site'
import { useCart } from '../hooks/useCart'
import Poster from './Poster'

/* A piece in the shop, as a product card. The art has the top of the card to itself, with only
   its New / Sale / Sold out tag in the corner; under it the title and the price on one line and
   what it is under them; at the foot, the way to see it whole and a button that drops it straight
   into the cart (unsigned, when signing is offered: the signature is chosen on the piece itself). */
export default function ShopCard({ p, onOpen, eager = false }) {
  const cart = useCart()
  const [added, setAdded] = useState(false)
  useEffect(() => { if (!added) return; const t = setTimeout(() => setAdded(false), 1600); return () => clearTimeout(t) }, [added])
  const tag = badge(p)
  const gone = soldOut(p)
  const add = () => { cart.add(p.slug, false); setAdded(true); setTimeout(() => cart.setOpen(true), 300) }
  const what = [p.type, p.category].filter(Boolean).join(' · ')
  return (
    <article className={`sc ${gone ? 'is-gone' : ''}`}>
      <button type="button" className="sc-open" onClick={onOpen} aria-label={`Open ${p.title}`}>
        <span className="sc-art">
          {p.src
            ? <img src={asset(p.src)} alt="" loading={eager ? 'eager' : 'lazy'} draggable="false" />
            : <Poster title={p.title} />}
          {tag && shop.tagPlace !== 'below' && <span className={`sc-tag is-${tag.kind}`}>{tag.text}</span>}
        </span>
        <span className="sc-info">
          <span className="sc-row">
            <strong className="sc-title">{p.title}</strong>
            <span className="sc-price">
              {onSale(p) && !gone && <s>{money(p.price, true)}</s>}
              <b>{money(nowPrice(p), true)}</b>
            </span>
          </span>
          {(what || (tag && shop.tagPlace === 'below')) && (
            <span className="sc-meta">
              {what && <small>{what}</small>}
              {tag && shop.tagPlace === 'below' && <span className={`sc-tag is-inline is-${tag.kind}`}>{tag.text}</span>}
            </span>
          )}
        </span>
      </button>
      <div className="sc-foot">
        <button type="button" className="sc-view" onClick={onOpen}>{gone ? 'Sold out · view' : 'View details'} <span aria-hidden="true">→</span></button>
        {canBuy(p) && (
          <button type="button" className={`sc-add ${added ? 'is-added' : ''}`} onClick={add} aria-label={`Add ${p.title} to the cart`} title="Add to cart">
            {added
              ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8.5h14l-1.1 11.6a1.2 1.2 0 0 1-1.2 1.1H7.3a1.2 1.2 0 0 1-1.2-1.1z M9 10.5V7a3 3 0 0 1 6 0v3.5" /></svg>}
          </button>
        )}
      </div>
    </article>
  )
}
