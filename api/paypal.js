import { priceCart, takes, read } from './_cart.js'
import { buyer } from './_buyer.js'
import { db, dbReady } from './_db.js'
import { boughtOf, readBought, recordOrder, shapeAddress, takeFromCart } from './_orders.js'

/* Paying with PayPal. Two steps, both POST:
   - the cart (see _cart.js): works out what it costs from the site's own content, asks PayPal for
     an order with a line per piece (and the discount, when a code is used), and answers with the
     address of PayPal's page, where the buyer logs in and approves;
   - { action: 'capture', order }: PayPal sends the buyer back to /shop?paypal=return&token=<order>,
     and the Shop page asks here to take the payment. Only then is the order paid.
   Every price is read on the server, never taken from the browser.

   Needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (from developer.paypal.com → Apps & Credentials)
   in the Vercel project settings, and PAYPAL_ENV = live for real money; anything else (or nothing)
   uses PayPal's sandbox, for testing with sandbox accounts. Nothing is sold unless PayPal is one of
   the ways to pay under Shop → Settings & payments (PayPal or Both).

   With the database set up (MONGODB_URI), every PayPal order is kept there: waiting when PayPal's
   page opens, paid once the payment is taken. That is how it shows in the admin's Orders and,
   for a logged-in buyer, in their account. */
