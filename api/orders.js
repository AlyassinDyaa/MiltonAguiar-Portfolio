import { configured, goodPass } from './_session.js'
import { db, dbReady } from './_db.js'
import { describeItem, ours, paidWithOf, piecesNow, setTrack } from './_orders.js'

/* The shop's orders, for the admin (Sales → Orders and Customers). There is no database: every
   purchase is a Stripe checkout, so this reads them from Stripe with STRIPE_SECRET_KEY, and keeps
   what the admin adds to an order (where it is up to, a tracking number, a note of their own) in
   the metadata of its Stripe payment.

   GET  answers { orders: [...] }, newest first, every completed checkout and the unfinished ones.
   POST { paymentIntent, fulfilment, tracking, note } saves those three on the order.
   POST { action: 'hide', orders: [{ id, paymentIntent }] } deletes orders: they are erased from the
        database (and so from the buyer's account). Stripe never lets a payment be deleted, so there
        the order is marked (ma_hidden) and left out.
   Both need the admin's pass, the same one the admin saves content with.

   With the database set up (MONGODB_URI, for customer accounts), PayPal orders are listed too
   (they are kept there, with ids that start "pp_"), and every save is copied to the database,
   which is what the buyer sees in their account. */
export const STAGES = ['new', 'packed', 'shipped', 'delivered', 'cancelled']
const MAX_PAGES = 5 // 500 checkouts; older ones stay in the Stripe dashboard
const testKey = () => /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY || '')
const post = (fields) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() })
const listSessions = async () => {
  const all = []
  let after = ''
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({ limit: '100' })
    ;['data.line_items', 'data.payment_intent.latest_charge'].forEach((x) => q.append('expand[]', x))
    if (after) q.set('starting_after', after)
    const got = await stripe(`checkout/sessions?${q}`)
    all.push(...got.data)
    if (!got.has_more || !got.data.length) break
    after = got.data[got.data.length - 1].id
  }
  return all
}
const hidden = (s) => (s.metadata && s.metadata.ma_hidden === '1') || (s.payment_intent && typeof s.payment_intent === 'object' && (s.payment_intent.metadata || {}).ma_hidden === '1')
/* Mark one order as taken off the lists: on its payment, or (a checkout never paid) on the checkout. */
const hide = async ({ id, paymentIntent }) => {
  if (/^pi_[A-Za-z0-9]+$/.test(String(paymentIntent || ''))) return stripe(`payment_intents/${paymentIntent}`, post({ 'metadata[ma_hidden]': '1' }))
  if (/^cs_[A-Za-z0-9_]+$/.test(String(id || ''))) return stripe(`checkout/sessions/${id}`, post({ 'metadata[ma_hidden]': '1' }))
  throw Object.assign(new Error('not an order'), { status: 400 })
}

const stripe = async (path, init = {}) => {
  const answer = await fetch(`https://api.stripe.com/v1/${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(init.headers || {}) } })
  const said = await answer.json().catch(() => ({}))
  if (!answer.ok) throw Object.assign(new Error((said.error && said.error.message) || `Stripe answered ${answer.status}`), { status: answer.status })
  return said
}

const address = (a) => (a ? [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.state, a.country].filter(Boolean) : [])

/* One checkout, as the admin reads it. */
const order = (s) => {
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null
  const charge = pi && pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null
  const meta = (pi && pi.metadata) || {}
  const ship = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || null
  const who = s.customer_details || {}
  const refunded = charge ? (charge.amount_refunded || 0) / 100 : 0
  const paid = s.payment_status === 'paid' || s.payment_status === 'no_payment_required'
  return {
    id: s.id,
    test: !s.livemode,
    number: s.id.slice(-8).toUpperCase(),
    created: s.created * 1000,
    currency: String(s.currency || 'eur').toUpperCase(),
    total: (s.amount_total || 0) / 100,
    refunded,
    payment: !paid ? (s.status === 'expired' ? 'expired' : 'unpaid') : charge && charge.refunded ? 'refunded' : refunded > 0 ? 'part-refunded' : 'paid',
    name: (ship && ship.name) || who.name || '',
    email: who.email || '',
    phone: who.phone || '',
    country: ((ship && ship.address) || who.address || {}).country || '',
    shipTo: address(ship && ship.address),
    items: ((s.line_items && s.line_items.data) || []).map((l) => ({ name: l.description || '', qty: l.quantity || 1, total: (l.amount_total || 0) / 100 })),
    summary: (s.metadata && s.metadata.order) || '',
    discount: (s.total_details && s.total_details.amount_discount || 0) / 100,
    discountCode: (s.metadata && s.metadata.discount) || '',
    fulfilment: STAGES.includes(meta.fulfilment) ? meta.fulfilment : 'new',
    tracking: meta.tracking || '',
    note: meta.admin_note || '',
    paymentIntent: pi ? pi.id : '',
    paidWith: (charge && paidWithOf(charge.payment_method_details)) || (paid ? 'Card' : ''),
    stripe: pi ? `https://dashboard.stripe.com/${s.livemode ? '' : 'test/'}payments/${pi.id}` : `https://dashboard.stripe.com/${s.livemode ? '' : 'test/'}checkout/sessions/${s.id}`,
  }
}

