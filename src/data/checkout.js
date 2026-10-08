import { payWays } from './site'

/* What is about to be paid for, kept for this tab until the buyer is back (hooks/useCart.jsx:
   settle), so that exactly those lines leave the cart. */
const notePaying = (body) => {
  const lines = Array.isArray(body.items) ? body.items : [body]
  try { sessionStorage.setItem('ma.paying', JSON.stringify(lines.map((l) => [l.slug, l.size || '', l.signed ? 1 : 0]))) } catch { /* then the whole cart empties after paying */ }
}

/* Who takes the payment, for the line under the buttons. */
export const payLine = () => { const w = payWays(); return w.card && w.paypal ? 'Secure checkout by Stripe or PayPal' : w.paypal ? 'Secure checkout with PayPal' : 'Secure checkout by Stripe' }

/* Ask the site's checkout function (api/checkout.js for a Stripe payment page, api/paypal.js for
   PayPal's) and go there. The body is the cart, { items, code } (code: the discount code in the
   cart, if any), or one piece. Answers with a message when it cannot; when the discount code is
   the trouble (it ran out meanwhile), dropCode takes it out of the cart, which shows the full
   price again. */
export async function checkout(body, way = 'card', dropCode) {
  try {
    const answer = await fetch(way === 'paypal' ? '/api/paypal' : '/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const said = await answer.json().catch(() => ({}))
    if (answer.ok && said.url) { notePaying(body); window.location.href = said.url; return null }
    if (said.code && dropCode) dropCode()
    return said.message || 'The checkout did not answer. Try again in a moment.'
  } catch {
    return 'Could not reach the checkout. Check the connection and try again.'
  }
}

/* PayPal sends the buyer back to /shop?paypal=return&token=<order>: take the payment
   (api/paypal.js). Answers { ok } or { ok: false, message }. */
export async function capturePaypal(order) {
  try {
    const answer = await fetch('/api/paypal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'capture', order }) })
    const said = await answer.json().catch(() => ({}))
    return answer.ok && said.ok ? { ok: true, account: Boolean(said.account) } : { ok: false, message: said.message || 'PayPal could not take the payment. Nothing was charged: try again in a moment.' }
  } catch {
    return { ok: false, message: 'Could not reach the shop. Check the connection, then reload this page.' }
  }
}
