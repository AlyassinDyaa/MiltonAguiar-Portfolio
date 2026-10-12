import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { asset, brand, events, salesNow, shop, shows, welcome } from '../data/site'
import { saleLine } from '../data/sales'
import { useCart } from '../hooks/useCart'

const EASE = [0.16, 1, 0.3, 1]
const KEY = 'ma.welcome' // what the visitor last closed, and when

/* The last moment a plain date ("2026-10-31") still counts: the end of that day. */
const endOf = (v) => { const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? `${v}T23:59:59` : v); return Number.isFinite(t) ? t : null }
const read = (store) => { try { return JSON.parse(store.getItem(KEY) || 'null') } catch { return null } }
const keep = (store, v) => { try { store.setItem(KEY, JSON.stringify(v)) } catch { /* not remembered: it may show again */ } }

/* The welcome card (Shop → Welcome card): as a visitor opens the site, once the opening has played,
   one card over the page with what is worth knowing now: the sale on now (only the price cuts marked
   "In the welcome card": the name, the cut and until when, and a way to the Shop), a discount code
   for everyone (put in the cart with one tap, or copied), the convention the admin picked (its
   picture, when and where, its link), and a message of the admin's own. With none of these it does
   not show. Closed (the ×, Escape, a click outside, "Maybe later" or any of its buttons) it stays
   away in this browser, for the day or the visit, as the admin chose; something new shows to
   everyone again. Never over the page that finishes a payment or the unsubscribe page. `ready` is
   the opening having played. */
