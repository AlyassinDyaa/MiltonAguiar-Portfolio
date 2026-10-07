import { priceCart, takes } from './_cart.js'
import { buyer } from './_buyer.js'

/* Paying by card, through Stripe. The site sends the cart (see _cart.js); this works out what it
   costs from the site's own content, asks Stripe for one checkout page with a line per piece, and
   answers with that page's address. The buyer pays on Stripe's page: no card details come near
   this site.

   - every price is read on the server (_cart.js), never taken from the browser;
   - a discount code is checked again and put on the Stripe page; a code given to particular
     people also fixes the email the buyer pays with;
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
  const cart = await priceCart(req.body)
  if (cart.error) return res.status(cart.error.status).json({ message: cart.error.message })
  const { shop, lines, deal, name, what, summary } = cart
  if (!takes(shop, 'stripe')) return res.status(403).json({ message: 'Card payment is switched off. Pay with PayPal instead.' })
  if (!key) return res.status(503).json({ message: 'Card payment is not set up yet. Get in touch to buy a piece.' })
  const { user, mustLogIn } = await buyer(req)
  if (mustLogIn) return res.status(401).json({ login: true, message: 'Log in, or make an account, to buy.' })

  const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`
  const ask = new URLSearchParams()
  ask.set('mode', 'payment')
  ask.set('success_url', `${origin}/shop?thanks=1`)
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
  if (deal) {
    ask.set('discounts[0][coupon]', deal.code)
    ask.set('metadata[discount]', deal.code)
    if (deal.email) ask.set('customer_email', deal.email)
  }
  // a logged-in buyer: the order is tied to their account (api/stripe-webhook.js reads this back)
  if (user) {
    ask.set('client_reference_id', user._id)
    if (!deal || !deal.email) ask.set('customer_email', user.email)
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
