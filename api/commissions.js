import { adminOk } from './_session.js'
import { accountsMode } from './_buyer.js'
import { SITE } from './_orders.js'
import { clean, currentUser, fromThisSite, newId, noteTry, siteUrl, tooMany } from './_users.js'
import {
  SETTINGS, STATUS_WORDS, WORK_STAGES, cents, cleanLinks, cleanText, closePending, col, dbReady, dueWords, forAdmin, forCustomer, isOpen, isPaid, kinds,
  addMessage, mailArtistMessage, mailArtistRequest, mailCustomer, message, nextNumber, noteMailed, paidByPaypal, paypal, paypalSandbox, price, quoteBox,
  commissionsOpen, shopSettings, stripe, titleFrom,
} from './_commissions.js'

/* Commissions, for the customer and for the admin. One function for all of it (Vercel's plan
   allows 12), chosen by `action`, always POST. What is kept is described in api/_commissions.js.

   The customer (logged in; customer accounts must be on):
     { action: 'request', kind, idea, refs, size, budget, due }   a new commission; the artist is emailed
                                                                 (only while commissions are open)
     { action: 'list' }                                          theirs, newest first
     { action: 'get', id }                                       one, with its thread (marks it read)
     { action: 'message', id, text, links }                      a message to the artist
     { action: 'pay', id, provider: 'card' | 'paypal' }          accept the quote: answers { url } of the payment page
     { action: 'capture', id, order }                            back from PayPal: the payment is taken
     { action: 'cancel', id }                                    while it is not paid
   The admin (Sales → Orders → Commissions; their pass, or localhost on this computer):
     { action: 'adminList' }  { action: 'adminGet', id }  { action: 'adminMessage', id, text, links }
     { action: 'adminQuote', id, price, includes, due, ship }
     { action: 'adminStage', id, status: sketch | inks | colours | delivered | cancelled, note }
     { action: 'adminDelete', id }
   Stripe's payments arrive through api/stripe-webhook.js (metadata kind = commission), which marks
   the commission paid and never records it as a shop order. */
const ID = /^c_[a-f0-9]{24}$/
const say = (res, status, body) => res.status(status).json(body)
const origin = (req) => `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`
const back = (req, id, extra = '') => `${origin(req)}/account?tab=orders&view=commissions&c=${encodeURIComponent(id)}${extra}`

