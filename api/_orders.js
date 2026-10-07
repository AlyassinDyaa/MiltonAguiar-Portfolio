import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db, dbReady } from './_db.js'

/* Orders in the database, so a buyer's account can show them (the leading underscore keeps Vercel
   from serving this file). Each is kept under `ref`: the Stripe checkout's id (cs_...), or "pp_"
   and the PayPal order's id. Stripe orders arrive through api/stripe-webhook.js once paid; PayPal
   orders are written when the checkout opens (pending) and filled in when the payment is taken.

   Where an order is up to (Sales → Orders in the admin: the stage, the tracking number) is copied
   here each time the admin saves it, and that is what the buyer sees in their account. */
export { dbReady }

const text = (v, max = 200) => String(v ?? '').trim().slice(0, max)
export const STAGES = ['new', 'packed', 'shipped', 'delivered', 'cancelled']
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
  await (await db()).collection('orders').updateOne(match, { $set: { track: { status: STAGES.includes(track.status) ? track.status : 'new', tracking: text(track.tracking), note: text(track.note, 480), at: new Date().toISOString() }, updatedAt: new Date() } })
}

// a tracking number written as a web address is a link the buyer can follow
const linkOf = (t) => (/^https?:\/\/\S+$/i.test(t) ? t : '')

// one order as its buyer sees it (no admin notes, no payment ids)
export const forCustomer = (o) => {
  const t = o.track || {}
  const tracking = text(t.tracking)
  return {
    number: String(o.ref || '').replace(/^(cs_(test|live)_|pp_)/, '').slice(-8).toUpperCase(),
    createdAt: o.createdAt,
    provider: o.provider,
    paidWith: paidWithLabel(o),
    status: o.status === 'refunded' ? 'refunded' : o.status === 'pending' ? 'pending' : STAGES.includes(t.status) ? t.status : 'new',
    items: Array.isArray(o.items) ? o.items.map((i) => ({ name: text(i.name, 200), qty: i.qty || 1, amount: i.amount })) : [],
    amount: o.amount,
    discount: o.discount || 0,
    currency: o.currency || 'EUR',
    address: o.address || null,
    tracking: linkOf(tracking) ? '' : tracking,
    trackUrl: linkOf(tracking),
  }
}