/* A PayPal order from the database, in the same shape as a Stripe one. */
const saved = (o) => {
  const t = o.track || {}
  const a = o.address
  return {
    id: o.ref,
    provider: 'paypal',
    test: Boolean(o.test),
    number: String(o.ref).replace(/^pp_/, '').slice(-8).toUpperCase(),
    created: new Date(o.createdAt).getTime(),
    currency: String(o.currency || 'EUR').toUpperCase(),
    total: Number(o.amount) || 0,
    refunded: o.status === 'refunded' ? Number(o.amount) || 0 : 0,
    payment: o.status === 'refunded' ? 'refunded' : 'paid',
    name: o.name || (a && a.name) || '',
    email: o.email || '',
    phone: o.phone || '',
    country: (a && a.country) || '',
    shipTo: address(a),
    items: (o.items || []).map((i) => ({ name: i.name || '', qty: i.qty || 1, total: Number(i.amount) || 0 })),
    summary: o.summary || '',
    discount: Number(o.discount) || 0,
    discountCode: o.discountCode || '',
    fulfilment: STAGES.includes(t.status) ? t.status : 'new',
    tracking: t.tracking || '',
    note: t.note || '',
    paymentIntent: '',
    paidWith: 'PayPal',
    stripe: o.captureId ? `https://www.${o.test ? 'sandbox.' : ''}paypal.com/activity/payment/${o.captureId}` : '',
  }
}
const paypalOrders = async () => {
  if (!dbReady()) return []
  try {
    const list = await (await db()).collection('orders').find({ provider: 'paypal', status: { $in: ['paid', 'refunded'] }, hidden: { $ne: true } }).sort({ createdAt: -1 }).limit(500).toArray()
    return list.map(saved)
  } catch (e) { console.error('paypal orders not read:', e.message); return [] }
}