/* ---------- the admin ---------- */
const adminAction = async (req, action, body) => {
  const c = await col()
  const site = siteUrl(req)
  if (action === 'adminList') {
    const list = await c.find({}).sort({ updatedAt: -1 }).limit(1000).toArray()
    return [200, { commissions: list.map((x) => forAdmin(x)), stages: WORK_STAGES, settings: { currency: SETTINGS.currency, ship: SETTINGS.shipByDefault } }]
  }
  const id = String(body.id || '')
  if (!ID.test(id)) return [400, { message: 'Which commission?' }]
  const found = await c.findOne({ _id: id })
  if (!found) return [404, { message: 'That commission is not there any more.' }]

  if (action === 'adminGet') {
    if (found.unread && found.unread.artist) await c.updateOne({ _id: id }, { $set: { 'unread.artist': 0 } })
    return [200, { commission: forAdmin({ ...found, unread: { ...(found.unread || {}), artist: 0 } }, true) }]
  }

  if (action === 'adminMessage') {
    const textValue = cleanText(body.text)
    const links = cleanLinks(body.links)
    if (!textValue && !links.length) return [400, { message: 'Write something first.' }]
    if ((found.messages || []).length >= SETTINGS.maxMessages) return [409, { message: 'This conversation is full. Carry on by email.' }]
    const msg = message('artist', textValue, links)
    const { after, quiet } = await addMessage(id, msg, { forSide: 'customer', set: found.status === 'requested' ? { status: 'discussing' } : {} })
    if (!quiet) {
      await mailCustomer(after, site, {
        subject: `A message about your commission ${after.number}`,
        title: 'A message from Milton',
        lines: [`About "${after.title}":`, ...(textValue ? textValue.split(/\n{2,}/) : []), ...(links.length ? [`Links: ${links.join(' ')}`] : [])],
        label: 'Answer in your account',
      })
      await noteMailed(id, 'customer')
    }
    return [200, { commission: forAdmin({ ...after, unread: { ...(after.unread || {}), artist: 0 } }, true) }]
  }

  if (action === 'adminQuote') {
    if (isPaid(found)) return [409, { message: 'It is paid already: the quote cannot change.' }]
    if (found.status === 'cancelled') return [409, { message: 'It was cancelled. Nothing to quote.' }]
    const amount = Math.round((Number(body.price) || 0) * 100) / 100
    if (!(amount >= 1) || amount > 100000) return [400, { message: 'Put a price between 1 and 100000.', field: 'price' }]
    const includes = cleanText(body.includes, 1000)
    if (!includes) return [400, { message: 'Say what the price includes.', field: 'includes' }]
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(body.due || '')) ? String(body.due) : ''
    const quote = { price: amount, currency: SETTINGS.currency, includes, due, ship: Boolean(body.ship), at: new Date() }
    // a checkout already opened at the old price is closed first
    await closePending(found)
    const note = message('system', `Quote: ${price(amount)} · ${includes}${due ? ` · ready by ${dueWords(due)}` : ''} · ${quote.ship ? 'posted to you' : 'digital'}`)
    const { after } = await addMessage(id, note, { forSide: 'customer', set: { quote, status: 'quoted', pending: null } })
    await mailCustomer(after, site, {
      subject: `Your commission quote is ready: ${after.number}`,
      kicker: 'Your quote',
      title: 'Your commission quote is ready',
      lines: [`Here is the quote for "${after.title}". Accept it and pay from your account, and the work starts. Questions first? Answer there, or reply to this email.`],
      orders: [quoteBox(after)],
      label: 'See the quote',
    })
    await noteMailed(id, 'customer')
    return [200, { commission: forAdmin({ ...after, unread: { ...(after.unread || {}), artist: 0 } }, true) }]
  }

  if (action === 'adminStage') {
    const status = String(body.status || '')
    if (!WORK_STAGES.includes(status)) return [400, { message: 'Unknown stage.' }]
    if (status !== 'cancelled' && !isPaid(found)) return [409, { message: 'It is not paid yet: the work stages start once it is.' }]
    if (status === found.status) return [409, { message: `It is at ${STATUS_WORDS[status]} already.` }]
    const note = cleanText(body.note, 2000)
    const words = { sketch: 'The sketch is under way', inks: 'On to the inks', colours: 'On to the colours', delivered: 'Delivered', cancelled: 'Cancelled by the artist' }
    if (status === 'cancelled') await closePending(found)
    const { after } = await addMessage(id, message('system', `${words[status]}${note ? `: ${note}` : '.'}`), { forSide: 'customer', set: { status, ...(status === 'cancelled' ? { pending: null } : {}) } })
    const lines = {
      sketch: 'Milton has started the sketch of your commission.',
      inks: 'The sketch is done and your commission is being inked.',
      colours: 'The inks are done: your commission is getting its colours.',
      delivered: after.quote && after.quote.ship ? 'Your commission is finished and on its way to you.' : 'Your commission is finished and delivered.',
      cancelled: isPaid(after) ? 'Your commission has been cancelled. Milton will be in touch about the payment.' : 'Your commission has been cancelled.',
    }
    await mailCustomer(after, site, {
      subject: status === 'cancelled' ? `Your commission ${after.number} was cancelled` : `Your commission ${after.number}: ${STATUS_WORDS[status]}`,
      title: status === 'cancelled' ? 'Commission cancelled' : status === 'delivered' ? 'Your commission is done' : `${STATUS_WORDS[status]} under way`,
      lines: [lines[status], ...(note ? [note] : [])],
    })
    await noteMailed(id, 'customer')
    return [200, { commission: forAdmin({ ...after, unread: { ...(after.unread || {}), artist: 0 } }, true) }]
  }

  if (action === 'adminDelete') {
    await closePending(found)
    await c.deleteOne({ _id: id })
    return [200, { deleted: id }]
  }
  return [400, { message: 'Unknown action.' }]
}

