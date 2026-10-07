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