/* The work itself, without the login check (the local preview calls this directly). */
export async function orders({ method, body }) {
  const b0 = body && typeof body === 'object' ? body : {}
  // without Stripe, the database alone can still answer for PayPal orders
  if (!process.env.STRIPE_SECRET_KEY && dbReady()) {
    if (method === 'GET') { const pieces = piecesNow(); return { status: 200, json: { mode: 'test', orders: (await paypalOrders()).map((o) => ({ ...o, items: o.items.map((i) => ({ ...i, ...describeItem(i.name, pieces) })) })) } } }
    if (method === 'POST' && (b0.action === 'hide' || /^pp_/.test(String(b0.id || '')))) return paypalOnly(b0)
  }
  if (!process.env.STRIPE_SECRET_KEY) return { status: 503, json: { code: 'no-stripe', message: 'Stripe is not connected yet: add STRIPE_SECRET_KEY in the Vercel project settings. Orders appear here once it is.' } }
  try {
    if (method === 'GET') {
      const all = await listSessions()
      // a checkout still open (the buyer is on the payment page, or left it) is not an order yet
      // this site's checkouts only: a Stripe sandbox shared with another site keeps their orders apart
      const list = all.filter((s) => ours(s) && !hidden(s) && (s.status !== 'open' || s.payment_status === 'paid')).map(order)
      list.push(...await paypalOrders())
      list.sort((x, y) => y.created - x.created)
      // each line with its piece: picture, size, signed or not, type, category, universe
      const pieces = piecesNow()
      for (const o of list) o.items = o.items.map((i) => ({ ...i, ...describeItem(i.name, pieces) }))
      return { status: 200, json: { mode: testKey() ? 'test' : 'live', orders: list } }
    }
    if (method === 'POST') {
      const b = body && typeof body === 'object' ? body : {}
      if (b.action === 'hide') {
        const list = (Array.isArray(b.orders) ? b.orders : []).slice(0, 200)
        let done = 0
        for (const o of list) {
          try {
            // erased from the database, so it leaves the buyer's account too (orders, count, pictures);
            // Stripe never deletes a payment, so there the payment is only marked
            if (/^pp_[A-Z0-9]+$/.test(String(o.id || ''))) { await (await db()).collection('orders').deleteOne({ ref: o.id }) } else {
              await hide(o)
              if (dbReady() && /^cs_[A-Za-z0-9_]+$/.test(String(o.id || ''))) { try { await (await db()).collection('orders').deleteOne({ ref: o.id }) } catch (e) { console.error('not erased from the database:', e.message) } }
            }
            done++
          } catch (e) { console.error('hide order:', e.message) }
        }
        return { status: done || !list.length ? 200 : 502, json: { hidden: done, failed: list.length - done, message: done ? '' : 'Stripe would not take that order off the list. Try again in a moment.' } }
      }
      if (/^pp_[A-Z0-9]+$/.test(String(b.id || ''))) return paypalOnly(b)
      if (!/^pi_[A-Za-z0-9]+$/.test(String(b.paymentIntent || ''))) return { status: 400, json: { message: 'That order has no payment to save to.' } }
      if (!STAGES.includes(b.fulfilment)) return { status: 400, json: { message: 'Unknown order status.' } }
      const form = new URLSearchParams()
      form.set('metadata[fulfilment]', b.fulfilment)
      form.set('metadata[tracking]', String(b.tracking || '').slice(0, 200))
      form.set('metadata[admin_note]', String(b.note || '').slice(0, 480))
      await stripe(`payment_intents/${b.paymentIntent}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() })
      // the buyer's account shows it too
      if (/^cs_[A-Za-z0-9_]+$/.test(String(b.id || ''))) { try { await setTrack({ ref: b.id }, { status: b.fulfilment, tracking: b.tracking, note: b.note }) } catch (e) { console.error('tracking not copied to the database:', e.message) } }
      return { status: 200, json: { ok: true } }
    }
    return { status: 405, json: { message: 'GET or POST only.' } }
  } catch (e) {
    console.error('orders:', e.message) // for the Vercel log
    return { status: 502, json: { message: e.status === 401 ? 'Stripe did not accept the key in STRIPE_SECRET_KEY.' : 'Could not reach Stripe. Try again in a moment.' } }
  }
}

/* Saving or hiding PayPal orders, which live in the database only. */
async function paypalOnly(b) {
  if (!dbReady()) return { status: 503, json: { message: 'The database is not set up.' } }
  const orders = (await db()).collection('orders')
  if (b.action === 'hide') {
    const refs = (Array.isArray(b.orders) ? b.orders : []).map((o) => String((o && o.id) || '')).filter((r) => /^pp_[A-Z0-9]+$/.test(r))
    if (refs.length) await orders.deleteMany({ ref: { $in: refs } })
    return { status: 200, json: { hidden: refs.length, failed: 0 } }
  }
  if (!STAGES.includes(b.fulfilment)) return { status: 400, json: { message: 'Unknown order status.' } }
  await setTrack({ ref: String(b.id) }, { status: b.fulfilment, tracking: String(b.tracking || '').slice(0, 200), note: String(b.note || '').slice(0, 480) })
  return { status: 200, json: { ok: true } }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!configured()) return res.status(500).json({ message: 'ADMIN_PASSCODE and GITHUB_TOKEN are not set in the Vercel project settings.' })
  const pass = String(req.headers.authorization || '').replace(/^(token|bearer)\s+/i, '')
  if (!goodPass(pass)) return res.status(401).json({ message: 'Your login has run out. Sign out of the admin and sign in again.' })
  const { status, json } = await orders({ method: req.method, body: req.body })
  return res.status(status).json(json)
}
