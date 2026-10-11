import { createHmac, timingSafeEqual } from 'node:crypto'
import { db, dbReady } from './_db.js'
import { awardOrderPoints, takeOrderPoints } from './_points.js'
import { codeUsed, numberOrder, ours, paidWithOf, piecesNow, readBought, recordOrder, shapeAddress, stripeCodes, takeFromCart, tellAdmin, tellBuyer, withPiece } from './_orders.js'
import { siteUrl } from './_users.js'
import { ofStripe, paidByStripe, refundedByStripe } from './_commissions.js'

/* Stripe tells the site here when something happens to a payment, so the order lands in the
   database (and so in the buyer's account) whether or not they come back to the site.

   Set up in Stripe: Developers → Webhooks → Add endpoint → https://<the site>/api/stripe-webhook,
   with the events checkout.session.completed, checkout.session.async_payment_succeeded and
   charge.refunded. Stripe then shows a signing secret (whsec_...): that is STRIPE_WEBHOOK_SECRET.

   Every message is checked against that secret before anything is believed; anything else is
   turned away. The message is read as it arrived (byte for byte), which the check needs. */
const TOLERANCE = 5 * 60

const rawBody = async (req) => {
  if (typeof req.rawBody === 'string' || Buffer.isBuffer(req.rawBody)) return Buffer.from(req.rawBody)
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export const signedByStripe = (raw, header, secret, now = Math.floor(Date.now() / 1000)) => {
  const parts = String(header || '').split(',').map((p) => p.split('='))
  const t = Number((parts.find(([k]) => k === 't') || [])[1])
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !sigs.length || Math.abs(now - t) > TOLERANCE) return false
  const want = createHmac('sha256', secret).update(`${t}.${raw.toString('utf8')}`).digest()
  return sigs.some((s) => { const got = Buffer.from(s, 'hex'); return got.length === want.length && timingSafeEqual(got, want) })
}

const stripe = async (path) => {
  const answer = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } })
  return answer.ok ? answer.json() : null
}

/* A commission paid by card: how it was paid (card brand and last four), then the commission is
   marked paid and both sides are emailed (api/_commissions.js), once however often Stripe says so. */
