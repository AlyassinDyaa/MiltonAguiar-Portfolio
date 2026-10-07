import { useEffect, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useLenis } from './hooks/useLenis'
import { applyBrandHue } from './hooks/useHue'
import { brand, previewing, shop, shows } from './data/site'
import { useReducedMotion } from './hooks/useMedia'
import Preloader from './components/Preloader'
import Nav from './components/Nav'
import Footer from './components/Footer'
import CartDrawer from './components/CartDrawer'
import { CartProvider } from './hooks/useCart'
import { AccountProvider, accountsWanted } from './hooks/useAccount'
import Account from './pages/Account'
import Home from './pages/Home'
import Work from './pages/Work'
import Shop from './pages/Shop'
import Gallery from './pages/Gallery'
import Commissions from './pages/Commissions'
import About from './pages/About'
import Contact from './pages/Contact'
import NotFound from './pages/NotFound'

export default function App() {
  const loc = useLocation()
  // the account's own pages (log in, make an account...) count as one page: moving between them does not turn the page
  const page = loc.pathname.startsWith('/account') ? '/account' : loc.pathname
  const reduced = useReducedMotion()
  const [ready, setReady] = useState(false)
  useLenis(!reduced)
  useEffect(applyBrandHue, [])
  // what search engines and link previews say about the site: the blurb from "Name, colour and contact" in the admin
  useEffect(() => { if (brand.blurb) document.querySelector('meta[name="description"]')?.setAttribute('content', brand.blurb) }, [])
  return (
    <AccountProvider>
    <CartProvider>
      <Preloader onDone={() => setReady(true)} />
      <Nav />
      {/* Between routes three panels rise across the screen, one after the other, and carry on
          up and out: ink, the brand colour, ink (not on arrival: the opening sheet has just done that job) */}
      <AnimatePresence>
        {ready && !reduced && loc.key !== 'default' && (
          <div key={page} className="turn" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <motion.i key={i} initial={{ y: '101%' }} animate={{ y: ['101%', '0%', '0%', '-101%'] }} transition={{ duration: 0.85, times: [0, 0.42, 0.52, 1], delay: i * 0.07, ease: [0.76, 0, 0.24, 1] }} />
            ))}
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <Routes location={loc} key={page}>
          <Route path="/" element={<Home />} />
          {/* a page the admin has hidden has no route, so its address shows "not found" */}
          {shows('pages', 'work') && <Route path="/work" element={<Work />} />}
          {shop.enabled && shows('pages', 'shop') && <Route path="/shop" element={<Shop />} />}
          {shows('pages', 'gallery') && <Route path="/gallery" element={<Gallery />} />}
          {shows('pages', 'commissions') && <Route path="/commissions" element={<Commissions />} />}
          {shows('pages', 'about') && <Route path="/about" element={<About />} />}
          {shows('pages', 'contact') && <Route path="/contact" element={<Contact />} />}
          {/* customer accounts, when the admin has them on (Shop → Settings and payments → Customer accounts) */}
          {accountsWanted() && <Route path="/account/*" element={<Account />} />}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AnimatePresence>
      <Footer />
      <CartDrawer />
      {previewing && <div className="fresh-note" role="status">Admin view: showing your latest saved changes. Visitors see them in about a minute.</div>}
    </CartProvider>
    </AccountProvider>
  )
}
