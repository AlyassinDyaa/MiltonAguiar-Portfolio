/* Shop sales (Shop → Sales in the admin): price cuts that switch themselves on and off.
   The one place the rule lives. The site (data/site.js) shows prices with it and the checkout
   (api/_cart.js) charges with it, so the price a buyer sees is the price they pay. Plain
   JavaScript with no imports, so both can load it.

   A sale is { name, percent, appliesTo, category | subcategory | type, starts, ends, on, banner }
   (content/site/sales.json, a list called "sales"). It is live while it is switched on and now
   falls between its start and its end (either may be left empty). A piece covered by several
   live sales gets the biggest cut, never two at once. A piece with its own sale price gets
   whichever is cheaper. Discount codes come off the total afterwards, as before. */

const MAX = 90 // the biggest cut a sale can give (%)
const KINDS = ['all', 'category', 'subcategory', 'type']
// which field of a piece each kind of sale looks at
const FIELD = { category: 'category', subcategory: 'universe', type: 'type' }
const clean = (v) => String(v ?? '').trim()
const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase()

/* A moment as milliseconds, or null when there is none. A plain date ("2026-10-31") counts from
   the start of that day when it starts a sale and to the end of that day when it ends one. */
const when = (v, end = false) => {
  const s = clean(v)
  if (!s) return null
  const day = /^\d{4}-\d{2}-\d{2}$/.test(s)
  const t = Date.parse(day ? `${s}T00:00:00` : s)
  if (!Number.isFinite(t)) return null
  return day && end ? t + 24 * 60 * 60 * 1000 : t
}

/* The sales file as the admin left it, tidied: anything without a cut, or aimed at a category
   (sub category, type) without naming one, is left out. */
export function readSales(file) {
  const list = Array.isArray(file?.sales) ? file.sales : Array.isArray(file) ? file : []
  return list.filter((s) => s && typeof s === 'object').map((s) => {
    const appliesTo = KINDS.includes(s.appliesTo) ? s.appliesTo : 'all'
    return {
      name: clean(s.name),
      percent: Math.min(MAX, Math.round(Number(s.percent) || 0)),
      appliesTo,
      value: appliesTo === 'all' ? '' : clean(s[appliesTo]),
      starts: when(s.starts),
      ends: when(s.ends, true),
      on: s.on !== false,
      banner: clean(s.banner),
    }
  }).filter((s) => s.percent > 0 && (s.appliesTo === 'all' || s.value))
}

/* Running right now. */
export const isLive = (s, now = Date.now()) => Boolean(s && s.on && (s.starts == null || now >= s.starts) && (s.ends == null || now < s.ends))
export const liveSales = (sales, now = Date.now()) => (Array.isArray(sales) ? sales : []).filter((s) => isLive(s, now))

/* Whether a sale takes in this piece. */
export const covers = (s, piece) => Boolean(piece) && (s.appliesTo === 'all' || same(piece[FIELD[s.appliesTo]], s.value))

/* The live sale with the biggest cut on this piece (the first listed, on a tie), or null. */
export function saleFor(piece, sales, now = Date.now()) {
  let best = null
  for (const s of liveSales(sales, now)) if (covers(s, piece) && (!best || s.percent > best.percent)) best = s
  return best
}

/* A price less a percentage, to the cent. */
export const cut = (price, percent) => Math.round(Number(price) * (100 - percent)) / 100

/* What one price comes to: `usual` is the price, `own` the piece's own sale price (0 for none:
   it counts only below the price), `sale` the shop sale on it (or null). Answers
   { now, by }: by is 'sale' when the shop sale made the price, 'own' when the piece's own sale
   price did, '' when it is the usual price. */
export function priceWith(usual, own, sale) {
  const price = Number(usual) || 0
  const mine = Number(own) > 0 && Number(own) < price ? Number(own) : price
  const theirs = sale && sale.percent > 0 ? cut(price, sale.percent) : price
  if (theirs < mine) return { now: theirs, by: 'sale' }
  return { now: mine, by: mine < price ? 'own' : '' }
}

/* The line a sale shows on the Shop page: the admin's own words, or one made from the sale:
   "10% off everything until 31 Oct", "15% off Fan art". */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function saleLine(s) {
  if (!s) return ''
  if (s.banner) return s.banner
  const what = s.appliesTo === 'all' ? 'everything' : s.value
  // the last day it runs, in the visitor's own time (an end at midnight belongs to the day before)
  const last = s.ends != null ? new Date(s.ends - 1) : null
  return `${s.percent}% off ${what}${last ? ` until ${last.getDate()} ${MONTHS[last.getMonth()]}` : ''}`
}
