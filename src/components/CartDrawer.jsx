import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { asset, canBuy, merchForSale, money, nowPrice, payWays, shop, shows, signable, sizesOf } from '../data/site'
import { useCart } from '../hooks/useCart'
import { useAccount } from '../hooks/useAccount'
import { checkout, payLine } from '../data/checkout'
import { Elsewhere, Lock, PaypalButton } from './Buy'

const EASE = [0.16, 1, 0.3, 1]
const things = (n) => `${n} ${n === 1 ? 'piece' : 'pieces'}`

/* The cart, sliding in from the right as one tall panel: a red head with how many pieces are in
   it; each piece with its picture, signed or not, how many and what it comes to; a discount code
   (a link that opens the box for it); then the total and the buttons that pay for all of it on a
   single Stripe or PayPal page. */
/* A country's name in English, from its two-letter code ("PT" → "Portugal"). */
const names = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }) } catch { return null } })()
const countryName = (c) => { try { return (names && names.of(c)) || c } catch { return c } }

export default function CartDrawer() {
  const cart = useCart()
  const account = useAccount()
  const mustLogIn = account.required && !account.user // accounts required, and nobody logged in
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  // a discount code: the box for it (opened from a link), what is typed, and why it was turned away;
  // the code once accepted lives in the cart (cart.discount)
  const [codeOpen, setCodeOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [codeNote, setCodeNote] = useState('')
  const [checking, setChecking] = useState(false)
  const apply = async (e) => {
    e.preventDefault()
    if (checking || !typed.trim()) return
    setChecking(true); setCodeNote('')
    const r = await cart.applyCode(typed)
    setChecking(false)
    if (r.ok) { setTyped(''); setCodeOpen(false) } else setCodeNote(r.message)
  }
  const { open, lines } = cart
  const setOpen = (v) => { if (!v) setNote(''); cart.setOpen(v) }

  useEffect(() => {
    if (!open) return
    const key = (e) => { if (e.key === 'Escape') setOpen(false) }
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.__lenis?.stop?.()
    addEventListener('keydown', key)
    return () => { removeEventListener('keydown', key); document.body.style.overflow = before; if (!document.querySelector('.lightbox')) window.__lenis?.start?.() }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const ways = payWays()
  const pay = async (way) => {
    if (busy || !lines.length) return
    setBusy(way); setNote('')
    const problem = await checkout({ items: lines.map((l) => ({ slug: l.slug, size: l.size, signed: l.signed, qty: l.qty })), ...(cart.discount ? { code: cart.discount.code } : {}), ...(cart.countries.length ? { country: cart.shipTo } : {}) }, way, cart.dropCode)
    if (problem) { setNote(problem); setBusy(false) }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="cart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={() => setOpen(false)} data-lenis-prevent>
          <motion.aside className="cart-panel" role="dialog" aria-modal="true" aria-label="Your cart" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.45, ease: EASE }} onClick={(e) => e.stopPropagation()}>
            <header className="cart-head">
              <div>
                <div className="cart-kicker">Your cart</div>
                <h2 className="cart-title">{cart.count ? things(cart.count) : 'Empty for now'}</h2>
              </div>
              <button type="button" className="cart-x" onClick={() => setOpen(false)} aria-label="Close the cart">×</button>
            </header>

            {lines.length === 0 ? (
              <div className="cart-empty">
                <p>Nothing in here yet. Open any piece in the shop and press <b>Add to cart</b>.</p>
                {/* a code put in from the account page waits here for the first piece */}
                {cart.discount && <p className="cart-empty-code"><b>{cart.discount.code}</b> is in your cart: {cart.discount.percent}% off comes off as soon as you add a piece.</p>}
                {shows('pages', 'shop')
                  ? <Link className="btn sm" to="/shop" onClick={() => setOpen(false)}>Go to the shop <span className="arrow">→</span></Link>
                  : <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>Keep looking</button>}
              </div>
            ) : (
              <>
                <ul className="cart-lines">
                  <AnimatePresence initial={false}>
                    {lines.map((l) => (
                      <motion.li key={l.key} layout initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30, height: 0, marginBottom: 0, paddingBlock: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                        <span className="cart-thumb">{l.piece.src && <img src={asset(l.piece.src)} alt="" />}</span>
                        <div className="cart-info">
                          <strong>{l.piece.title}</strong>
                          <small>{[l.size, signable(l.piece) ? (l.signed ? 'Signed' : 'Unsigned') : '', l.piece.type].filter(Boolean).join(' · ')}</small>
                          {l.deal && <span className="cart-sale">{l.deal.name || 'Sale'} −{l.deal.percent}%</span>}
                          <div className="cart-row">
                            <div className="cart-qty" role="group" aria-label={`How many of ${l.piece.title}`}>
                              <button type="button" onClick={() => (l.qty > 1 ? cart.setQty(l.slug, l.signed, l.qty - 1, l.size) : cart.remove(l.slug, l.signed, l.size))} aria-label="One fewer">−</button>
                              <span aria-live="polite">{l.qty}</span>
                              <button type="button" onClick={() => cart.setQty(l.slug, l.signed, l.qty + 1, l.size)} disabled={l.qty >= cart.max} aria-label="One more">+</button>
                            </div>
                            <span className="cart-price">{l.was > l.each && <s>{money(l.was * l.qty, true)}</s>}{money(l.each * l.qty, true)}</span>
                          </div>
                        </div>
                        <button type="button" className="cart-remove" onClick={() => cart.remove(l.slug, l.signed, l.size)} aria-label={`Remove ${l.piece.title}`}>×</button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>

                {/* little extras: with a piece of art in the cart, the stickers & more not in it yet, one tap each (their first option) */}
                {(() => {
                  if (!shows('shop', 'extras') || !lines.some((l) => l.piece.shelf !== 'merch')) return null
                  const extras = merchForSale.filter((p) => canBuy(p) && !lines.some((l) => l.slug === p.slug)).slice(0, 8)
                  if (!extras.length) return null
                  return (
                    <div className="cart-extras">
                      <h3>{shop.extrasTitle}</h3>
                      <ul data-lenis-prevent>
                        {extras.map((p) => {
                          const opt = sizesOf(p)[0]?.name || ''
                          return (
                            <li key={p.slug}>
                              <span className="cart-extra-pic">{p.src && <img src={asset(p.src)} alt="" loading="lazy" />}</span>
                              <span className="cart-extra-words"><b>{p.title}</b><small>{[opt, money(nowPrice(p, opt), true)].filter(Boolean).join(' · ')}</small></span>
                              <button type="button" className="cart-extra-add" onClick={() => cart.add(p.slug, false, opt)} aria-label={`Add ${p.title}${opt ? `, ${opt}` : ''}`}>+</button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })()}

                <footer className="cart-foot">
                  {/* a discount code: a link that opens the box; once applied, a line with what it takes off */}
                  {cart.discount ? (
                    <div className="cart-discount">
                      <span className="cart-discount-tag"><b>{cart.discount.code}</b><small>{cart.discount.percent}% off</small></span>
                      <button type="button" className="cart-discount-x" onClick={cart.dropCode} aria-label={`Remove the code ${cart.discount.code}`}>×</button>
                      <span className="cart-discount-off">−{money(cart.off, true)}</span>
                    </div>
                  ) : codeOpen ? (
                    <form className="cart-code" onSubmit={apply}>
                      <label className="sr-only" htmlFor="cart-code">Discount code</label>
                      <input id="cart-code" type="text" value={typed} onChange={(e) => { setTyped(e.target.value.toUpperCase()); setCodeNote('') }} placeholder="Discount code" autoComplete="off" autoCapitalize="characters" spellCheck="false" maxLength={40} autoFocus />
                      <button type="submit" className="btn sm" disabled={checking || !typed.trim()}>{checking ? 'Checking…' : 'Apply'}</button>
                      {codeNote && <p className="cart-code-note" role="alert">{codeNote}</p>}
                    </form>
                  ) : (
                    <button type="button" className="cart-code-open" onClick={() => setCodeOpen(true)}>Have a discount code?</button>
                  )}
                  {cart.discount && <div className="cart-total is-sub"><span>Before the discount</span><s>{money(cart.subtotal, true)}</s></div>}
                  {/* where it ships to, and (when the admin charges for delivery) what that costs from Portugal */}
                  {cart.countries.length > 0 && (
                    <div className="cart-ship">
                      <label>
                        <span>Ship to</span>
                        <select value={cart.shipTo} onChange={(e) => cart.setShipTo(e.target.value)} aria-label="Country it ships to">
                          {cart.countries.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
                        </select>
                      </label>
                      {cart.shipping.charged && <strong>{cart.shipping.none ? 'Ask for a quote' : cart.shipping.cents ? money(cart.shipping.cents / 100, true) : 'Free'}</strong>}
                    </div>
                  )}
                  {cart.shipping.charged && !cart.shipping.none && <p className="cart-small">{cart.shipping.free ? 'Free shipping on this order' : 'Shipping is an estimate'}, posted from Portugal.</p>}
                  <div className="cart-total"><span>Total</span><strong>{money(cart.grand)}</strong></div>
                  {/* the payment fee, when the admin adds one: it depends on the way to pay */}
                  {cart.fees.on && (ways.card || ways.paypal) && <p className="cart-small">A payment fee is added at the checkout: {[ways.card && `${money(cart.fees.card, true)} by card`, ways.paypal && `${money(cart.fees.paypal, true)} with PayPal`].filter(Boolean).join(' · ')}.</p>}
                  {shop.shipping !== false && <p className="cart-small">You enter your delivery address on the next page.</p>}
                  {mustLogIn ? (
                    <Link className="btn buy-btn" to="/account/login?next=/shop" onClick={() => setOpen(false)}>
                      <span>Log in to buy</span>
                      <span className="buy-btn-icon" aria-hidden="true">→</span>
                    </Link>
                  ) : <>
                  {ways.card && (
                    <button type="button" className={`btn buy-btn ${busy === 'card' ? 'is-busy' : ''}`} onClick={() => pay('card')} aria-busy={busy === 'card'}>
                      <span>{busy === 'card' ? 'Opening secure checkout' : ways.paypal ? 'Pay by card' : 'Checkout'}</span>
                      <span className="buy-btn-icon" aria-hidden="true">{busy === 'card' ? <i className="buy-spin" /> : '→'}</span>
                    </button>
                  )}
                  {ways.paypal && <PaypalButton busy={busy === 'paypal'} onClick={() => pay('paypal')} />}
                  </>}
                  <p className="buy-secure"><Lock /><span>{payLine()}</span></p>
                  {account.on && !account.user && (
                    <p className="cart-account">{mustLogIn ? 'New here? ' : 'Log in to keep this cart on every device and follow your orders. '}<Link to={mustLogIn ? '/account/signup?next=/shop' : '/account/login?next=/shop'} onClick={() => setOpen(false)}>{mustLogIn ? 'Make an account' : 'Log in'}</Link></p>
                  )}
                  <AnimatePresence>
                    {note && (
                      <motion.div className="buy-note" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <p>{note}</p>
                        <Elsewhere subject="Buying from the shop" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <button type="button" className="cart-clear" onClick={cart.clear}>Empty the cart</button>
                </footer>
              </>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
