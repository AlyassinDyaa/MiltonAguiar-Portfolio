import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { asset, brand, commissions, nav, shop, shows, social } from '../data/site'
import { useCart } from '../hooks/useCart'
import Wordmark from './Wordmark'
import ThemeSwitch from './ThemeSwitch'

function Status() {
  return <><i className={commissions.open ? 'on' : ''} />{commissions.open ? 'Commissions open' : 'Commissions closed'}</>
}

/* The two cart icons the admin can choose between (Shop and payments). */
const BAG = 'M5 8.5h14l-1.1 11.6a1.2 1.2 0 0 1-1.2 1.1H7.3a1.2 1.2 0 0 1-1.2-1.1z M9 10.5V7a3 3 0 0 1 6 0v3.5'
const TROLLEY = 'M2.5 4h2.6l2.3 10.6a1.2 1.2 0 0 0 1.2.9h8.6a1.2 1.2 0 0 0 1.2-.9L20.5 8H6 M9.5 18.1a1.4 1.4 0 1 0 0 2.800 1.4 1.4 0 0 0 0-2.800z M17 18.1a1.4 1.4 0 1 0 0 2.800 1.4 1.4 0 0 0 0-2.800z'

export default function Nav() {
  const cart = useCart()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24)
    on(); window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    window.__lenis?.[open ? 'stop' : 'start']?.()
  }, [open])
  const hire = shows('pages', 'commissions')

  return (
    <>
      <header className={`nav ${scrolled ? 'scrolled' : ''} ${open ? 'is-open' : ''}`}>
        <div className="container nav-bar">
          <Link to="/" className="brand" aria-label={`${brand.name} home`} onClick={() => setOpen(false)}>
            {brand.logo && <img className="brand-logo" src={asset(brand.logo)} alt="" width="44" height="44" />}
            <Wordmark />
          </Link>
          <nav className="nav-links" aria-label="Main">
            {nav.map((n) => <NavLink key={n.to} to={n.to} end className={({ isActive }) => `nav-link ${isActive ? 'on' : ''}`}>{n.label}</NavLink>)}
          </nav>
          {hire && <Link className="nav-status" to="/commissions"><Status /></Link>}
          <ThemeSwitch />
          {shop.enabled && (
            <button type="button" className="nav-cart" onClick={() => { setOpen(false); cart.setOpen(true) }} aria-label={`Cart, ${cart.count} ${cart.count === 1 ? 'piece' : 'pieces'}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={shop.cartIcon === 'cart' ? TROLLEY : BAG} /></svg>
              {cart.count > 0 && <span key={cart.count} className="nav-cart-count">{cart.count}</span>}
            </button>
          )}
          <button className={`burger ${open ? 'open' : ''}`} aria-expanded={open} aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            <span /><span />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div className="menu" initial={{ clipPath: 'circle(0% at calc(100% - 44px) 37px)' }} animate={{ clipPath: 'circle(150% at calc(100% - 44px) 37px)' }} exit={{ clipPath: 'circle(0% at calc(100% - 44px) 37px)' }} transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}>
            <div className="container menu-inner">
              <ul className="menu-links">
                {nav.map((n, i) => (
                  <motion.li key={n.to} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.12 + i * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                    <NavLink to={n.to} end onClick={() => setOpen(false)}>{n.label}</NavLink>
                  </motion.li>
                ))}
              </ul>
              <div className="menu-foot">
                {hire && <span className="nav-status"><Status /></span>}
                <ul>{social.map((s) => <li key={s.label}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>)}</ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
