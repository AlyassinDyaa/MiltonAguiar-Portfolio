/* Discount codes, kept in Stripe as coupons (a leading underscore keeps Vercel from serving this
   file). There is no database: a code is a Stripe coupon whose id is the code itself, with
   - percent_off: how much it takes off;
   - redeem_by: when it stops working; max_redemptions: how many times it may be used, if limited;
   - metadata: ma = "1" (made by this admin, so other coupons in the account are left alone),
     starts (when it starts working, in ms) and who may use it: email addresses, split over
     emails_0, emails_1... because Stripe keeps at most 500 characters in each.
   The codes never reach the site's files, so nobody can read them from the website. */
export const stripe = async (path, init = {}) => {
  const answer = await fetch(`https://api.stripe.com/v1/${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(init.headers || {}) } })
  const said = await answer.json().catch(() => ({}))
  if (!answer.ok) throw Object.assign(new Error((said.error && said.error.message) || `Stripe answered ${answer.status}`), { status: answer.status, code: said.error && said.error.code })
  return said
}
export const form = (fields) => {
  const f = new URLSearchParams()
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) f.set(k, String(v))
  return { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: f.toString() }
}

export const cleanCode = (code) => String(code || '').trim().toUpperCase().replace(/\s+/g, '')
export const goodCode = (code) => /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)
export const cleanEmail = (e) => String(e || '').trim().toLowerCase()
export const goodEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

/* Email addresses into metadata keys of at most 500 characters, and back. */
export const packEmails = (emails) => {
  const out = {}
  let at = 0, line = ''
  for (const e of emails) {
    if (line && (line + ',' + e).length > 490) { out[`emails_${at++}`] = line; line = '' }
    line = line ? `${line},${e}` : e
  }
  if (line) out[`emails_${at++}`] = line
  return out
}
export const unpackEmails = (meta = {}) => Object.keys(meta).filter((k) => /^emails_\d+$/.test(k)).sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)))
  .flatMap((k) => String(meta[k] || '').split(',')).map(cleanEmail).filter(Boolean)

/* A coupon as the admin reads it. */
export const discount = (c) => {
  const now = Date.now()
  const starts = Number((c.metadata || {}).starts) || c.created * 1000
  const ends = c.redeem_by ? c.redeem_by * 1000 : 0
  const usedUp = c.max_redemptions && c.times_redeemed >= c.max_redemptions
  return {
    code: c.id, percent: c.percent_off || 0, emails: unpackEmails(c.metadata), starts, ends,
    limit: c.max_redemptions || 0, used: c.times_redeemed || 0, created: c.created * 1000,
    status: usedUp ? 'used-up' : ends && ends <= now ? 'expired' : !c.valid ? 'expired' : starts > now ? 'scheduled' : 'active',
  }
}

/* Is this code good for this buyer right now? Answers { ok, percent, needsEmail, message, coupon }. */
export async function check(rawCode, rawEmail) {
  const code = cleanCode(rawCode), email = cleanEmail(rawEmail)
  const no = (message, extra = {}) => ({ ok: false, message, ...extra })
  if (!goodCode(code)) return no('That code is not valid.')
  let c
  try { c = await stripe(`coupons/${encodeURIComponent(code)}`) } catch (e) { return e.status === 404 ? no('That code is not valid.') : no('The code could not be checked. Try again in a moment.') }
  if (!c || (c.metadata || {}).ma !== '1') return no('That code is not valid.')
  const d = discount(c)
  if (d.status === 'scheduled') return no('That code is not active yet.')
  if (d.status === 'expired') return no('That code has run out.')
  if (d.status === 'used-up') return no('That code has been used up.')
  if (d.emails.length) {
    if (!email) return no('This code was given to particular people: enter your email to use it.', { needsEmail: true })
    if (!d.emails.includes(email)) return no('This code is not for that email address.', { needsEmail: true })
  }
  return { ok: true, code: d.code, percent: d.percent, needsEmail: d.emails.length > 0, email: d.emails.length ? email : '' }
}
