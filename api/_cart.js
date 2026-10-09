import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkCode, discountCents } from './_orders.js'
import { priceWith, readSales, saleFor } from '../src/data/sales.js'

/* What a cart costs, worked out on the server from the site's own content (a leading underscore
   keeps Vercel from serving this file). Shared by the two ways to pay, Stripe (checkout.js) and
   PayPal (paypal.js), so both always charge the same.

   The site sends the cart as { items: [{ slug, size, signed, qty }], code } (or a single piece as
   { slug, size, signed }). Every price, sale price, size price and signature extra is read here,
   never taken from the browser, and a discount code is checked again against Stripe, for the
   buyer paying (a reward code works only for the customer it was made for).

   Shop sales (Shop → Sales, content/site/sales.json) come off here by the same rule the site
   shows them with (src/data/sales.js): the biggest live sale on a piece, or its own sale price
   if that is lower. A discount code then comes off the total, as before. */
export const read = (path) => { try { return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) } catch { return null } }
const MAX_LINES = 20
const MAX_QTY = 10

/* How the shop takes payment: 'stripe', 'paypal' or 'both' (Shop -> Settings & payments). */
export const takes = (shop, way) => { const p = shop.payments || 'stripe'; return p === 'both' || p === way }

/* Answers { error: { status, message, code? } } or { shop, lines, deal, choice, name(l), what(l), summary, cents, off }.
   `user` is the logged-in customer (or null); deal is { code, percent, label, promoId } or null.
   error.code is true when the discount code is the trouble: the cart then drops it. */
export async function priceCart(body, user = null) {
  const no = (status, message, extra = {}) => ({ error: { status, message, ...extra } })
  const shop = read('content/site/shop.json') || {}
  if (!shop.enabled) return no(403, 'Online purchases are switched off at the moment.')
  const b = body && typeof body === 'object' ? body : {}
  const asked = Array.isArray(b.items) ? b.items : [{ slug: b.slug, size: b.size, signed: b.signed, qty: 1 }]
  if (!asked.length) return no(400, 'The cart is empty.')
  if (asked.length > MAX_LINES) return no(400, `At most ${MAX_LINES} different pieces in one order.`)

  // signed or unsigned: only while the admin offers the choice; the extra for signing is read here too
  const choice = Boolean(shop.signedChoice)
  const extra = Math.max(0, Number(shop.signedExtra) || 0)
  // what the buyer gets: the line written beside the piece's type, or the shop's own line
  const typeNote = (type) => { const t = (Array.isArray(shop.types) ? shop.types : []).find((x) => x && String(x.name).trim() === String(type || '').trim()); return (t && String(t.note || '').trim()) || '' }
  // the shop sales, checked against the time now: one moment for the whole cart
  const sales = readSales(read('content/site/sales.json'))
  const now = Date.now()
  const lines = []
  for (const item of asked) {
    const slug = String((item && item.slug) || '')
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return no(400, 'Something in the cart is not a piece on this site.')
    const piece = read(`content/work/${slug}.json`)
    if (!piece || piece.hidden || !piece.inShop) return no(404, 'Something in the cart is no longer for sale. Remove it and try again.')
    if (piece.status === 'soldout') return no(409, `"${piece.title || slug}" has sold out. Remove it from the cart and try again.`)
    // a shop sale running on it now (the biggest), weighed against its own sale price below
    const deal = saleFor(piece, sales, now)
    // a piece sold in print sizes: the size asked for, at its discounted price when it has one below its price
    const sizes = (Array.isArray(piece.sizes) ? piece.sizes : []).filter((r) => r && String(r.size || '').trim() && Number(r.price) > 0)
    let price, size = ''
    if (sizes.length) {
      const row = sizes.find((r) => String(r.size).trim() === String((item && item.size) || '').trim())
      if (!row) return no(400, `Choose a size for "${piece.title || slug}" and try again.`)
      size = String(row.size).trim()
      price = priceWith(row.price, row.salePrice, deal)
    } else {
      // the sale price while the piece is on sale (and it is below the usual price), otherwise the price
      price = priceWith(piece.price, piece.status === 'sale' ? piece.salePrice : 0, deal)
    }
    const base = price.now
    const sale = price.by === 'sale' ? { name: deal.name, percent: deal.percent } : null // the shop sale that made the price
    const signed = choice ? Boolean(item.signed === true) : null
    const cents = Math.round((base + (signed ? extra : 0)) * 100)
    if (!(cents >= 50)) return no(404, `"${piece.title || slug}" is not for sale.`)
    const qty = Math.min(MAX_QTY, Math.max(1, Math.round(Number(item.qty) || 1)))
    lines.push({ slug, piece, size, signed, cents, qty, sale })
  }

  // a discount code from the cart: still good now, and for this buyer
  let deal = null
  if (b.code) {
    const c = await checkCode(b.code, user)
    if (!c.ok) return no(409, `${c.message} Remove it from the cart to pay the full price.`, { code: true })
    deal = { code: c.code, percent: c.percent, label: c.label, promoId: c.promoId }
  }
  const cents = lines.reduce((t, l) => t + l.cents * l.qty, 0)
  return {
    shop, lines, deal, choice, cents,
    off: deal ? discountCents(cents, deal.percent) : 0,
    name: (l) => `${String(l.piece.title || l.slug).slice(0, 90)}${l.size ? ` — ${l.size.slice(0, 24)}` : ''}${choice ? (l.signed ? ' (signed)' : ' (unsigned)') : ''}`,
    // what the buyer gets, and the shop sale on it ("Black Friday: 10% off"); the name above stays
    // as it is, since an order's pieces are read back from it (api/_orders.js describeItem)
    what: (l) => [typeNote(l.piece.type) || shop.note || '', l.sale ? `${l.sale.name || 'Sale'}: ${l.sale.percent}% off` : ''].filter(Boolean).join(' · '),
    // what was ordered, readable in the dashboard: "raptor A3 x2 signed, hulk x1"
    summary: lines.map((l) => `${l.slug}${l.size ? ` ${l.size}` : ''} x${l.qty}${choice ? (l.signed ? ' signed' : ' unsigned') : ''}`).join(', '),
  }
}
