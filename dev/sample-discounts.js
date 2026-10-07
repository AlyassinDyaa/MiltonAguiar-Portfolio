/* Sample discount codes for the admin's Discounts screen and the cart on this computer only
   (npm run dev), while no STRIPE_SECRET_KEY is set here. The live site keeps its codes in Stripe
   (api/discounts.js). Codes made here last until the dev server restarts. */
const day = 24 * 60 * 60 * 1000
let codes = null
const make = () => [
  { code: 'WELCOME10', percent: 10, emails: [], starts: Date.now() - 20 * day, ends: Date.now() + 40 * day, limit: 0, used: 6, created: Date.now() - 20 * day },
  { code: 'ANA-THANKS', percent: 20, emails: ['ana.ribeiro@example.com'], starts: Date.now() - 3 * day, ends: Date.now() + 4 * day, limit: 1, used: 0, created: Date.now() - 3 * day },
  { code: 'CONVENTION', percent: 15, emails: [], starts: Date.now() + 10 * day, ends: Date.now() + 13 * day, limit: 50, used: 0, created: Date.now() - day },
  { code: 'SUMMER25', percent: 25, emails: [], starts: Date.now() - 120 * day, ends: Date.now() - 60 * day, limit: 0, used: 14, created: Date.now() - 120 * day },
]
const status = (d) => (d.limit && d.used >= d.limit ? 'used-up' : d.ends && d.ends <= Date.now() ? 'expired' : d.starts > Date.now() ? 'scheduled' : 'active')
const clean = (c) => String(c || '').trim().toUpperCase().replace(/\s+/g, '')
const emailsOf = (list) => [...new Set((Array.isArray(list) ? list : String(list || '').split(/[\s,;]+/)).map((e) => String(e).trim().toLowerCase()).filter(Boolean))]

export function sampleDiscounts({ method, body }) {
  codes = codes || make()
  const b = body || {}
  const code = clean(b.code)
  const out = (d) => ({ ...d, status: status(d) })
  if (method === 'GET') return { status: 200, json: { discounts: codes.map(out).sort((a, b) => b.created - a.created), sample: true } }
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) return { status: 400, json: { message: 'A code is 3 to 32 letters, numbers, - or _.' } }
  const found = codes.find((d) => d.code === code)
  if (method === 'POST') {
    if (found) return { status: 409, json: { message: `There is already a code ${code}. Pick another.` } }
    const percent = Number(b.percent)
    if (!(percent > 0 && percent <= 100)) return { status: 400, json: { message: 'The discount is a percentage from 1 to 100.' } }
    const d = { code, percent, emails: emailsOf(b.emails), starts: Number(b.starts) || Date.now(), ends: Number(b.ends) || 0, limit: Number(b.limit) || 0, used: 0, created: Date.now() }
    if (d.ends && d.ends <= Math.max(Date.now(), d.starts)) return { status: 400, json: { message: 'It has to end after it starts, and in the future.' } }
    codes.push(d)
    return { status: 200, json: { discount: out(d) } }
  }
  if (!found) return { status: 502, json: { message: 'That code no longer exists.' } }
  if (method === 'PATCH') { Object.assign(found, { emails: emailsOf(b.emails), starts: Number(b.starts) || found.starts }); return { status: 200, json: { discount: out(found) } } }
  if (method === 'DELETE') { codes = codes.filter((d) => d !== found); return { status: 200, json: { ok: true } } }
  return { status: 405, json: { message: 'GET, POST, PATCH or DELETE.' } }
}

export function sampleDiscountCheck({ body }) {
  codes = codes || make()
  const d = codes.find((x) => x.code === clean(body && body.code))
  const email = String((body && body.email) || '').trim().toLowerCase()
  if (!d) return { status: 200, json: { ok: false, message: 'That code is not valid.' } }
  const s = status(d)
  if (s !== 'active') return { status: 200, json: { ok: false, message: s === 'scheduled' ? 'That code is not active yet.' : s === 'used-up' ? 'That code has been used up.' : 'That code has run out.' } }
  if (d.emails.length && !email) return { status: 200, json: { ok: false, needsEmail: true, message: 'This code was given to particular people: enter your email to use it.' } }
  if (d.emails.length && !d.emails.includes(email)) return { status: 200, json: { ok: false, needsEmail: true, message: 'This code is not for that email address.' } }
  return { status: 200, json: { ok: true, code: d.code, percent: d.percent, needsEmail: d.emails.length > 0 } }
}