export default function WelcomeCard({ ready }) {
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const cart = useCart()
  const [codeSaid, setCodeSaid] = useState('') // what happened to the code: in the cart, copied, or why not
  const [codeBusy, setCodeBusy] = useState(false)
  // what the card has to say right now
  const parts = useMemo(() => {
    if (!welcome.on) return null
    const until = endOf(welcome.until)
    const current = until == null || Date.now() <= until
    const sales = welcome.sale && shop.enabled && shows('pages', 'shop') ? salesNow().filter((s) => s.announce) : []
    const code = current && shop.enabled && String(welcome.code || '').trim() ? { code: String(welcome.code).trim().toUpperCase(), text: String(welcome.codeText || '').trim() || 'A discount on your order' } : null
    const event = current && welcome.event ? events.find((e) => e.slug === welcome.event) || null : null
    const own = current && String(welcome.title || '').trim() ? welcome : null
    if (!sales.length && !code && !event && !own) return null
    return { sales, code, event, own, key: JSON.stringify([sales.map((s) => [s.name, s.percent, s.ends]), code && code.code, event && event.slug, own && [own.title, own.text]]) }
  }, [])
  // shown once the opening has played, unless already closed (for the visit, the day, or until something new)
  useEffect(() => {
    if (!ready || !parts) return
    if (/^\/account\/(unsubscribe|gift)/.test(loc.pathname) || /[?&](thanks|paypal)=/.test(loc.search)) return
    const store = welcome.often === 'visit' ? sessionStorage : localStorage
    const was = read(store)
    const fresh = !was || was.key !== parts.key
    const stale = welcome.often === 'day' && was && Date.now() - was.at > 24 * 60 * 60 * 1000
    if (!fresh && !stale) return
    const t = setTimeout(() => setOpen(true), 500)
    return () => clearTimeout(t)
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    setOpen(false)
    keep(welcome.often === 'visit' ? sessionStorage : localStorage, { key: parts.key, at: Date.now() })
  }
  useEffect(() => {
    if (!open) return undefined
    const before = document.activeElement
    const key = (e) => { if (e.key === 'Escape') close() }
    addEventListener('keydown', key)
    const t = setTimeout(() => box.current?.querySelector('a, button')?.focus(), 80)
    window.__lenis?.stop?.()
    return () => { removeEventListener('keydown', key); clearTimeout(t); window.__lenis?.start?.(); before?.focus?.({ preventScroll: true }) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!parts || typeof document === 'undefined') return null
  const { sales, code, event, own } = parts
  // the code: checked by the site and put in the cart (it comes off at the checkout), or copied
  const useIt = async () => {
    setCodeBusy(true)
    try { const r = await cart.applyCode(code.code); setCodeSaid(r && r.ok ? 'In your cart: it comes off at the checkout.' : (r && r.message) || 'It could not be added just now. Copy it and type it in the cart.') } catch { setCodeSaid('It could not be added just now. Copy it and type it in the cart.') } finally { setCodeBusy(false) }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(code.code); setCodeSaid('Copied. Type it in the cart at the checkout.') } catch { setCodeSaid(`Your code: ${code.code}`) } }
  const top = sales.reduce((a, s) => (s.percent > (a ? a.percent : 0) ? s : a), null) // the biggest cut, for the burst
  const external = (u) => /^https?:\/\//.test(String(u || ''))
  const Go = ({ to, children, className = 'btn' }) => (external(to)
    ? <a className={className} href={to} target="_blank" rel="noreferrer" onClick={close}>{children}</a>
    : <Link className={className} to={to || '/'} onClick={close}>{children}</Link>)
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="wc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onMouseDown={(e) => { if (e.target === e.currentTarget) close() }} data-lenis-prevent>
          <motion.div ref={box} className="wc-box" role="dialog" aria-modal="true" aria-labelledby="wc-title"
            initial={{ opacity: 0, y: 30, rotate: -2, scale: 0.94 }} animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }} transition={{ duration: 0.45, ease: EASE }}>
            <button type="button" className="wc-x" onClick={close} aria-label="Close">×</button>
            <p className="wc-caption" id="wc-title">{sales.length || code ? 'Don’t miss it…' : 'Meanwhile…'}</p>

            {sales.length > 0 && (
              <section className="wc-part is-sale">
                {top && <div className="wc-burst" aria-hidden="true"><b>−{top.percent}%</b><small>Sale</small></div>}
                <div className="wc-words">
                  <h2>{top && top.name ? top.name : 'Sale on now'}</h2>
                  <ul>{sales.map((s, i) => <li key={i}>{s.name && sales.length > 1 && <b>{s.name}: </b>}{saleLine(s)}</li>)}</ul>
                  <Go to="/shop">Shop the sale <span className="arrow">→</span></Go>
                </div>
              </section>
            )}

            {code && (
              <section className="wc-part is-code">
                <div className="wc-words">
                  <span className="wc-kicker">A discount for you</span>
                  <h2>{code.text}</h2>
                  <div className="wc-code-row">
                    <button type="button" className="wc-ticket" onClick={copy} title="Copy the code">{code.code}</button>
                    <button type="button" className="btn sm" onClick={useIt} disabled={codeBusy || cart.discount?.code === code.code}>{cart.discount?.code === code.code ? 'In your cart ✓' : codeBusy ? 'One moment…' : 'Add it to my cart'}</button>
                  </div>
                  {codeSaid && <p className="wc-said" role="status">{codeSaid}</p>}
                </div>
              </section>
            )}

            {event && (
              <section className="wc-part is-event">
                {Array.isArray(event.pictures) && event.pictures[0] && <span className="wc-pic"><img src={asset(event.pictures[0])} alt="" /></span>}
                <div className="wc-words">
                  <span className="wc-kicker">Meet {brand.artist ? brand.artist.split(' ')[0] : 'me'} at</span>
                  <h2>{event.name}</h2>
                  <p className="wc-where">{[event.when, event.place, event.role].filter(Boolean).join(' · ')}</p>
                  {event.url && <Go to={event.url} className="btn ghost sm">{event.linkLabel || 'Find out more'} <span className="arrow">↗</span></Go>}
                </div>
              </section>
            )}

            {own && (
              <section className="wc-part is-own">
                <div className="wc-words">
                  <h2>{own.title}</h2>
                  {own.text && <p>{own.text}</p>}
                  {own.button && <Go to={own.url || '/shop'} className="btn sm">{own.button} <span className="arrow">→</span></Go>}
                </div>
              </section>
            )}

            <button type="button" className="wc-later" onClick={close}>Maybe later</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
