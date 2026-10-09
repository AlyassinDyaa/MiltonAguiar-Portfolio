import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db, dbReady } from './_db.js'
import { artistInbox, sendMail } from './_users.js'

/* Orders in the database, so a buyer's account can show them (the leading underscore keeps Vercel
   from serving this file). Each is kept under `ref`: the Stripe checkout's id (cs_...), or "pp_"
   and the PayPal order's id. Stripe orders arrive through api/stripe-webhook.js once paid; PayPal
   orders are written when the checkout opens (pending) and filled in when the payment is taken.

   Where an order is up to (Sales → Orders in the admin: the stage, the tracking number) is copied
   here each time the admin saves it, and that is what the buyer sees in their account. */
export { dbReady }

const text = (v, max = 200) => String(v ?? '').trim().slice(0, max)
export const STAGES = ['new', 'packed', 'shipped', 'delivered', 'cancelled']
// the carriers the admin picks from, and the page where a parcel is followed (the same list as public/admin/sales.js)
export const CARRIERS = {
  ctt: ['CTT', (n) => `https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=${n}`],
  dpd: ['DPD', (n) => `https://tracking.dpd.de/status/en_US/parcel/${n}`],
  dhl: ['DHL', (n) => `https://www.dhl.com/pt-en/home/tracking.html?tracking-id=${n}`],
  ups: ['UPS', (n) => `https://www.ups.com/track?tracknum=${n}`],
  gls: ['GLS', (n) => `https://gls-group.com/PT/en/parcel-tracking?match=${n}`],
  fedex: ['FedEx', (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}`],
  correos: ['Correos', (n) => `https://www.correos.es/es/en/tools/tracker/items/details?tracking-number=${n}`],
  royalmail: ['Royal Mail', (n) => `https://www.royalmail.com/track-your-item#/tracking-results/${n}`],
  usps: ['USPS', (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`],
  other: ['Another carrier', null],
}
export const shapeAddress = (a, name) => (a ? { name: text(name), line1: text(a.line1), line2: text(a.line2), city: text(a.city), state: text(a.state), postal_code: text(a.postal_code), country: text(a.country, 2) } : null)

/* This site's own Stripe checkouts carry metadata site = SITE, so a Stripe account shared with
   another site (a sandbox used for both while testing) never mixes their orders. */
export const SITE = 'miltonaguiar'
export const ours = (session) => Boolean(session && session.metadata && session.metadata.site === SITE)

/* What was bought, line by line, as [slug, size, signed 1/0]: kept with the checkout so that, once
   the payment is in, those lines leave the buyer's saved cart (and are never paid for twice). */
export const boughtOf = (lines) => lines.map((l) => [l.slug, l.size || '', l.signed ? 1 : 0])
export const readBought = (v) => {
  try { const list = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(list) ? list.filter((b) => Array.isArray(b) && typeof b[0] === 'string').slice(0, 50) : [] } catch { return [] }
}
export const takeFromCart = async (userId, bought) => {
  if (!dbReady() || !userId || !bought.length) return
  const users = (await db()).collection('users')
  const u = await users.findOne({ _id: userId })
  if (!u || !Array.isArray(u.cart)) return
  const gone = (l) => bought.some(([slug, size, signed]) => l.slug === slug && (l.size || '') === String(size || '') && Boolean(l.signed) === Boolean(signed))
  const cart = u.cart.filter((l) => !gone(l))
  if (cart.length !== u.cart.length) await users.updateOne({ _id: userId }, { $set: { cart } })
}

/* What an order line is, read back from its name ("Born Again — A3 (signed)"): the piece it is
   (the longest title it starts with), its size, signed or not, and the piece's type, category,
   universe and picture from the site's content. Works for every order, old ones too. */
export const piecesNow = () => {
  try {
    const dir = join(process.cwd(), 'content/work')
    return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
      try { return { slug: f.slice(0, -5), ...JSON.parse(readFileSync(join(dir, f), 'utf8')) } } catch { return null }
    }).filter((p) => p && p.title).sort((a, b) => String(b.title).length - String(a.title).length)
  } catch { return [] }
}
export const describeItem = (name, pieces) => {
  const full = String(name || '')
  const piece = pieces.find((p) => full.startsWith(p.title))
  if (!piece) return {}
  const signedMark = full.match(/\s\((signed|unsigned)\)$/)
  const rest = full.slice(piece.title.length).replace(/\s\((signed|unsigned)\)$/, '')
  const size = rest.replace(/^\s*[—·-]\s*/, '').trim()
  return {
    slug: piece.slug, title: piece.title, size,
    signed: signedMark ? signedMark[1] === 'signed' : null,
    type: text(piece.type, 80), category: text(piece.category, 80), universe: text(piece.universe, 80),
    src: typeof piece.src === 'string' && piece.src.startsWith('/') ? piece.src : '',
  }
}

/* How it was paid, in words: "Visa •••• 4242", "Apple Pay · Visa •••• 4242", "PayPal", "MB Way".
   From a Stripe charge's payment_method_details; PayPal orders simply say PayPal. */
const BRANDS = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover', diners: 'Diners', jcb: 'JCB', unionpay: 'UnionPay', cartes_bancaires: 'Cartes Bancaires' }
const WALLETS = { apple_pay: 'Apple Pay', google_pay: 'Google Pay', samsung_pay: 'Samsung Pay', link: 'Link' }
const words = (k) => String(k || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
export const paidWithOf = (details) => {
  if (!details || !details.type) return ''
  if (details.type === 'card' && details.card) {
    const c = details.card
    const card = `${BRANDS[c.brand] || words(c.brand) || 'Card'}${c.last4 ? ` •••• ${c.last4}` : ''}`
    const wallet = c.wallet && c.wallet.type ? WALLETS[c.wallet.type] || words(c.wallet.type) : ''
    return text(wallet ? `${wallet} · ${card}` : card, 60)
  }
  return text({ paypal: 'PayPal', link: 'Link', mb_way: 'MB Way', multibanco: 'Multibanco', ideal: 'iDEAL', bancontact: 'Bancontact', sepa_debit: 'SEPA debit', klarna: 'Klarna' }[details.type] || words(details.type), 60)
}
const paidWithLabel = (o) => o.paidWith || (o.provider === 'paypal' ? 'PayPal' : o.provider === 'stripe' ? 'Card' : '')

/* An order line with its piece kept on it (slug, title, picture, size, signed, type), so the order
   still shows the piece after it is taken off the site. */
export const withPiece = (item, pieces = piecesNow()) => {
  const d = describeItem(item.name, pieces)
  return d.slug ? { ...item, slug: d.slug, title: d.title, src: d.src, size: d.size, signed: d.signed, type: d.type } : item
}

/* A paid order, told to the artist by email, once (however often Stripe or PayPal says so): who
   bought, what, the discount code, where it goes, how it was paid, and a button to Sales → Orders.
   Sent to ORDER_EMAIL_TO, else the artist's inbox (CONTACT_TO, else the contact email in the admin,
   else the address the site sends from). */
/* ---------- order numbers: a member's orders carry their member number, then which order of theirs
   it is (member 3's first order is 0003-01, the next 0003-02); an order without an account is
   G-0001, G-0002... Given once, when the order is paid (a refunded one too), and kept: deleting an
   order never renumbers the others. A member's older orders without a number get theirs first,
   oldest first, so their numbers follow the order they were placed in. */
const pad = (n, w) => String(n).padStart(w, '0')
const after = (got) => (got && got.value !== undefined && got.ok !== undefined ? got.value : got) // older drivers wrap the document
const NUMBERED = ['paid', 'refunded']
// the buyer's account: the one they were logged in to, else one with the same (confirmed) email
const ownerOf = async (d, o) => {
  const users = d.collection('users')
  return (o.userId && await users.findOne({ _id: o.userId })) || (o.email ? await users.findOne({ email: String(o.email).toLowerCase(), verified: true }) : null)
}
/* The member's next order number. A member number freed by a deleted account can be given again,
   and that account's orders keep their numbers: the new member's count starts after them. */
const nextMemberOrder = async (d, u) => {
  const users = d.collection('users')
  const head = pad(u.memberNo, 4)
  if (!u.orderSeq) {
    const taken = await d.collection('orders').find({ orderNo: { $in: Array.from({ length: 999 }, (_, i) => `${head}-${pad(i + 1, 2)}`) } }).limit(1000).toArray()
    const top = taken.reduce((n, o) => Math.max(n, Number(String(o.orderNo).split('-')[1]) || 0), 0)
    if (top) await users.updateOne({ _id: u._id, orderSeq: { $exists: false } }, { $set: { orderSeq: top } })
  }
  const doc = after(await users.findOneAndUpdate({ _id: u._id }, { $inc: { orderSeq: 1 } }, { returnDocument: 'after' }))
  return `${head}-${pad((doc && doc.orderSeq) || 1, 2)}`
}
// every order of this member without a number gets the next ones, oldest first
export const numberMember = async (d, u) => {
  if (!u || !u.memberNo) return
  const orders = d.collection('orders')
  const match = u.verified ? { $or: [{ userId: u._id }, { email: u.email }] } : { userId: u._id }
  const list = (await orders.find({ ...match, status: { $in: NUMBERED }, orderNo: { $exists: false } }).limit(500).toArray())
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  for (const o of list) {
    const no = await nextMemberOrder(d, (await d.collection('users').findOne({ _id: u._id })) || u)
    // should two calls race, the first number given stays
    await orders.updateOne({ ref: o.ref, orderNo: { $exists: false } }, { $set: { orderNo: no } })
  }
}
export const numberOrder = async (ref) => {
  if (!dbReady()) return ''
  const d = await db()
  const orders = d.collection('orders')
  const o = await orders.findOne({ ref })
  if (!o) return ''
  if (o.orderNo) return o.orderNo
  if (!NUMBERED.includes(o.status)) return ''
  const u = await ownerOf(d, o)
  if (u && u.memberNo) await numberMember(d, u)
  else {
    const doc = after(await d.collection('counters').findOneAndUpdate({ _id: 'guestOrders' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' }))
    await orders.updateOne({ ref, orderNo: { $exists: false } }, { $set: { orderNo: `G-${pad((doc && doc.seq) || 1, 4)}` } })
  }
  const now = await orders.findOne({ ref })
  return (now && now.orderNo) || ''
}
// the number an order shows: its order number, or (from before) the end of the payment's id
export const numberOf = (o) => o.orderNo || String(o.ref || '').replace(/^(cs_(test|live)_|pp_)/, '').slice(-8).toUpperCase()

/* ---------- the buyer's email for a paid order (once, however often the payment is reported):
   the order number, what they bought, the discount, the total, how it was paid and where it goes.
   If it cannot be sent, it is tried again the next time Stripe or PayPal reports the payment. */
export const tellBuyer = async (ref, site) => {
  if (!dbReady()) return
  const d = await db()
  const orders = d.collection('orders')
  const order = after(await orders.findOneAndUpdate({ ref, status: 'paid', buyerTold: { $ne: true }, email: { $exists: true, $ne: '' } }, { $set: { buyerTold: true } }))
  if (!order || !order.email) return
  const cur = order.currency || 'EUR'
  const price = (n) => { try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol', minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 }).format(Number(n) || 0) } catch { return `${n} ${cur}` } }
  // the account the order shows in (an account not confirmed yet only shows orders placed in it)
  const member = await ownerOf(d, order)
  // an account with this email, not confirmed yet: the order shows there once it is
  const unconfirmed = !member && await d.collection('users').findOne({ email: String(order.email).toLowerCase() })
  const no = order.orderNo || numberOf(order)
  const first = String(order.name || (member && member.name) || '').split(' ')[0]
  const a = order.address
  const code = order.discountCode || order.code || ''
  const home = String(site || '').replace(/\/$/, '')
  const when = new Date(order.createdAt || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const untold = () => orders.updateOne({ ref }, { $unset: { buyerTold: '' } })
  try {
    const sent = await sendMail({
      to: order.email,
      subject: `Your Milton Aguiar order ${no}`,
      kicker: 'Thank you',
      title: `Order ${no} received`,
      lines: [
        `Hi${first ? ` ${first}` : ''},`,
        'Thank you for your order. Every piece is checked and packed by hand before it leaves the studio.',
        member ? 'You can follow it in your account, from packing to your door, with the tracking number once it is posted.'
          : unconfirmed ? 'Confirm the email address of your account and you can follow it there, from packing to your door, with the tracking number once it is posted.'
            : 'Make an account with this email address and you can follow it there, from packing to your door, with the tracking number once it is posted.',
      ],
      orders: [{
        title: `Order ${no}`,
        sub: when,
        rows: [
          ...(order.items || []).map((i) => [`${i.qty > 1 ? `${i.qty} × ` : ''}${i.name}`, i.amount != null ? price(i.amount) : '']),
          ...(order.discount > 0 ? [[`Discount${code ? ` (${code})` : ''}`, `−${price(order.discount)}`]] : []),
        ],
        total: price(order.amount),
        foot: [order.amount > 0 ? `Paid by ${order.paidWith || (order.provider === 'paypal' ? 'PayPal' : 'card')}` : 'Free, with a code', a ? `Posting to ${[a.name, a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.country].filter(Boolean).join(', ')}` : ''].filter(Boolean).join(' · '),
      }],
      button: member ? { label: 'See your order', url: `${home}/account?tab=orders` } : unconfirmed ? { label: 'Open your account', url: `${home}/account` } : { label: 'Make an account', url: `${home}/account/signup` },
      after: 'Questions about your order? Just reply to this email.',
      replyTo: artistInbox() || undefined,
    })
    if (!sent) await untold()
  } catch (e) { console.error('buyer email not sent:', e.message); await untold() }
}

export const tellAdmin = async (ref, site) => {
  if (!dbReady()) return
  const got = await (await db()).collection('orders').findOneAndUpdate({ ref, status: 'paid', adminTold: { $ne: true } }, { $set: { adminTold: true } })
  const order = got && got.value !== undefined && got.ok !== undefined ? got.value : got // older drivers wrap the document
  if (!order) return
  const to = process.env.ORDER_EMAIL_TO || artistInbox()
  if (!to) return
  const cur = order.currency || 'EUR'
  const price = (n) => { try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol', minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 }).format(Number(n) || 0) } catch { return `${n} ${cur}` } }
  const a = order.address
  const items = (order.items || []).map((i) => `${i.qty > 1 ? `${i.qty} × ` : ''}${i.name}${i.amount != null ? `, ${price(i.amount)}` : ''}`)
  const code = order.discountCode || order.code || ''
  try {
    await sendMail({
      to,
      subject: `New order ${numberOf(order)}: ${price(order.amount)}${order.name ? ` from ${order.name}` : ''}${order.test ? ' (test)' : ''}`,
      kicker: 'New order',
      title: order.amount > 0 ? `${price(order.amount)} paid` : 'A free order',
      lines: [
        `${order.name || 'Someone'}${order.email ? ` (${order.email})` : ''} ${order.amount > 0 ? `paid ${price(order.amount)} by ${order.paidWith || (order.provider === 'paypal' ? 'PayPal' : 'card')}` : 'ordered for free, with a discount code'}${order.test ? ' (a test)' : ''}.`,
        ...(items.length ? ['What they bought:', ...items] : []),
        ...(order.discount > 0 ? [`Discount: −${price(order.discount)}${code ? ` (code ${code})` : ''}`] : []),
        ...(a ? [`Post to: ${[a.name, a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.state, a.country].filter(Boolean).join(', ')}`] : []),
        ...(order.phone ? [`Phone: ${order.phone}`] : []),
      ],
      button: { label: 'Open orders', url: `${String(site || '').replace(/\/$/, '')}/admin/#/sales/orders` },
      after: 'Mark it packed and shipped in Sales → Orders: the buyer sees each step, and the tracking number, in their account.',
    })
  } catch (e) { console.error('order email not sent:', e.message) }
}

