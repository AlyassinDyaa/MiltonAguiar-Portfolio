/* Shipping from Portugal, and the payment fee (Shop → Settings & payments). The one place the rule
   lives: the cart shows its estimate with it (CartDrawer, Buy) and the checkout charges with it
   (api/_cart.js), so what the buyer sees is what they pay. Plain JavaScript with no imports, so
   both can load it. Amounts in the shop's currency, worked in cents.

   Shipping: zones, each { name, countries ("PT, ES" or "*" for anywhere else), first (the first
   piece), extra (each piece after it), freeOver (an order at least this much ships free) }. The
   first zone naming the country counts; "*" catches the rest. Off ("Charge for delivery" off, or
   delivery off altogether): nothing is added.

   The payment fee: off unless the admin switches it on; then a percentage and a fixed amount for
   each way to pay (card through Stripe, PayPal), on what is paid for the pieces and the shipping. */

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d }
const cents = (v) => Math.round(num(v) * 100)

/* The estimates the shop starts with, from Portugal: the admin changes them. */
export const DEFAULT_ZONES = [
  { name: 'Portugal', countries: 'PT', first: 5, extra: 1 },
  { name: 'Spain', countries: 'ES', first: 8, extra: 1.5 },
  { name: 'Europe', countries: 'FR, DE, IT, NL, BE, IE, LU, AT, DK, SE, FI, PL, CZ, SK, SI, HR, HU, RO, BG, GR, CY, MT, EE, LV, LT, CH, NO', first: 12, extra: 2 },
  { name: 'United Kingdom', countries: 'GB', first: 14, extra: 2 },
  { name: 'USA and Canada', countries: 'US, CA', first: 18, extra: 3 },
  { name: 'Rest of the world', countries: '*', first: 22, extra: 3 },
]
export const DEFAULT_FEES = { on: false, cardPercent: 1.5, cardFixed: 0.25, paypalPercent: 3.49, paypalFixed: 0.35 }

/* The rules as the admin left them, tidied. */
export function shippingRules(shop = {}) {
  const posted = shop.shipping !== false
  const list = Array.isArray(shop.zones) && shop.zones.length ? shop.zones : DEFAULT_ZONES
  const zones = list.filter((z) => z && String(z.name || '').trim()).map((z) => {
    const codes = String(z.countries || '').toUpperCase().split(/[^A-Z*]+/).filter((c) => c === '*' || /^[A-Z]{2}$/.test(c))
    return { name: String(z.name).trim(), countries: codes, first: cents(z.first), extra: cents(z.extra), freeOver: num(z.freeOver) > 0 ? cents(z.freeOver) : 0 }
  })
  const f = { ...DEFAULT_FEES, ...(shop.fees && typeof shop.fees === 'object' ? shop.fees : {}) }
  return {
    charge: posted && shop.shipCharge === true, // delivery is posted and charged for (Charge for delivery, off to start)
    zones,
    fees: { on: Boolean(f.on), card: { percent: num(f.cardPercent), fixed: cents(f.cardFixed) }, paypal: { percent: num(f.paypalPercent), fixed: cents(f.paypalFixed) } },
  }
}

/* The countries the shop posts to (Shop → Settings & payments), as two-letter codes; with none
   listed, the ones the zones name, else Portugal. */
export const postsTo = (shop = {}) => {
  const listed = (Array.isArray(shop.countries) ? shop.countries : []).map((c) => String(c).trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c))
  if (listed.length) return [...new Set(listed)]
  const named = shippingRules(shop).zones.flatMap((z) => z.countries).filter((c) => c !== '*')
  return named.length ? [...new Set(named)] : ['PT']
}

/* The zone a country falls in, or null. */
export const zoneFor = (rules, country) => {
  const c = String(country || '').toUpperCase()
  return rules.zones.find((z) => z.countries.includes(c)) || rules.zones.find((z) => z.countries.includes('*')) || null
}

/* Shipping for an order to a country: { cents, zone } (0 cents when it is free or not charged), or
   { none: true } when no zone covers the country. `qty` is how many pieces; `paid` what the pieces
   come to after any discount (for "free over"). */
export function shippingFor(rules, country, qty, paid) {
  if (!rules.charge) return { cents: 0, zone: null }
  const zone = zoneFor(rules, country)
  if (!zone) return { none: true }
  if (zone.freeOver && paid >= zone.freeOver) return { cents: 0, zone, free: true }
  return { cents: zone.first + zone.extra * Math.max(0, Math.round(num(qty, 1)) - 1), zone }
}

/* The payment fee for a way to pay ('card' or 'paypal') on an amount in cents: 0 while switched off. */
export function feeFor(rules, way, base) {
  if (!rules.fees.on || !(base > 0)) return 0
  const f = way === 'paypal' ? rules.fees.paypal : rules.fees.card
  return Math.round((base * f.percent) / 100 + f.fixed)
}

/* The country a visitor ships to: the one they picked (kept in this browser), else their browser's
   own if the shop posts there, else the first the shop posts to. */
export const SHIP_KEY = 'ma.shipTo'
export function shipToGuess(allowed = []) {
  let kept = ''
  try { kept = localStorage.getItem(SHIP_KEY) || '' } catch { /* not kept */ }
  if (allowed.includes(kept)) return kept
  const own = (typeof navigator !== 'undefined' ? [navigator.language, ...(navigator.languages || [])] : []).map((l) => String(l || '').split('-')[1]).find((c) => c && allowed.includes(c.toUpperCase()))
  return own ? own.toUpperCase() : allowed[0] || 'PT'
}
