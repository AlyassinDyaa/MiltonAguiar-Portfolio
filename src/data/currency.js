/* Paying in the buyer's own currency. Prices are set in the shop's currency (Shop → Settings &
   payments, euros); a buyer can pick another (Account → Details, or the cart) and then sees, and is
   charged, the same order worked out in it with the day's European Central Bank rate (api/_rates.js).
   The one place the rule lives: the cart (hooks/useCart.jsx) shows it and the checkout charges it
   (api/_cart.js), so what is shown is what is paid. Plain JavaScript with no imports, so both can
   load it. Amounts in cents.

   Each piece's price is turned into the currency on its own (as the payment page lists it), then the
   code's cut comes off what they come to (rounded as Stripe rounds it), then the shipping and the
   transaction fee, each turned into the currency too. */

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'BRL', 'CAD', 'AUD']
export const CURRENCY_NAMES = { EUR: 'Euro', USD: 'US dollar', GBP: 'British pound', BRL: 'Brazilian real', CAD: 'Canadian dollar', AUD: 'Australian dollar' }
/* PayPal takes these; the Brazilian real only for a Brazilian seller's account, so a PayPal payment
   asked for in it is made in the shop's own currency instead. */
export const PAYPAL_CURRENCIES = ['EUR', 'USD', 'GBP', 'CAD', 'AUD']

export const toCents = (cents, rate) => Math.round(cents * rate)

/* The order in a currency at a rate: `lines` [{ cents, qty }] (each piece's price in the shop's
   currency), `percent` the code's cut (0 for none), `ship` and `fee` in the shop's currency. */
export function inCurrency({ lines, percent = 0, ship = 0, fee = 0 }, rate = 1) {
  const units = lines.map((l) => toCents(l.cents, rate))
  const items = units.reduce((t, u, i) => t + u * lines[i].qty, 0)
  const off = percent ? Math.round((items * percent) / 100) : 0
  const shipping = toCents(ship, rate)
  const fees = toCents(fee, rate)
  return { units, items, off, ship: shipping, fee: fees, total: items - off + shipping + fees }
}

/* The currency a payment is made in: the one picked when there is a rate for it (and PayPal takes it,
   for PayPal), else the shop's own, at 1. */
export function payCurrency(asked, base, rates, way = 'card') {
  const code = String(asked || '').toUpperCase()
  const own = String(base || 'EUR').toUpperCase()
  if (!code || code === own || !CURRENCIES.includes(code)) return { code: own, rate: 1 }
  const rate = rates && Number(rates[code])
  if (!(rate > 0)) return { code: own, rate: 1 }
  if (way === 'paypal' && !PAYPAL_CURRENCIES.includes(code)) return { code: own, rate: 1 }
  return { code, rate }
}
