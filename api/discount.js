import { buyer } from './_buyer.js'
import { checkCode } from './_orders.js'

/* The cart asks here whether a discount code is good: POST { code }. Answers
   { ok: true, code, percent, label } or (400) { message }. It says nothing about who a code was
   made for. A reward code works only for the customer it was given to, so the logged-in customer
   is read too (with accounts switched off, nobody is). The checkout checks the code again itself
   before anything is paid. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ message: 'Send the code with POST.' })
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  try {
    const { user } = await buyer(req)
    const c = await checkCode(body.code, user)
    return c.ok ? res.status(200).json({ ok: true, code: c.code, percent: c.percent, label: c.label }) : res.status(400).json({ message: c.message })
  } catch (e) {
    console.error('discount check:', e.message)
    return res.status(502).json({ message: 'The code could not be checked. Try again in a moment.' })
  }
}
