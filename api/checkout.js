import { priceCart, takes } from './_cart.js'
import { buyer } from './_buyer.js'
import { SITE, boughtOf } from './_orders.js'

/* Paying by card, through Stripe. The site sends the cart (see _cart.js); this works out what it
   costs from the site's own content, asks Stripe for one checkout page with a line per piece, and
   answers with that page's address. The buyer pays on Stripe's page: no card details come near
   this site.

   - every price is read on the server (_cart.js), never taken from the browser;
   - a discount code from the cart is checked again and put on the Stripe page, so it charges
     what the cart showed (Stripe's own code box stays off: the Stripe account is shared with
     another site while testing, and its box would take that site's codes too);
   - Stripe is called with STRIPE_SECRET_KEY, which lives only in the Vercel project settings.

   Nothing is sold unless "Online purchases" is switched on in the admin, card payment is one of
   the ways to pay there (Stripe or Both), and the key is set.

   With customer accounts on (Customer accounts, in the same settings), a logged-in buyer's order
   is tied to their account (api/stripe-webhook.js saves it there once paid); with accounts
   required, nobody buys without one. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ message: 'Send the cart with POST.' })
  const key = process.env.STRIPE_SECRET_KEY
  // the logged-in customer first: a reward code in the cart works only for them
  const { user, mustLogIn } = await buyer(req)
  const cart = await priceCart(req.body, user)
  if (cart.error) return res.status(cart.error.status).json({ message: cart.error.message, ...(cart.error.code ? { code: true } : {}) })
  const { shop, lines, deal, name, what, summary } = cart
  if (!takes(shop, 'stripe')) return res.status(403).json({ message: 'Card payment is switched off. Pay with PayPal instead.' })
  if (!key) return res.status(503).json({ message: 'Card payment is not set up yet. Get in touch to buy a piece.' })
  if (mustLogIn) return res.status(401).json({ login: true, message: 'Log in, or make an account, to buy.' })

  const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`
  const ask = new URLSearchParams()
  ask.set('mode', 'payment')
  // paid: a logged-in buyer goes on to the orders in their account; anyone else back to the shop
  ask.set('success_url', user ? `${origin}/account?tab=orders&thanks=1` : `${origin}/shop?thanks=1`)
  ask.set('cancel_url', `${origin}/shop`)
  lines.forEach((l, i) => {
    const at = `line_items[${i}]`
    ask.set(`${at}[quantity]`, String(l.qty))
    ask.set(`${at}[price_data][currency]`, String(shop.currency || 'eur').toLowerCase())
    ask.set(`${at}[price_data][unit_amount]`, String(l.cents))
    ask.set(`${at}[price_data][product_data][name]`, name(l))
    if (what(l)) ask.set(`${at}[price_data][product_data][description]`, String(what(l)).slice(0, 500))
    if (typeof l.piece.src === 'string' && l.piece.src.startsWith('/')) ask.set(`${at}[price_data][product_data][images][0]`, origin + l.piece.src)
  })
  ask.set('metadata[order]', summary.slice(0, 500))
  ask.set('metadata[site]', SITE) // this site's checkout (see api/_orders.js)
  // the code from the cart, applied on Stripe's page; the webhook (api/stripe-webhook.js) and the
  // admin's orders read it back (code, and discount as older orders have it)
  if (deal) {
    ask.set('discounts[0][promotion_code]', deal.promoId)
    ask.set('metadata[code]', deal.code)
    ask.set('metadata[discount]', deal.code)
  }
  // a logged-in buyer: the order is tied to their account (api/stripe-webhook.js reads this back)
  if (user) {
    ask.set('client_reference_id', user._id)
    ask.set('customer_email', user.email)
    // what is bought, so the webhook can take it out of their saved cart (Stripe keeps 500 characters)
    const bought = JSON.stringify(boughtOf(lines))
    if (bought.length <= 500) ask.set('metadata[bought]', bought)
  }
  if (shop.shipping !== false) {
    const countries = (Array.isArray(shop.countries) ? shop.countries : []).map((c) => String(c).trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c))
    ;(countries.length ? countries : ['PT']).forEach((c, i) => ask.set(`shipping_address_collection[allowed_countries][${i}]`, c))
  }

  try {
    const answer = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: ask.toString(),
    })
    const said = await answer.json().catch(() => ({}))
    if (!answer.ok || !said.url) {
      console.error('stripe refused the checkout:', answer.status, said && said.error && said.error.message) // for the Vercel log; the buyer gets the plain message below
      return res.status(502).json({ message: 'The checkout could not be opened. Try again in a moment.' })
    }
    return res.status(200).json({ url: said.url })
  } catch {
    return res.status(502).json({ message: 'Could not reach the payment service. Try again in a moment.' })
  }
}