// a new order, or more about one (where it is up to, once the admin has set it, is kept)
export const recordOrder = async (order) => {
  if (!dbReady()) return
  const { track, createdAt, ...rest } = order
  await (await db()).collection('orders').updateOne(
    { ref: order.ref },
    { $set: { ...rest, updatedAt: new Date() }, $setOnInsert: { createdAt: createdAt || new Date(), track: track || { status: 'new', tracking: '', note: '', at: '' } } },
    { upsert: true },
  )
}

// where an order is up to: { status, tracking, note }; the note is the admin's own, never shown to the buyer
export const setTrack = async (match, track) => {
  if (!dbReady()) return
  await (await db()).collection('orders').updateOne(match, { $set: { track: { status: STAGES.includes(track.status) ? track.status : 'new', carrier: CARRIERS[track.carrier] ? track.carrier : '', tracking: text(track.tracking), note: text(track.note, 480), at: new Date().toISOString() }, updatedAt: new Date() } })
}

// a tracking number written as a web address is a link the buyer can follow
const linkOf = (t) => (/^https?:\/\/\S+$/i.test(t) ? t : '')

// one order as its buyer sees it (no admin notes, no payment ids)
export const forCustomer = (o) => {
  const t = o.track || {}
  const tracking = text(t.tracking)
  const c = CARRIERS[t.carrier]
  const byCarrier = c && c[1] && tracking && !linkOf(tracking) ? c[1](encodeURIComponent(tracking)) : ''
  return {
    number: numberOf(o),
    createdAt: o.createdAt,
    provider: o.provider,
    paidWith: paidWithLabel(o),
    status: o.status === 'refunded' ? 'refunded' : o.status === 'pending' ? 'pending' : STAGES.includes(t.status) ? t.status : 'new',
    items: Array.isArray(o.items) ? o.items.map((i) => ({ name: text(i.name, 200), qty: i.qty || 1, amount: i.amount, slug: i.slug || '', title: i.title || '', src: i.src || '' })) : [],
    amount: o.amount,
    discount: o.discount || 0,
    currency: o.currency || 'EUR',
    address: o.address || null,
    carrier: c ? c[0] : '',
    tracking: linkOf(tracking) ? '' : tracking,
    trackUrl: linkOf(tracking) || byCarrier,
  }
}

