import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { asset, money, shop, shows } from '../data/site'
import { useCart } from '../hooks/useCart'
import { checkout } from '../data/checkout'
import { Elsewhere, Lock } from './Buy'

const EASE = [0.16, 1, 0.3, 1]
const things = (n) => `${n} ${n === 1 ? 'piece' : 'pieces'}`

/* The cart, sliding in from the right as one tall panel: a red head with how many pieces are in
   it; each piece with its picture, signed or not, how many and what it comes to; then the total
   and one button that pays for all of it on a single Stripe page. */
export default function CartDrawer() {
  const cart = useCart()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
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

  const pay = async () => {
    if (busy || !lines.length) return
    setBusy(true); setNote('')
    const problem = await checkout({ items: lines.map((l) => ({ slug: l.slug, size: l.size, signed: l.signed, qty: l.qty })) })
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
                          <small>{[l.size, shop.signedChoice ? (l.signed ? 'Signed' : 'Unsigned') : '', l.piece.type].filter(Boolean).join(' · ')}</small>
                          <div className="cart-row">
                            <div className="cart-qty" role="group" aria-label={`How many of ${l.piece.title}`}>
                              <button type="button" onClick={() => (l.qty > 1 ? cart.setQty(l.slug, l.signed, l.qty - 1, l.size) : cart.remove(l.slug, l.signed, l.size))} aria-label="One fewer">−</button>
                              <span aria-live="polite">{l.qty}</span>
                              <button type="button" onClick={() => cart.setQty(l.slug, l.signed, l.qty + 1, l.size)} disabled={l.qty >= cart.max} aria-label="One more">+</button>
                            </div>
                            <span className="cart-price">{money(l.each * l.qty, true)}</span>
                          </div>
                        </div>
                        <button type="button" className="cart-remove" onClick={() => cart.remove(l.slug, l.signed, l.size)} aria-label={`Remove ${l.piece.title}`}>×</button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>

                <footer className="cart-foot">
                  <div className="cart-total"><span>Total</span><strong>{money(cart.total)}</strong></div>
                  {shop.shipping !== false && <p className="cart-small">You enter your delivery address on the next page.</p>}
                  <button type="button" className={`btn buy-btn ${busy ? 'is-busy' : ''}`} onClick={pay} aria-busy={busy}>
                    <span>{busy ? 'Opening secure checkout' : 'Checkout'}</span>
                    <span className="buy-btn-icon" aria-hidden="true">{busy ? <i className="buy-spin" /> : '→'}</span>
                  </button>
                  <p className="buy-secure"><Lock /><span>Secure checkout by Stripe</span></p>
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
