/* Sample orders for the admin's Sales screens on this computer only (npm run dev), while no
   STRIPE_SECRET_KEY is set here. The live site never uses this file: it reads real orders from
   Stripe (api/orders.js). The screens say clearly that these are samples. Changes made to them
   (status, tracking, note) last until the dev server restarts. */
const PEOPLE = [
  ['Ana Ribeiro', 'ana.ribeiro@example.com', 'PT', ['Rua das Flores 12', '1200-195 Lisboa', 'PT']],
  ['Tom Becker', 'tom.becker@example.com', 'DE', ['Kastanienallee 4', '10435 Berlin', 'DE']],
  ['Jade Martin', 'jade.martin@example.com', 'FR', ['8 rue Oberkampf', '75011 Paris', 'FR']],
  ['Luis Gómez', 'luis.gomez@example.com', 'ES', ['Calle Mayor 21', '28013 Madrid', 'ES']],
  ['Sam Carter', 'sam.carter@example.com', 'GB', ['14 Brick Lane', 'E1 6RF London', 'GB']],
  ['Maya Brooks', 'maya.brooks@example.com', 'US', ['220 Kent Ave', '11249 Brooklyn', 'NY', 'US']],
]
const ITEMS = [
  ['Born Again — A4', 15], ['Born Again — A3', 30], ['Born Again — 50 × 70 cm', 65],
  ['Batman and Robin', 45], ['Raptor — A3', 30], ['Invincible', 8],
]
const STAGES = ['new', 'new', 'packed', 'shipped', 'shipped', 'delivered', 'delivered', 'cancelled']

import { clearSampleDiscounts } from './sample-discounts.js'

let made = null
const make = () => {
  const day = 24 * 60 * 60 * 1000
  const out = []
  for (let i = 0; i < 16; i++) {
    const [name, email, country, shipTo] = PEOPLE[(i * 5) % PEOPLE.length]
    const lines = [ITEMS[(i * 7) % ITEMS.length], ...(i % 3 === 0 ? [ITEMS[(i * 3 + 1) % ITEMS.length]] : [])]
    const items = lines.map(([n, p], k) => ({ name: n, qty: k === 0 && i % 4 === 1 ? 2 : 1, total: p * (k === 0 && i % 4 === 1 ? 2 : 1) }))
    const total = items.reduce((t, x) => t + x.total, 0)
    const payment = i === 6 ? 'refunded' : i === 11 ? 'expired' : 'paid'
    const id = `cs_test_a1${(0x5f3a9c + i * 104729).toString(36).toUpperCase()}${(i * 7919 + 4242).toString(36).toUpperCase()}`
    out.push({
      id, test: true, number: id.slice(-8).toUpperCase(), created: Date.now() - (i * 3.7 + 0.3) * day, currency: 'EUR', total,
      refunded: payment === 'refunded' ? total : 0, payment, name, email, phone: '', country, shipTo,
      items, summary: '', fulfilment: payment === 'paid' ? STAGES[i % STAGES.length] : 'new',
      tracking: i % 4 === 3 ? `CTT-${4821 + i}PT` : '', note: '', discount: i % 5 === 2 ? Math.round(total * 0.1 * 100) / 100 : 0, discountCode: i % 5 === 2 ? 'WELCOME10' : '', paymentIntent: `pi_sample${i}`, stripe: 'https://dashboard.stripe.com/test/payments',
    })
  }
  return out
}

export function sampleOrders({ method, body }) {
  made = made || make()
  if (method === 'GET') return { status: 200, json: { orders: made.filter((o) => !o.hidden), sample: true, mode: 'test' } }
  if (body && body.action === 'hide') {
    const ids = new Set((body.orders || []).map((o) => o.id))
    made.forEach((o) => { if (ids.has(o.id)) o.hidden = true })
    return { status: 200, json: { hidden: ids.size, failed: 0 } }
  }
  if (body && body.action === 'clear-test') {
    const orders = made.filter((o) => !o.hidden).length
    made.forEach((o) => { o.hidden = true })
    return { status: 200, json: { orders, codes: clearSampleDiscounts() } }
  }
  const o = made.find((x) => x.paymentIntent === (body && body.paymentIntent))
  if (!o) return { status: 400, json: { message: 'That order has no payment to save to.' } }
  Object.assign(o, { fulfilment: body.fulfilment, tracking: String(body.tracking || ''), note: String(body.note || '') })
  return { status: 200, json: { ok: true } }
}
