import { configured, goodPass } from './_session.js'

/* The shop's orders, for the admin (Sales → Orders and Customers). There is no database: every
   purchase is a Stripe checkout, so this reads them from Stripe with STRIPE_SECRET_KEY, and keeps
   what the admin adds to an order (where it is up to, a tracking number, a note of their own) in
   the metadata of its Stripe payment.

   GET  answers { orders: [...] }, newest first, every completed checkout and the unfinished ones.
   POST { paymentIntent, fulfilment, tracking, note } saves those three on the order.
   Both need the admin's pass, the same one the admin saves content with. */
export const STAGES = ['new', 'packed', 'shipped', 'delivered', 'cancelled']
const MAX_PAGES = 5 // 500 checkouts; older ones stay in the Stripe dashboard

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
    fulfilment: STAGES.includes(meta.fulfilment) ? meta.fulfilment : 'new',
    tracking: meta.tracking || '',
    note: meta.admin_note || '',
    paymentIntent: pi ? pi.id : '',
    stripe: pi ? `https://dashboard.stripe.com/${s.livemode ? '' : 'test/'}payments/${pi.id}` : `https://dashboard.stripe.com/${s.livemode ? '' : 'test/'}checkout/sessions/${s.id}`,
  }
}

/* The work itself, without the login check (the local preview calls this directly). */
export async function orders({ method, body }) {
  if (!process.env.STRIPE_SECRET_KEY) return { status: 503, json: { code: 'no-stripe', message: 'Stripe is not connected yet: add STRIPE_SECRET_KEY in the Vercel project settings. Orders appear here once it is.' } }
  try {
    if (method === 'GET') {
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
      // a checkout still open (the buyer is on the payment page, or left it) is not an order yet
      return { status: 200, json: { orders: all.filter((s) => s.status !== 'open' || s.payment_status === 'paid').map(order) } }
    }
    if (method === 'POST') {
      const b = body && typeof body === 'object' ? body : {}
      if (!/^pi_[A-Za-z0-9]+$/.test(String(b.paymentIntent || ''))) return { status: 400, json: { message: 'That order has no payment to save to.' } }
      if (!STAGES.includes(b.fulfilment)) return { status: 400, json: { message: 'Unknown order status.' } }
      const form = new URLSearchParams()
      form.set('metadata[fulfilment]', b.fulfilment)
      form.set('metadata[tracking]', String(b.tracking || '').slice(0, 200))
      form.set('metadata[admin_note]', String(b.note || '').slice(0, 480))
      await stripe(`payment_intents/${b.paymentIntent}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() })
      return { status: 200, json: { ok: true } }
    }
    return { status: 405, json: { message: 'GET or POST only.' } }
  } catch (e) {
    console.error('orders:', e.message) // for the Vercel log
    return { status: 502, json: { message: e.status === 401 ? 'Stripe did not accept the key in STRIPE_SECRET_KEY.' : 'Could not reach Stripe. Try again in a moment.' } }
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!configured()) return res.status(500).json({ message: 'ADMIN_PASSCODE and GITHUB_TOKEN are not set in the Vercel project settings.' })
  const pass = String(req.headers.authorization || '').replace(/^(token|bearer)\s+/i, '')
  if (!goodPass(pass)) return res.status(401).json({ message: 'Your login has run out. Sign out of the admin and sign in again.' })
  const { status, json } = await orders({ method: req.method, body: req.body })
  return res.status(status).json(json)
}