export const commissionPaid = async (o, req) => {
  const piId = typeof o.payment_intent === 'string' ? o.payment_intent : (o.payment_intent && o.payment_intent.id) || ''
  const payment = piId ? await stripe(`payment_intents/${piId}?expand[]=latest_charge`) : null
  const charge = payment && payment.latest_charge && typeof payment.latest_charge === 'object' ? payment.latest_charge : null
  return paidByStripe(o, { paidWith: (charge && paidWithOf(charge.payment_method_details)) || (o.amount_total === 0 ? 'Free, with a code' : 'Card'), pi: piId, site: siteUrl(req) })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Stripe sends POST.' })
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !process.env.STRIPE_SECRET_KEY || !dbReady()) return res.status(503).json({ message: 'STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY and MONGODB_URI must be set.' })
  const raw = await rawBody(req)
  if (!signedByStripe(raw, req.headers['stripe-signature'], secret)) return res.status(400).json({ message: 'Signature check failed.' })
  let event
  try { event = JSON.parse(raw.toString('utf8')) } catch { return res.status(400).json({ message: 'Not JSON.' }) }

  try {
    const o = event.data && event.data.object
    // a checkout of another site sharing the Stripe account is none of this site's business
    const paidCheckout = (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && o && (o.payment_status === 'paid' || o.payment_status === 'no_payment_required') && ours(o) // a 100% code: nothing to pay, still an order
    // a commission's payment (api/commissions.js): the commission is marked paid, and it is never a shop order
    if (paidCheckout && ofStripe(o)) await commissionPaid(o, req)
    else if (paidCheckout) {
      const lines = await stripe(`checkout/sessions/${o.id}/line_items?limit=100`)
      const ship = (o.collected_information && o.collected_information.shipping_details) || o.shipping_details || null
      const who = o.customer_details || {}
      const userId = /^u_[a-f0-9]{24}$/.test(String(o.client_reference_id || '')) ? o.client_reference_id : null
      // how it was paid (card brand and last four, or the wallet)
      const piId = typeof o.payment_intent === 'string' ? o.payment_intent : (o.payment_intent && o.payment_intent.id) || ''
      const payment = piId ? await stripe(`payment_intents/${piId}?expand[]=latest_charge`) : null
      const charge = payment && payment.latest_charge && typeof payment.latest_charge === 'object' ? payment.latest_charge : null
      // the discount code on it: the one the cart sent (metadata), or else the promotion code Stripe applied
      let usedCode = (o.metadata && (o.metadata.code || o.metadata.discount)) || ''
      try {
        const promo = Array.isArray(o.discounts) && o.discounts.find((x) => x && x.promotion_code)
        if (!usedCode && promo) { const p = await stripeCodes(`promotion_codes/${typeof promo.promotion_code === 'string' ? promo.promotion_code : promo.promotion_code.id}`); usedCode = p.ok ? p.said.code : '' }
      } catch (e) { console.error('discount code not read:', e.message) }
      usedCode = String(usedCode || '').toUpperCase()
      await recordOrder({
        ref: o.id,
        provider: 'stripe',
        pi: piId,
        paidWith: (charge && paidWithOf(charge.payment_method_details)) || (o.amount_total === 0 ? 'Free, with a code' : 'Card'),
        userId,
        email: String(who.email || '').toLowerCase(),
        name: who.name || (ship && ship.name) || '',
        phone: who.phone || '',
        address: ship && ship.address ? shapeAddress(ship.address, ship.name) : null,
        // each line at its price before any discount (the discount is its own line), with its piece kept on it
        items: lines && Array.isArray(lines.data) ? (() => { const pieces = piecesNow(); return lines.data.map((l) => withPiece({ name: l.description, qty: l.quantity || 1, amount: (l.amount_subtotal ?? l.amount_total ?? 0) / 100 }, pieces)) })() : [],
        amount: (o.amount_total || 0) / 100,
        discount: ((o.total_details && o.total_details.amount_discount) || 0) / 100,
        currency: String(o.currency || '').toUpperCase(),
        summary: (o.metadata && o.metadata.order) || '',
        discountCode: usedCode,
        status: 'paid',
        test: !o.livemode,
        createdAt: new Date((o.created || Date.now() / 1000) * 1000),
      })
      // its order number (a member's carries their member number), then the artist and the buyer
      // hear of it by email (once each, however often Stripe sends this)
      try { await numberOrder(o.id) } catch (e) { console.error('order not numbered:', e.message) }
      try { await awardOrderPoints(o.id) } catch (e) { console.error('points not given:', e.message) }
      try { await tellAdmin(o.id, siteUrl(req)) } catch (e) { console.error('order email not sent:', e.message) }
      try { await tellBuyer(o.id, siteUrl(req)) } catch (e) { console.error('buyer email not sent:', e.message) }
      // paid: what was bought leaves the buyer's saved cart, even if they never come back to the site
      await takeFromCart(userId, readBought(o.metadata && o.metadata.bought))
      // a reward code shows as used in its owner's account (Stripe counts the use itself)
      if (usedCode) { try { await codeUsed({ code: usedCode, viaPaypal: false, userId, ref: o.id }) } catch (e) { console.error('code use not noted:', e.message) } }
    }
    if (event.type === 'charge.refunded' && o && o.payment_intent && o.refunded) {
      await (await db()).collection('orders').updateOne({ pi: o.payment_intent }, { $set: { status: 'refunded', updatedAt: new Date() } })
      try { await takeOrderPoints({ pi: o.payment_intent }) } catch (e) { console.error('points not taken back:', e.message) }
      await refundedByStripe(o.payment_intent)
    }
    return res.status(200).json({ received: true })
  } catch (e) {
    console.error('stripe webhook:', e && e.message)
    return res.status(500).json({ message: 'Could not save it; Stripe will try again.' })
  }
}