/* ---------- the customer ---------- */
const customerAction = async (req, user, action, body) => {
  const c = await col()
  const site = siteUrl(req)

  if (action === 'request') {
    if (!commissionsOpen()) return [403, { closed: true, message: 'Commissions are closed right now, so new requests cannot be sent. Check back soon, or write to Milton.' }]
    if (await tooMany(`commission:${user._id}`, 5, 24 * 60)) return [429, { message: 'You have sent a few requests today already. Add to one of them, or try again tomorrow.' }]
    const idea = cleanText(body.idea, 5000)
    if (idea.length < 2) return [400, { message: 'Tell me the idea.', field: 'idea' }]
    const offered = kinds()
    const kind = offered.includes(String(body.kind || '').trim()) ? String(body.kind).trim() : 'Something else'
    const refs = cleanLinks(body.refs)
    const details = { kind, idea, refs, size: clean(body.size, 120), budget: clean(body.budget, 120), due: clean(body.due, 120) }
    await noteTry(`commission:${user._id}`)
    const now = new Date()
    const doc = {
      _id: newId('c'), number: await nextNumber(user), userId: user._id, email: user.email, name: user.name || '',
      title: clean(body.title, 80) || titleFrom(kind, idea), details, status: 'requested', quote: null,
      messages: [{ from: 'customer', text: idea, links: refs, at: now }], unread: { customer: 0, artist: 1 },
      pending: null, payment: null, createdAt: now, updatedAt: now, mailed: { artist: now },
    }
    await c.insertOne(doc)
    await mailArtistRequest(doc, site)
    return [200, { commission: forCustomer(doc, true) }]
  }

  if (action === 'list') {
    const list = await c.find({ userId: user._id }).sort({ createdAt: -1 }).limit(200).toArray()
    return [200, { commissions: list.map((x) => forCustomer(x)), unread: list.reduce((n, x) => n + ((x.unread && x.unread.customer) || 0), 0) }]
  }

  const id = String(body.id || '')
  if (!ID.test(id)) return [400, { message: 'Which commission?' }]
  const found = await c.findOne({ _id: id, userId: user._id })
  if (!found) return [404, { message: 'That commission is not in your account.' }]

  if (action === 'get') {
    if (found.unread && found.unread.customer) await c.updateOne({ _id: id }, { $set: { 'unread.customer': 0 } })
    return [200, { commission: forCustomer({ ...found, unread: { ...(found.unread || {}), customer: 0 } }, true), payWays: payWays() }]
  }

  if (action === 'message') {
    if (await tooMany(`cmsg:${user._id}`, 40, 60)) return [429, { message: 'That is a lot of messages in an hour. Try again in a little while.' }]
    const textValue = cleanText(body.text)
    const links = cleanLinks(body.links)
    if (!textValue && !links.length) return [400, { message: 'Write something first.' }]
    if ((found.messages || []).length >= SETTINGS.maxMessages) return [409, { message: 'This conversation is full. Carry on by email.' }]
    await noteTry(`cmsg:${user._id}`)
    const msg = message('customer', textValue, links)
    const { after, quiet } = await addMessage(id, msg, { forSide: 'artist', set: found.status === 'requested' ? { status: 'discussing' } : {} })
    if (!quiet) { await mailArtistMessage(after, msg, site); await noteMailed(id, 'artist') }
    return [200, { commission: forCustomer({ ...after, unread: { ...(after.unread || {}), customer: 0 } }, true) }]
  }

  if (action === 'cancel') {
    if (!isOpen(found) || isPaid(found)) return [409, { message: 'It is paid already, so it cannot be cancelled here. Write to Milton about it.' }]
    await closePending(found)
    const msg = message('system', 'Cancelled by the customer.')
    const { after } = await addMessage(id, msg, { forSide: 'artist', set: { status: 'cancelled', pending: null } })
    await mailArtistMessage(after, { text: `${after.name || after.email} cancelled the commission "${after.title}".`, links: [] }, site, 'A commission was cancelled')
    return [200, { commission: forCustomer(after, true) }]
  }

  if (action === 'pay') {
    if (isPaid(found)) return [409, { message: 'It is paid already. Thank you!' }]
    if (found.status !== 'quoted' || !found.quote) return [409, { message: 'There is no quote to pay yet.' }]
    const ways = payWays()
    const q = found.quote
    const name = `Commission ${found.number}: ${found.title}`.slice(0, 250)
    const amount = cents(q.price * SETTINGS.upFront)
    if (body.provider === 'paypal') {
      if (!ways.paypal) return [403, { message: 'PayPal is switched off. Pay by card instead.' }]
      const value = (amount / 100).toFixed(2)
      const order = {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: 'commission', custom_id: id, description: name.slice(0, 127),
          amount: { currency_code: q.currency, value, breakdown: { item_total: { currency_code: q.currency, value } } },
          items: [{ name: name.slice(0, 127), quantity: '1', unit_amount: { currency_code: q.currency, value }, category: q.ship ? 'PHYSICAL_GOODS' : 'DIGITAL_GOODS', sku: found.number, ...(q.includes ? { description: q.includes.slice(0, 127) } : {}) }],
        }],
        payment_source: { paypal: { experience_context: {
          brand_name: 'Milton Aguiar', user_action: 'PAY_NOW', shipping_preference: q.ship ? 'GET_FROM_FILE' : 'NO_SHIPPING',
          return_url: back(req, id, '&paypal=return'), cancel_url: back(req, id),
        } } },
      }
      try {
        const made = await paypal('/v2/checkout/orders', order)
        const go = (made.links || []).find((l) => l.rel === 'payer-action' || l.rel === 'approve')
        if (!go) throw new Error('paypal: no approval link')
        await c.updateOne({ _id: id }, { $set: { pending: { provider: 'paypal', ref: made.id, amount: amount / 100, test: paypalSandbox(), at: new Date() } } })
        return [200, { url: go.href }]
      } catch (e) {
        console.error('commission paypal:', e.message)
        return [e.status === 401 ? 503 : 502, { message: 'PayPal could not be opened. Try again in a moment.' }]
      }
    }
    if (!ways.card) return [403, { message: 'Card payment is switched off. Pay with PayPal instead.' }]
    const ask = new URLSearchParams()
    ask.set('mode', 'payment')
    ask.set('success_url', back(req, id, '&paid=1'))
    ask.set('cancel_url', back(req, id))
    ask.set('line_items[0][quantity]', '1')
    ask.set('line_items[0][price_data][currency]', q.currency.toLowerCase())
    ask.set('line_items[0][price_data][unit_amount]', String(amount))
    ask.set('line_items[0][price_data][product_data][name]', name)
    if (q.includes) ask.set('line_items[0][price_data][product_data][description]', q.includes.slice(0, 500))
    // this site's checkout, and a commission (not a shop order): see api/stripe-webhook.js
    for (const [k, v] of [['site', SITE], ['kind', 'commission'], ['commission', id], ['number', found.number]]) {
      ask.set(`metadata[${k}]`, v)
      ask.set(`payment_intent_data[metadata][${k}]`, v)
    }
    ask.set('client_reference_id', user._id)
    ask.set('customer_email', user.email)
    if (q.ship) {
      const shop = shopSettings()
      const countries = (Array.isArray(shop.countries) ? shop.countries : []).map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x))
      ;(countries.length ? countries : ['PT']).forEach((x, i) => ask.set(`shipping_address_collection[allowed_countries][${i}]`, x))
    }
    try {
      const got = await stripe('checkout/sessions', ask)
      if (!got.ok || !got.said.url) {
        console.error('stripe refused the commission checkout:', got.status, got.said && got.said.error && got.said.error.message)
        return [502, { message: 'The checkout could not be opened. Try again in a moment.' }]
      }
      await c.updateOne({ _id: id }, { $set: { pending: { provider: 'stripe', ref: got.said.id, amount: amount / 100, test: !got.said.livemode, at: new Date() } } })
      return [200, { url: got.said.url }]
    } catch {
      return [502, { message: 'Could not reach the payment service. Try again in a moment.' }]
    }
  }

  if (action === 'capture') {
    // back from PayPal: only the order opened for this quote is taken
    const order = String(body.order || '')
    if (!/^[A-Z0-9]{8,32}$/.test(order)) return [400, { message: 'That is not a PayPal order.' }]
    if (isPaid(found)) return [200, { ok: true, commission: forCustomer(found, true) }] // a reload of the page
    if (!found.pending || found.pending.provider !== 'paypal' || found.pending.ref !== order) return [409, { message: 'That payment is for an older quote. Nothing was charged: open the quote again.' }]
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) return [503, { message: 'PayPal is not set up.' }]
    try {
      const done = await paypal(`/v2/checkout/orders/${order}/capture`)
      if (done.status !== 'COMPLETED') return [502, { message: 'PayPal did not finish the payment. Nothing was charged: try again.' }]
      const after = (await paidByPaypal(id, order, done, site)) || (await c.findOne({ _id: id }))
      return [200, { ok: true, commission: forCustomer(after, true) }]
    } catch (e) {
      if (e.issue === 'ORDER_ALREADY_CAPTURED') return [200, { ok: true, commission: forCustomer((await c.findOne({ _id: id })) || found, true) }]
      console.error('commission paypal capture:', e.message)
      return [502, { message: e.issue === 'INSTRUMENT_DECLINED' ? 'PayPal declined that payment. Try another card or account.' : 'PayPal could not take the payment. Nothing was charged: try again in a moment.' }]
    }
  }
  return [400, { message: 'Nothing to do.' }]
}

