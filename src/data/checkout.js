/* Ask the site's checkout function (api/checkout.js) for a Stripe payment page and go there.
   Answers with a message when it cannot. */
export async function checkout(body) {
  try {
    const answer = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const said = await answer.json().catch(() => ({}))
    if (answer.ok && said.url) { window.location.href = said.url; return null }
    return said.message || 'The checkout did not answer. Try again in a moment.'
  } catch {
    return 'Could not reach the checkout. Check the connection and try again.'
  }
}

/* Ask whether a discount code is good (api/discount.js): { ok, code, percent, needsEmail } or
   { ok: false, message, needsEmail }. The checkout checks it again itself. */
export async function checkCode(code, email) {
  try {
    const answer = await fetch('/api/discount', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim(), email: email.trim() }) })
    const said = await answer.json().catch(() => ({}))
    return answer.ok || said.message ? said : { ok: false, message: 'The code could not be checked. Try again in a moment.' }
  } catch {
    return { ok: false, message: 'Could not reach the shop. Check the connection and try again.' }
  }
}
