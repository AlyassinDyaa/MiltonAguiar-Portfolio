import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useCart } from '../hooks/useCart'
import { useAccount } from '../hooks/useAccount'
import { badge, brand, buyable, fullPrice, money, nowPrice, onSale, payWays, priceOf, quote, shop, sizeNotes, sizesOf, soldOut } from '../data/site'
import Dropdown from './Dropdown'
import { checkout, payLine } from '../data/checkout'
import { QuoteGo } from './QuoteLink'

const EASE = [0.16, 1, 0.3, 1]

/* "Portugal, Spain and 9 more", from the two-letter codes set in the admin. */
function shipsTo(codes) {
  const list = (Array.isArray(codes) ? codes : []).map((c) => String(c).trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c))
  if (!list.length) return ''
  let names = list
  try { const region = new Intl.DisplayNames(['en'], { type: 'region' }); names = list.map((c) => region.of(c) || c) } catch { /* the codes will do */ }
  return names.length > 3 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(', ').replace(/, ([^,]*)$/, ' and $1')
}

/* Somewhere else to ask, when the checkout cannot be reached: the email, or the Instagram. */
export function Elsewhere({ subject }) {
  if (brand.email) return <a href={`mailto:${brand.email}?subject=${encodeURIComponent(subject)}`}>Email {brand.email} <span aria-hidden="true">→</span></a>
  if (brand.instagram) return <a href={brand.instagram} target="_blank" rel="noreferrer">Message {brand.handle || 'me'} on Instagram <span aria-hidden="true">↗</span></a>
  return null
}

/* The PayPal button, in PayPal's own yellow with its name in its two blues. */
export function PaypalButton({ busy, onClick, label = 'Pay with' }) {
  return (
    <button type="button" className={`pp-btn ${busy ? 'is-busy' : ''}`} onClick={onClick} aria-busy={busy} aria-label="Pay with PayPal">
      {busy ? <span className="pp-wait">Opening PayPal…</span> : <><span className="pp-say">{label}</span><span className="pp-word"><b>Pay</b><i>Pal</i></span></>}
    </button>
  )
}
export const Lock = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10.5h12v9.5H6z M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>

/* The price of a piece and the buttons that buy it, in the panel beside an opened piece. Shown
   only while online purchases are switched on in the admin and the piece has a price. "Add to
   cart" puts it in the cart and opens the cart; "Buy now" goes straight to a Stripe payment page
   for this one piece. If the checkout cannot be reached, a note slides in with another way to buy. */
