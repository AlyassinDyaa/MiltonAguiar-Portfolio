import { priceCart, takes, read } from './_cart.js'
import { buyer } from './_buyer.js'
import { db, dbReady } from './_db.js'
import { boughtOf, checkCode, codeUsed, numberOrder, piecesNow, readBought, recordOrder, shapeAddress, takeFromCart, tellAdmin, tellBuyer, withPiece } from './_orders.js'
import { siteUrl } from './_users.js'
import { awardOrderPoints } from './_points.js'

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

/* a PayPal payment taken: the order waiting in the database gets the buyer and the address, and
   the artist is emailed (once) */
const savePaid = async (id, said, site = '') => {
  if (!dbReady()) return
  const unit = (said.purchase_units || [])[0] || {}
  const ship = unit.shipping || {}
  const a = ship.address || null
  const payer = said.payer || {}
  const capture = ((unit.payments || {}).captures || [])[0] || {}
  const before = await (await db()).collection('orders').findOne({ ref: `pp_${id}` })
  await recordOrder({
    ref: `pp_${id}`, provider: 'paypal', paypalId: id, captureId: capture.id || '', status: 'paid', paidWith: 'PayPal',
    email: (before && before.email) || String(payer.email_address || '').toLowerCase(),
    name: (ship.name && ship.name.full_name) || (before && before.name) || [payer.name && payer.name.given_name, payer.name && payer.name.surname].filter(Boolean).join(' '),
    address: a ? shapeAddress({ line1: a.address_line_1, line2: a.address_line_2, city: a.admin_area_2, state: a.admin_area_1, postal_code: a.postal_code, country: a.country_code }, ship.name && ship.name.full_name) : null,
    ...(before ? {} : { amount: Number(capture.amount && capture.amount.value) || 0, currency: (capture.amount && capture.amount.currency_code) || '', items: [], test: sandbox() }),
  })
  // paid: what was bought leaves the buyer's saved cart
  if (before && before.userId) await takeFromCart(before.userId, readBought(before.bought))
  // a discount code on it: counted (Stripe does not see PayPal's uses), and a reward code shows as used
  const code = before && before.code
  if (code) { try { await codeUsed({ code, promoId: before.promoId, viaPaypal: true, userId: before.userId, ref: `pp_${id}` }) } catch (e) { console.error('code use not noted:', e.message) } }
  try { await numberOrder(`pp_${id}`) } catch (e) { console.error('order not numbered:', e.message) }
  try { await awardOrderPoints(`pp_${id}`) } catch (e) { console.error('points not given:', e.message) }
  try { await tellAdmin(`pp_${id}`, site) } catch (e) { console.error('order email not sent:', e.message) }
  try { await tellBuyer(`pp_${id}`, site) } catch (e) { console.error('buyer email not sent:', e.message) }
}