const api = () => (process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')
const money = (cents) => (cents / 100).toFixed(2)
const sandbox = () => process.env.PAYPAL_ENV !== 'live'

/* a PayPal payment taken: the order waiting in the database gets the buyer and the address */
const savePaid = async (id, said) => {
  if (!dbReady()) return
  const unit = (said.purchase_units || [])[0] || {}
  const ship = unit.shipping || {}
  const a = ship.address || null
  const payer = said.payer || {}
  const capture = ((unit.payments || {}).captures || [])[0] || {}
  const before = await (await db()).collection('orders').findOne({ ref: `pp_${id}` })
  await recordOrder({
    ref: `pp_${id}`, provider: 'paypal', paypalId: id, captureId: capture.id || '', status: 'paid',
    email: (before && before.email) || String(payer.email_address || '').toLowerCase(),
    name: (ship.name && ship.name.full_name) || (before && before.name) || [payer.name && payer.name.given_name, payer.name && payer.name.surname].filter(Boolean).join(' '),
    address: a ? shapeAddress({ line1: a.address_line_1, line2: a.address_line_2, city: a.admin_area_2, state: a.admin_area_1, postal_code: a.postal_code, country: a.country_code }, ship.name && ship.name.full_name) : null,
    ...(before ? {} : { amount: Number(capture.amount && capture.amount.value) || 0, currency: (capture.amount && capture.amount.currency_code) || '', items: [], test: sandbox() }),
  })
  // paid: what was bought leaves the buyer's saved cart
  if (before && before.userId) await takeFromCart(before.userId, readBought(before.bought))
}

const token = async () => {
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')
  const r = await fetch(`${api()}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' })
  const said = await r.json().catch(() => ({}))
  if (!r.ok || !said.access_token) throw Object.assign(new Error(`paypal token ${r.status}`), { status: r.status === 401 ? 401 : 502 })
  return said.access_token
}
const paypal = async (path, body) => {
  const r = await fetch(`${api()}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(body || {}) })
  const said = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(`paypal ${path} ${r.status} ${(said.details && said.details[0] && said.details[0].issue) || said.name || ''}`), { status: r.status, issue: said.details && said.details[0] && said.details[0].issue })
  return said
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ message: 'Send the cart with POST.' })
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) return res.status(503).json({ message: 'PayPal is not set up yet. Get in touch to buy a piece.' })
  const body = req.body && typeof req.body === 'object' ? req.body : {}

  // step two: the buyer approved on PayPal's page; take the payment
  if (body.action === 'capture') {
    const id = String(body.order || '')
    if (!/^[A-Z0-9]{8,32}$/.test(id)) return res.status(400).json({ message: 'That is not a PayPal order.' })
    try {
      const done = await paypal(`/v2/checkout/orders/${id}/capture`)
      if (done.status === 'COMPLETED') { try { await savePaid(id, done) } catch (e) { console.error('paypal order not saved:', e.message) } }
      return res.status(200).json({ ok: done.status === 'COMPLETED', status: done.status })
    } catch (e) {
      if (e.issue === 'ORDER_ALREADY_CAPTURED') return res.status(200).json({ ok: true, status: 'COMPLETED' }) // a reload of the thank-you page
      console.error('paypal capture:', e.message)
      return res.status(502).json({ message: e.issue === 'INSTRUMENT_DECLINED' ? 'PayPal declined that payment. Try another card or account.' : 'PayPal could not take the payment. Nothing was charged: try again in a moment.' })
    }
  }

  // step one: an order for the cart
  const cart = await priceCart(body)
  if (cart.error) return res.status(cart.error.status).json({ message: cart.error.message })
  const { shop, lines, name, what, summary, cents, off } = cart
  if (!takes(shop, 'paypal')) return res.status(403).json({ message: 'PayPal is switched off. Pay by card instead.' })
  const { user, mustLogIn } = await buyer(req)
  if (mustLogIn) return res.status(401).json({ login: true, message: 'Log in, or make an account, to buy.' })
  const currency = String(shop.currency || 'eur').toUpperCase()
  const amount = (c) => ({ currency_code: currency, value: money(c) })
  const brand = (read('content/site/brand.json') || {}).name || 'Shop'
  const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`
  const order = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: 'shop',
      custom_id: summary.slice(0, 127),
      description: `${brand} shop`.slice(0, 127),
      amount: { ...amount(cents - off), breakdown: { item_total: amount(cents), ...(off ? { discount: amount(off) } : {}) } },
      items: lines.map((l) => ({ name: name(l).slice(0, 127), quantity: String(l.qty), unit_amount: amount(l.cents), category: shop.shipping !== false ? 'PHYSICAL_GOODS' : 'DIGITAL_GOODS', sku: l.slug.slice(0, 127), ...(what(l) ? { description: String(what(l)).slice(0, 127) } : {}) })),
    }],
    payment_source: { paypal: { experience_context: {
      brand_name: brand.slice(0, 127), user_action: 'PAY_NOW',
      shipping_preference: shop.shipping !== false ? 'GET_FROM_FILE' : 'NO_SHIPPING',
      return_url: `${origin}/shop?paypal=return`, cancel_url: `${origin}/shop`,
    } } },
  }
  try {
    const made = await paypal('/v2/checkout/orders', order)
    const go = (made.links || []).find((l) => l.rel === 'payer-action' || l.rel === 'approve')
    if (!go) throw new Error('paypal: no approval link')
    // kept as waiting until the buyer comes back and the payment is taken
    try {
      await recordOrder({ ref: `pp_${made.id}`, provider: 'paypal', paypalId: made.id, userId: user ? user._id : null, email: user ? user.email : '', name: user ? user.name || '' : '', items: lines.map((l) => ({ name: name(l), qty: l.qty, amount: (l.cents * l.qty) / 100 })), bought: boughtOf(lines), amount: (cents - off) / 100, discount: off / 100, discountCode: cart.deal ? cart.deal.code : '', currency, summary, status: 'pending', test: sandbox() })
    } catch (e) { console.error('paypal order not saved:', e.message) }
    return res.status(200).json({ url: go.href })
  } catch (e) {
    console.error('paypal order:', e.message)
    return res.status(e.status === 401 ? 503 : 502).json({ message: e.status === 401 ? 'PayPal did not accept the shop’s keys. Get in touch to buy a piece.' : 'PayPal could not be opened. Try again in a moment.' })
  }
}