// the ways to pay, as Shop → Settings & payments has them, and only those set up
const payWays = () => {
  const p = shopSettings().payments || 'stripe'
  return {
    card: (p === 'stripe' || p === 'both') && Boolean(process.env.STRIPE_SECRET_KEY),
    paypal: (p === 'paypal' || p === 'both') && Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return say(res, 405, { message: 'Use POST.' })
  if (!dbReady()) return say(res, 503, { message: 'Commissions need the database, which is not set up yet.' })
  if (!fromThisSite(req)) return say(res, 403, { message: 'That request did not come from this site.' })
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const action = String(body.action || '')
  try {
    if (action.startsWith('admin')) {
      if (!adminOk(req)) return say(res, 401, { message: 'Your login has run out. Sign out of the admin and sign in again.' })
      return say(res, ...(await adminAction(req, action, body)))
    }
    if (accountsMode() === 'off') return say(res, 403, { message: 'Accounts are switched off, so commissions are asked for by email.' })
    const user = await currentUser(req)
    if (!user) return say(res, 401, { login: true, message: 'Log in or make an account to request a commission.' })
    return say(res, ...(await customerAction(req, user, action, body)))
  } catch (e) {
    console.error('commissions:', e && e.message)
    return say(res, 500, { message: 'Something went wrong on our side. Try again in a moment.' })
  }
}