export default function Buy({ piece }) {
  const cart = useCart()
  const account = useAccount()
  const mustLogIn = account.required && !account.user // accounts required, and nobody logged in
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [signed, setSigned] = useState(false) // a signature, when the admin offers one: off to start with
  const [added, setAdded] = useState(false)
  const [size, setSize] = useState(() => sizesOf(piece)[0]?.name || '') // the print size: the first to start with
  useEffect(() => { if (!added) return; const t = setTimeout(() => setAdded(false), 1800); return () => clearTimeout(t) }, [added])
  if (!buyable(piece)) return null
  const choice = Boolean(shop.signedChoice)
  const out = soldOut(piece)
  const extra = choice && signed ? Math.max(0, Number(shop.signedExtra) || 0) : 0
  const where = shop.shipping !== false ? shipsTo(shop.countries) : ''
  const tag = badge(piece)
  const sizes = sizesOf(piece)
  const now = nowPrice(piece, size), full = fullPrice(piece, size), sale = onSale(piece, size)
  const deal = priceOf(piece, size).deal // the shop sale that makes this price, when one does
  const inCart = cart.lines.filter((l) => l.slug === piece.slug).reduce((n, l) => n + l.qty, 0)
  const addToCart = () => { cart.add(piece.slug, choice && signed, size); setAdded(true); setTimeout(() => cart.setOpen(true), 350) }
  const ways = payWays()
  const buyNow = async (way) => {
    if (busy || out) return
    setBusy(way); setNote('')
    const problem = await checkout({ slug: piece.slug, ...(size ? { size } : {}), ...(choice ? { signed } : {}) }, way)
    if (problem) { setNote(problem); setBusy(false) } // otherwise it stays "busy" while the page changes
  }
  return (
    <motion.div className="buy" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.45, ease: EASE }}>
      <div className="buy-head">
        <span className={`buy-price ${out ? 'is-out' : ''} ${sale && !out ? 'is-sale' : ''}`}>{money(now + extra, true)}<small>{String(shop.currency || 'eur').toUpperCase()}</small></span>
        {sale && <s className="buy-was">{money(full + extra, true)}</s>}
        {tag && <span className={`tag-badge is-inline is-${tag.kind}`}>{tag.text}</span>}
        {/* keep it for later, in the customer's account (logged out: the heart leads to logging in) */}
        {account.on && (account.user
          ? <button type="button" className={`buy-heart ${account.isSaved(piece.slug) ? 'on' : ''}`} onClick={() => account.toggleSaved(piece.slug)} aria-pressed={account.isSaved(piece.slug)} title={account.isSaved(piece.slug) ? 'Saved in your account' : 'Save for later'} aria-label={account.isSaved(piece.slug) ? 'Remove from saved' : 'Save for later'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.3A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.8c0 5.7-7.5 10.3-7.5 10.3z" /></svg></button>
          : <Link className="buy-heart" to="/account/login?next=/account?tab=saved" title="Log in to save it for later" aria-label="Log in to save it for later"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.3A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.8c0 5.7-7.5 10.3-7.5 10.3z" /></svg></Link>)}
      </div>
      {piece.what && <p className="buy-what">{piece.what}</p>}
      {sale && !out && <p className="buy-save">{deal && <b className="buy-deal">{deal.name || 'Sale'} −{deal.percent}%</b>}You save {money(full - now, true)}</p>}
      {sizes.length > 0 && !out && (
        <Dropdown
          className="buy-size" label="Size" value={size} onChange={setSize}
          options={sizes.map((r) => ({ value: r.name, label: r.name, note: sizeNotes[r.name] || '', aside: r.sale ? <><s>{money(r.price, true)}</s> {money(r.now, true)}</> : money(r.now, true) }))}
        />
      )}
      {choice && !out && (
        <button type="button" role="switch" aria-checked={signed} className={`buy-sign ${signed ? 'on' : ''}`} onClick={() => setSigned(!signed)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17c2.500-.500 3.500-4 5-4s1 3 3 3 2.500-5 4.500-5 1 4 2.500 4 1.500-1 2.500-1.500 M4 21h16" /></svg>
          <span className="buy-sign-text">
            <strong>Signed by {brand.artist ? brand.artist.split(' ')[0] : 'the artist'}</strong>
            <small>{Number(shop.signedExtra) > 0 ? `Add a signature for ${money(shop.signedExtra, true)}` : 'Add a signature at no extra cost'}</small>
          </span>
          <i className="buy-sign-toggle" aria-hidden="true" />
        </button>
      )}
      {out ? (
        <>
          <span className="btn buy-btn is-out" aria-disabled="true">Sold out</span>
          {!quote.closed && <p className="buy-secure"><span>This one has gone. <QuoteGo>Ask about a reprint or a commission</QuoteGo></span></p>}
        </>
      ) : (
        <>
          <button type="button" className={`btn buy-btn ${added ? 'is-added' : ''}`} onClick={addToCart}>
            <span>{added ? 'Added to cart' : 'Add to cart'}</span>
            <span className="buy-btn-icon" aria-hidden="true">{added ? '✓' : '+'}</span>
          </button>
          {ways.paypal && !mustLogIn && <PaypalButton busy={busy === 'paypal'} onClick={() => buyNow('paypal')} label="Buy now with" />}
          <div className="buy-also">
            {mustLogIn && <Link className="buy-now" to={`/account/login?next=${encodeURIComponent('/shop')}`}>Log in to buy <span aria-hidden="true">→</span></Link>}
            {ways.card && !mustLogIn && <button type="button" className={`buy-now ${busy === 'card' ? 'is-busy' : ''}`} onClick={() => buyNow('card')} aria-busy={busy === 'card'}>{busy === 'card' ? 'Opening secure checkout…' : `${shop.buttonLabel} now${ways.paypal ? ' by card' : ''}`} <span aria-hidden="true">→</span></button>}
            {inCart > 0 && <button type="button" className="buy-incart" onClick={() => cart.setOpen(true)}>{inCart} in your cart</button>}
          </div>
          <p className="buy-secure"><Lock /><span>{payLine()}{where ? ` · Ships to ${where}` : ''}</span></p>
        </>
      )}
      <AnimatePresence>
        {note && (
          <motion.div className="buy-note" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: EASE }}>
            <p>{note}</p>
            <Elsewhere subject={`Buying "${piece.title}"`} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
