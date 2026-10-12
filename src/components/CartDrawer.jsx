import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { accountPage, asset, canBuy, extrasKinds, merchForSale, money, nowPrice, payWays, shop, shows, signable, sizesOf } from '../data/site'
import { useCart } from '../hooks/useCart'
import { useAccount } from '../hooks/useAccount'
import { checkout, payLine } from '../data/checkout'
import { Elsewhere, Lock, PaypalButton } from './Buy'
import Dropdown from './Dropdown'
import ScrollRow from './ScrollRow'

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
  // the points this order earns (Rewards → Points): for what the pieces come to after any code, as the
  // account is paid them once it is paid (not the shipping, nor a transaction fee); a visitor is asked to log in for them
  const pts = accountPage.points || {}
  const earns = account.on && pts.on && pts.perUnit > 0 ? Math.floor(cart.total * pts.perUnit) : 0
  const pointsLine = earns > 0 && (account.user
    ? <p className="cart-points"><b>+{earns} {pts.name}</b> with this order</p>
    : <p className="cart-points"><Link to="/account/login?next=/shop" onClick={() => cart.setOpen(false)}>Log in</Link> to earn <b>{earns} {pts.name}</b> with this order</p>)
  // two steps: the cart, then checkout (shipping, totals, the ways to pay); it opens on the cart
  const [step, setStep] = useState('cart')
  useEffect(() => { if (open) setStep('cart') }, [open])
  useEffect(() => { if (!lines.length) setStep('cart') }, [lines.length])

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

  // drawn at the top of the page, so it opens over a piece's window too (Add to cart in it)
  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="cart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={() => setOpen(false)} data-lenis-prevent>
          <motion.aside className="cart-panel" role="dialog" aria-modal="true" aria-label="Your cart" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.45, ease: EASE }} onClick={(e) => e.stopPropagation()}>
            <header className="cart-head">
              <div>
                <div className="cart-kicker">{lines.length ? (step === 'pay' ? 'Step 2 of 2 · Checkout' : 'Step 1 of 2 · Your cart') : 'Your cart'}</div>
                <h2 className="cart-title">{!cart.count ? 'Empty for now' : step === 'pay' ? 'Checkout' : things(cart.count)}</h2>
                {/* emptying it: under the count, out of the way of the pieces */}
                {lines.length > 0 && step === 'cart' && <button type="button" className="cart-clear is-head" onClick={cart.clear}>Empty the cart</button>}
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
                {step === 'cart' ? (
                  <>
                    {/* step 1, the cart: the pieces, the little extras, a code, and what it all comes to */}
                    <div className="cart-body" data-lenis-prevent>
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


                    </div>
                    {/* little extras, kept at the foot of the cart above the subtotal: with a piece of art in the cart, the stickers & more not in it yet, one tap each (their first option); a row that swipes, with arrows */}
                    {(() => {
                      if (!shows('shop', 'extras') || !lines.some((l) => l.piece.shelf !== 'merch')) return null
                      const extras = merchForSale.filter((p) => extrasKinds.has(String(p.type || '').trim()) && canBuy(p) && !lines.some((l) => l.slug === p.slug)).slice(0, 8) // only the kinds ticked "In the cart's little extras"
                      if (!extras.length) return null
                      return (
                        <div className="cart-extras">
                          <h3>{shop.extrasTitle}</h3>
                          <ScrollRow as="ul" className="cart-extras-row" label={shop.extrasTitle}>
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
                          </ScrollRow>
                        </div>
                      )
                    })()}
                    <footer className="cart-pay">
                      <div className="cart-total"><span>Subtotal</span><strong>{money(cart.total)}</strong></div>
                      {pointsLine}
                      <button type="button" className="btn buy-btn" onClick={() => setStep('pay')}>
                        <span>{shop.shipping !== false ? 'Next: shipping & payment' : 'Next: payment'}</span>
                        <span className="buy-btn-icon" aria-hidden="true">→</span>
                      </button>
                      <p className="cart-small is-center">{shop.shipping !== false ? 'Shipping and the way to pay come next.' : 'The way to pay comes next.'}</p>
                    </footer>
                  </>
                ) : (
                  <>
                    {/* step 2, checkout: back to edit the cart (its pieces are not listed again), where it goes and what that costs, the totals, and the ways to pay */}
                    <div className="cart-body" data-lenis-prevent>
                      <button type="button" className="cart-back" onClick={() => setStep('cart')}>← Back to edit your cart</button>
                      {/* where it ships to: the site's own drop-down */}
                      {cart.countries.length > 0 && (
                        <Dropdown className="cart-shipto" label="Ship to" value={cart.shipTo} onChange={cart.setShipTo}
                          options={cart.countries.map((c) => ({ value: c, label: countryName(c) }))} />
                      )}
                      <section className="cart-sum is-order" aria-labelledby="cart-order-title">
                        <h3 className="cart-sum-head" id="cart-order-title">Your order</h3>
                        <div className="cart-sum-row"><span>Subtotal</span><b>{money(cart.subtotal, true)}</b></div>
                        {cart.discount && (
                          <div className="cart-sum-row is-off">
                            <span><em>{cart.discount.code}</em> {cart.discount.percent}% off <button type="button" className="cart-discount-x" onClick={cart.dropCode} aria-label={`Remove the code ${cart.discount.code}`}>×</button></span>
                            <b>−{money(cart.off, true)}</b>
                          </div>
                        )}
                        {cart.countries.length > 0 && cart.shipping.charged && (
                          <div className="cart-sum-row"><span>Shipping{cart.shipping.zone ? ` (${cart.shipping.zone})` : ''}</span><b>{cart.shipping.none ? 'Ask for a quote' : cart.shipping.cents ? money(cart.shipping.cents / 100, true) : 'Free'}</b></div>
                        )}
                        {cart.fees.on && (ways.card || ways.paypal) && (
                          <div className="cart-sum-row is-fee"><span>Transaction fee</span><b>{[ways.card && `${money(cart.fees.card, true)} card`, ways.paypal && `${money(cart.fees.paypal, true)} PayPal`].filter(Boolean).join(' · ')}</b></div>
                        )}
                        {!cart.discount && (codeOpen ? (
                          <form className="cart-code" onSubmit={apply}>
                            <label className="sr-only" htmlFor="cart-code">Discount code</label>
                            <input id="cart-code" type="text" value={typed} onChange={(e) => { setTyped(e.target.value.toUpperCase()); setCodeNote('') }} placeholder="Discount code" autoComplete="off" autoCapitalize="characters" spellCheck="false" maxLength={40} autoFocus />
                            <button type="submit" className="btn sm" disabled={checking || !typed.trim()}>{checking ? 'Checking…' : 'Apply'}</button>
                            {codeNote && <p className="cart-code-note" role="alert">{codeNote}</p>}
                          </form>
                        ) : (
                          <button type="button" className="cart-code-open" onClick={() => setCodeOpen(true)}>Have a discount code?</button>
                        ))}
                        {shop.shipping !== false && <p className="cart-small">{cart.shipping.charged && !cart.shipping.none ? 'Shipping is an estimate, posted from Portugal. ' : ''}You enter your address on the next page.</p>}
                      </section>
                    </div>
                    <footer className="cart-pay">
                      <div className="cart-total"><span>{cart.fees.on ? 'Total before fee' : 'Total'}</span><strong>{money(cart.grand)}</strong></div>
                      {pointsLine}
                      {mustLogIn ? (
                        <Link className="btn buy-btn" to="/account/login?next=/shop" onClick={() => setOpen(false)}>
                          <span>Log in to buy</span>
                          <span className="buy-btn-icon" aria-hidden="true">→</span>
                        </Link>
                      ) : <>
                      {/* each way to pay with what it comes to, the transaction fee for it included */}
                      {ways.card && (
                        <button type="button" className={`btn buy-btn ${busy === 'card' ? 'is-busy' : ''}`} onClick={() => pay('card')} aria-busy={busy === 'card'} disabled={cart.shipping.none}>
                          <span>{busy === 'card' ? 'Opening secure checkout' : `Pay ${money(cart.grand + (cart.fees.on ? cart.fees.card : 0), true)} by card`}</span>
                          <span className="buy-btn-icon" aria-hidden="true">{busy === 'card' ? <i className="buy-spin" /> : '→'}</span>
                        </button>
                      )}
                      {ways.paypal && <PaypalButton busy={busy === 'paypal'} onClick={() => { if (!cart.shipping.none) pay('paypal') }} label={`Pay ${money(cart.grand + (cart.fees.on ? cart.fees.paypal : 0), true)} with`} />}
                      </>}
                      <AnimatePresence>
                        {note && (
                          <motion.div className="buy-note" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                            <p>{note}</p>
                            <Elsewhere subject="Buying from the shop" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <p className="buy-secure"><Lock /><span>{payLine()}</span></p>
                    </footer>
                  </>
                )}
              </>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
    , document.body,
  )
}
