import { configured, goodPass } from './_session.js'
import { cleanCode, cleanEmail, discount, form, goodCode, goodEmail, packEmails, stripe } from './_discounts.js'

/* The admin's discount codes (Sales → Discounts). Each is a Stripe coupon (see _discounts.js).
   GET    answers { discounts: [...] }, newest first.
   POST   { code, percent, emails, starts, ends, limit } makes one.
   PATCH  { code, emails, starts } changes who may use it and when it starts (Stripe lets a coupon's
          percentage, end and limit be set only when it is made: for those, make a new code).
   DELETE { code } removes it; a code already used stays on the orders it was used on.
   All need the admin's pass. */
const ALL_KEYS = Array.from({ length: 40 }, (_, i) => `emails_${i}`)

const emailsOf = (list) => [...new Set((Array.isArray(list) ? list : String(list || '').split(/[\s,;]+/)).map(cleanEmail).filter(Boolean))]

export async function discounts({ method, body }) {
  if (!process.env.STRIPE_SECRET_KEY) return { status: 503, json: { code: 'no-stripe', message: 'Stripe is not connected yet: add STRIPE_SECRET_KEY in the Vercel project settings. Discount codes are kept in Stripe.' } }
  const b = body && typeof body === 'object' ? body : {}
  try {
    if (method === 'GET') {
      const all = []
      let after = ''
      for (let page = 0; page < 5; page++) {
        const got = await stripe(`coupons?limit=100${after ? `&starting_after=${after}` : ''}`)
        all.push(...got.data)
        if (!got.has_more || !got.data.length) break
        after = got.data[got.data.length - 1].id
      }
      return { status: 200, json: { mode: /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY) ? 'test' : 'live', discounts: all.filter((c) => (c.metadata || {}).ma === '1').map(discount).sort((a, b) => b.created - a.created) } }
    }
    const code = cleanCode(b.code)
    if (!goodCode(code)) return { status: 400, json: { message: 'A code is 3 to 32 letters, numbers, - or _.' } }
    const emails = emailsOf(b.emails)
    const wrong = emails.find((e) => !goodEmail(e))
    if (wrong) return { status: 400, json: { message: `"${wrong}" is not an email address.` } }
    if (emails.join(',').length > 18000) return { status: 400, json: { message: 'Too many people on one code: split them over two codes.' } }
    const starts = Number(b.starts) || Date.now()

    if (method === 'POST') {
      const percent = Math.round(Number(b.percent) * 100) / 100
      if (!(percent > 0 && percent <= 100)) return { status: 400, json: { message: 'The discount is a percentage from 1 to 100.' } }
      const ends = Number(b.ends) || 0
      if (ends && ends <= Math.max(Date.now(), starts)) return { status: 400, json: { message: 'It has to end after it starts, and in the future.' } }
      const limit = Math.max(0, Math.round(Number(b.limit) || 0))
      const fields = { id: code, percent_off: percent, duration: 'once', name: `${percent}% off`, 'metadata[ma]': '1', 'metadata[starts]': String(starts) }
      if (ends) fields.redeem_by = Math.floor(ends / 1000)
      if (limit) fields.max_redemptions = limit
      for (const [k, v] of Object.entries(packEmails(emails))) fields[`metadata[${k}]`] = v
      try {
        const c = await stripe('coupons', form(fields))
        return { status: 200, json: { discount: discount(c) } }
      } catch (e) {
        if (e.code === 'resource_already_exists') return { status: 409, json: { message: `There is already a code ${code}. Pick another.` } }
        throw e
      }
    }
    if (method === 'PATCH') {
      const fields = { 'metadata[starts]': String(starts) }
      const packed = packEmails(emails)
      for (const k of ALL_KEYS) fields[`metadata[${k}]`] = packed[k] || '' // an empty value removes a key
      const c = await stripe(`coupons/${encodeURIComponent(code)}`, form(fields))
      return { status: 200, json: { discount: discount(c) } }
    }
    if (method === 'DELETE') {
      await stripe(`coupons/${encodeURIComponent(code)}`, { method: 'DELETE' })
      return { status: 200, json: { ok: true } }
    }
    return { status: 405, json: { message: 'GET, POST, PATCH or DELETE.' } }
  } catch (e) {
    console.error('discounts:', e.message)
    return { status: 502, json: { message: e.status === 404 ? 'That code no longer exists.' : 'Could not reach Stripe. Try again in a moment.' } }
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!configured()) return res.status(500).json({ message: 'ADMIN_PASSCODE and GITHUB_TOKEN are not set in the Vercel project settings.' })
  const pass = String(req.headers.authorization || '').replace(/^(token|bearer)\s+/i, '')
  if (!goodPass(pass)) return res.status(401).json({ message: 'Your login has run out. Sign out of the admin and sign in again.' })
  const { status, json } = await discounts({ method: req.method, body: req.body })
  return res.status(status).json(json)
}