const token = async () => {
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')
  const r = await fetch(`${api()}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' })
  const said = await r.json().catch(() => ({}))
  if (!r.ok || !said.access_token) throw Object.assign(new Error(`paypal token ${r.status}`), { status: r.status === 401 ? 401 : 502 })
  return said.access_token
}
const look = async (path) => {
  const r = await fetch(`${api()}${path}`, { headers: { Authorization: `Bearer ${await token()}` } })
  const said = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(`paypal ${path} ${r.status}`), { status: r.status })
  return said
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
      const { user } = await buyer(req)
      /* Checked before the payment is taken: the order is one this shop made and is still waiting,
         PayPal still holds the sum it was made for, the address chosen on PayPal is in the country
         the shipping was worked out for, and a discount code on it has not been used up meanwhile. */
      const before = dbReady() ? await (await db()).collection('orders').findOne({ ref: `pp_${id}` }) : null
      if (dbReady()) {
        if (!before) return res.status(404).json({ message: 'That PayPal order was not made by this shop.' })
        if (before.status === 'paid') return res.status(200).json({ ok: true, status: 'COMPLETED', account: Boolean(user) }) // a reload of the thank-you page
        const seen = await look(`/v2/checkout/orders/${id}`)
        const unit = (seen.purchase_units || [])[0] || {}
        const sum = unit.amount || {}
        if (sum.currency_code !== before.currency || sum.value !== money(Math.round(Number(before.amount) * 100))) return res.status(409).json({ message: 'That PayPal order does not match the cart. Nothing was charged: go back to the cart and pay again.' })
        const went = String((((unit.shipping || {}).address) || {}).country_code || '').toUpperCase()
        if (before.country && went && went !== before.country) return res.status(409).json({ message: `The address picked on PayPal is not in the country the shipping was worked out for. Nothing was charged: in the cart, pick the country it goes to (${went}), then pay again.` })
        if (before.code) {
          try {
            const owner = before.userId ? await (await db()).collection('users').findOne({ _id: before.userId }) : null
            const c = await checkCode(before.code, owner)
            if (!c.ok) return res.status(409).json({ message: `${c.message} Nothing was charged: go back to the cart and pay again.` })
          } catch (e) { console.error('paypal code not checked again:', e.message) }
        }
      }
      const done = await paypal(`/v2/checkout/orders/${id}/capture`)
      // paid only when PayPal says the money is taken, and it is the sum the order was made for
      const capture = (((((done.purchase_units || [])[0] || {}).payments || {}).captures) || [])[0] || {}
      const took = capture.amount || {}
      const right = !before || (took.currency_code === before.currency && took.value === money(Math.round(Number(before.amount) * 100)))
      const paid = done.status === 'COMPLETED' && capture.status === 'COMPLETED' && right
      if (!right) console.error(`paypal ${id}: took ${took.value} ${took.currency_code}, the order was for ${before && before.amount} ${before && before.currency}`)
      if (paid) { try { await savePaid(id, done, siteUrl(req)) } catch (e) { console.error('paypal order not saved:', e.message) } }
      else if (capture.status === 'PENDING') {
        // held by PayPal for a check: kept waiting, marked so it can be found in PayPal
        try { await recordOrder({ ref: `pp_${id}`, captureId: capture.id || '', paypalHeld: true }) } catch { /* kept as it was */ }
        return res.status(200).json({ ok: false, status: 'PENDING', message: 'PayPal is still checking that payment. You will get an email once it goes through.' })
      }
      // logged in: the Shop sends them on to their orders (it need not have checked yet)
      return res.status(200).json({ ok: paid, status: done.status, account: Boolean(user), ...(paid ? {} : { message: 'PayPal did not finish that payment. Get in touch if you were charged.' }) })
    } catch (e) {
      if (e.issue === 'ORDER_ALREADY_CAPTURED') { const { user } = await buyer(req); return res.status(200).json({ ok: true, status: 'COMPLETED', account: Boolean(user) }) } // a reload of the thank-you page
      if (e.status === 404) return res.status(404).json({ message: 'PayPal does not know that order.' })
      console.error('paypal capture:', e.message)
      return res.status(502).json({ message: e.issue === 'INSTRUMENT_DECLINED' ? 'PayPal declined that payment. Try another card or account.' : 'PayPal could not take the payment. Nothing was charged: try again in a moment.' })
    }
  }

  // step one: an order for the cart
  // the logged-in customer first: a reward code in the cart works only for them
  const { user, mustLogIn } = await buyer(req)
  const cart = await priceCart({ ...body, way: 'paypal' }, user)
  if (cart.error) return res.status(cart.error.status).json({ message: cart.error.message, ...(cart.error.code ? { code: true } : {}) })
  const { shop, lines, name, what, summary, deal, currency: payIn, rate, pay, eurPieces } = cart
  // the order in the currency it is paid in (the buyer's, or the shop's own; src/data/currency.js):
  // the pieces, the code's cut, the shipping and the PayPal fee when the admin adds one
  const total = pay.total
  if (!takes(shop, 'paypal')) return res.status(403).json({ message: 'PayPal is switched off. Pay by card instead.' })
  if (mustLogIn) return res.status(401).json({ login: true, message: 'Log in, or make an account, to buy.' })
  const currency = payIn
  const amount = (c) => ({ currency_code: currency, value: money(c) })
  const brand = (read('content/site/brand.json') || {}).name || 'Shop'
  const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`
  const order = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: 'shop',
      custom_id: summary.slice(0, 127),
      description: `${brand} shop`.slice(0, 127),
      amount: { ...amount(total), breakdown: { item_total: amount(pay.items), ...(pay.off ? { discount: amount(pay.off) } : {}), ...(pay.ship ? { shipping: amount(pay.ship) } : {}), ...(pay.fee ? { handling: amount(pay.fee) } : {}) } },
      items: lines.map((l) => ({ name: name(l).slice(0, 127), quantity: String(l.qty), unit_amount: amount(l.pay), category: shop.shipping !== false ? 'PHYSICAL_GOODS' : 'DIGITAL_GOODS', sku: l.slug.slice(0, 127), ...(what(l) ? { description: String(what(l)).slice(0, 127) } : {}) })),
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
    // kept as waiting until the buyer comes back and the payment is taken (each line with its piece kept on it)
    try {
      await recordOrder({ ref: `pp_${made.id}`, provider: 'paypal', paypalId: made.id, userId: user ? user._id : null, email: user ? user.email : '', name: user ? user.name || '' : '', items: (() => { const pieces = piecesNow(); return lines.map((l) => withPiece({ name: name(l), qty: l.qty, amount: (l.pay * l.qty) / 100 }, pieces)) })(), bought: boughtOf(lines), amount: total / 100, discount: pay.off / 100, shipping: pay.ship / 100, country: cart.country || '', fee: pay.fee / 100, rate, eurPieces, discountCode: deal ? deal.code : '', ...(deal ? { code: deal.code, promoId: deal.promoId } : {}), currency, summary, status: 'pending', test: sandbox() })
    } catch (e) { console.error('paypal order not saved:', e.message) }
    return res.status(200).json({ url: go.href })
  } catch (e) {
    console.error('paypal order:', e.message)
    return res.status(e.status === 401 ? 503 : 502).json({ message: e.status === 401 ? 'PayPal did not accept the shop’s keys. Get in touch to buy a piece.' : 'PayPal could not be opened. Try again in a moment.' })
  }
}
