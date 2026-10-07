import { check } from './_discounts.js'

/* The cart asks here whether a discount code is good: POST { code, email }. Answers
   { ok, percent, needsEmail } or { ok: false, message, needsEmail }. It says nothing about who a
   code was given to. The checkout checks the code again itself before anything is paid. */
export async function discountCheck({ method, body }) {
  if (method !== 'POST') return { status: 405, json: { message: 'Send the code with POST.' } }
  if (!process.env.STRIPE_SECRET_KEY) return { status: 503, json: { ok: false, message: 'Discount codes cannot be used yet.' } }
  const b = body && typeof body === 'object' ? body : {}
  const r = await check(b.code, b.email)
  return { status: 200, json: r.ok ? { ok: true, code: r.code, percent: r.percent, needsEmail: r.needsEmail } : { ok: false, message: r.message, needsEmail: Boolean(r.needsEmail) } }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const { status, json } = await discountCheck({ method: req.method, body: req.body })
  return res.status(status).json(json)
}