/* ---------- discount codes at the checkout
   Codes are made in Stripe as promotion codes (the admin's Discounts screen, and rewards), so
   Stripe knows each one: its percentage, its end date, how many uses it allows and how many it has
   had. A buyer types a code into the cart: it is checked here, the cart shows the new total, and
   the payment is taken for exactly that (Stripe applies the code to its own page; PayPal is sent
   the discount). Stripe counts its own uses; a use through PayPal is counted in the database
   (codeUses), and a code that has had all its uses is switched off in Stripe. A reward code can only
   be used by the customer it was made for, and once used it shows as used in their account.
   The Stripe account is shared with another site while testing, so only codes this site made
   (metadata ma = 1) ever count, and Stripe's own code box is never shown on its payment page. */
const STRIPE_VERSION = '2024-06-20' // promotion codes changed shape in later versions: this one is always asked for
export const stripeCodes = async (path, init = {}) => {
  const answer = await fetch(`https://api.stripe.com/v1/${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Stripe-Version': STRIPE_VERSION, ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) } })
  const said = await answer.json().catch(() => ({}))
  return { ok: answer.ok, status: answer.status, said }
}
export const tidyCode = (v) => String(v || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 40)
// uses through PayPal, which Stripe does not know about
export const usesHere = async (code) => (dbReady() ? (await db()).collection('codeUses').countDocuments({ code }) : 0)
// the discount a percentage takes off a total in cents, rounded as Stripe rounds it
export const discountCents = (totalCents, percent) => Math.round((totalCents * percent) / 100)
/* Whether a code can be used now, by this buyer (the logged-in customer, or null):
   { ok: true, code, percent, label, promoId, max, reward } or { ok: false, message }. */
export const checkCode = async (raw, user) => {
  const code = tidyCode(raw)
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return { ok: false, message: 'That does not look like a discount code.' }
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, message: 'Discount codes cannot be checked right now.' }
  const got = await stripeCodes(`promotion_codes?code=${encodeURIComponent(code)}&limit=10`)
  const p = got.ok && Array.isArray(got.said.data) ? got.said.data.find((x) => String(x.code).toUpperCase() === code && x.metadata && x.metadata.ma === '1') : null
  const nope = { ok: false, message: 'That code is not valid.' }
  if (!p || p.metadata.ma_hidden === '1') return nope
  const coupon = p.coupon || {}
  const now = Math.floor(Date.now() / 1000)
  if (!p.active || coupon.valid === false) return { ok: false, message: 'That code has been used up or switched off.' }
  if ((p.expires_at && p.expires_at < now) || (coupon.redeem_by && coupon.redeem_by < now)) return { ok: false, message: 'That code has run out.' }
  if (!(coupon.percent_off > 0)) return nope
  if (p.max_redemptions && (p.times_redeemed || 0) + (await usesHere(code)) >= p.max_redemptions) return { ok: false, message: 'That code has been used up.' }
  // a reward is the customer's own: they need to be logged in to that account
  if (p.metadata.reward && p.metadata.email && (!user || user.email !== p.metadata.email)) return { ok: false, message: 'That code is a reward for another account. Log in to the account it was given to.' }
  return { ok: true, code, percent: coupon.percent_off, label: coupon.name || `${coupon.percent_off}% off`, promoId: p.id, max: p.max_redemptions || null, reward: p.metadata.reward || '' }
}
/* A code was used on a paid order. Through PayPal it is counted here (Stripe counts its own; one
   count per order, however often this is called), and switched off once it has had all its uses.
   A reward code, or a code the admin gave them (users.giftCodes), is marked used in its owner's account. */
export const codeUsed = async ({ code, promoId, viaPaypal, userId, ref }) => {
  if (!code || !dbReady()) return
  const d = await db()
  if (viaPaypal) {
    await d.collection('codeUses').updateOne({ ref }, { $setOnInsert: { ref, code, at: new Date() } }, { upsert: true })
    if (promoId && process.env.STRIPE_SECRET_KEY) {
      const got = await stripeCodes(`promotion_codes/${promoId}`)
      const max = got.ok ? got.said.max_redemptions : null
      if (max && (got.said.times_redeemed || 0) + (await usesHere(code)) >= max) await stripeCodes(`promotion_codes/${promoId}`, { method: 'POST', body: 'active=false' })
    }
  }
  if (userId) {
    const u = await d.collection('users').findOne({ _id: userId }, { projection: { rewardCodes: 1, giftCodes: 1 } })
    const at = new Date().toISOString()
    const entry = u && u.rewardCodes && Object.entries(u.rewardCodes).find(([, v]) => v && v.code === code)
    if (entry && !entry[1].usedAt) await d.collection('users').updateOne({ _id: userId }, { $set: { [`rewardCodes.${entry[0]}.usedAt`]: at } })
    if (u && Array.isArray(u.giftCodes) && u.giftCodes.some((g) => g && g.code === code && !g.usedAt)) {
      await d.collection('users').updateOne({ _id: userId }, { $set: { giftCodes: u.giftCodes.map((g) => (g && g.code === code && !g.usedAt ? { ...g, usedAt: at } : g)) } })
    }
  }
}
