import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import nodemailer from 'nodemailer'
import { db, dbReady } from './_db.js'

/* What the customer-account functions share (the leading underscore keeps Vercel from serving it).

   - Passwords are kept only as scrypt hashes, each with its own salt.
   - A login is a random session id in an HTTP-only cookie (so page scripts cannot read it); the
     database keeps only a hash of it, so a copy of the database holds no usable logins.
   - Links sent by email (reset a password, confirm an address) are random, used once, and run
     out; again only their hash is kept.
   - Too many wrong passwords, or too many reset emails, and the door closes for a while.
   - Links in emails are built from SITE_URL (or Vercel's own production address), never from the
     address a request claims to come from, so nobody can send out a link to another site. */
export { dbReady }
const scrypt = promisify(scryptCallback)
const KEY = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const SESSION_DAYS = 30
const COOKIE = 'ma_session'

export const sha = (text) => createHash('sha256').update(String(text)).digest('hex')
export const newId = (prefix) => `${prefix}_${randomBytes(12).toString('hex')}`
export const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max)
export const EMAIL = /^[^\s@<>"(),;:]{1,64}@[^\s@<>"(),;:]{1,190}\.[a-z]{2,24}$/i
export const tidyEmail = (v) => clean(v, 254).toLowerCase()

// ---------- passwords
export const passwordProblem = (pw) => {
  const p = String(pw || '')
  if (p.length < 8) return 'Use at least 8 characters for the password.'
  if (p.length > 200) return 'That password is too long.'
  if (/^(.)\1+$/.test(p) || /^(password|12345678|qwertyui)/i.test(p)) return 'Pick a password that is harder to guess.'
  return ''
}
export const hashPassword = async (pw) => {
  const salt = randomBytes(16)
  const key = await scrypt(String(pw).normalize('NFKC'), salt, 64, KEY)
  return `s1$${salt.toString('base64')}$${key.toString('base64')}`
}
// the same work is done when there is no account, so the answer's timing gives nothing away
export const checkPassword = async (pw, stored) => {
  const [tag, salt, key] = String(stored || '').split('$')
  const real = tag === 's1' && salt && key
  const got = await scrypt(String(pw || '').normalize('NFKC'), real ? Buffer.from(salt, 'base64') : Buffer.alloc(16), 64, KEY)
  const want = real ? Buffer.from(key, 'base64') : Buffer.alloc(64)
  return Boolean(real) && want.length === got.length && timingSafeEqual(got, want)
}

// ---------- the request
export const readCookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(/;\s*/).filter((c) => c.includes('=')).map((c) => {
  const i = c.indexOf('=')
  try { return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))] } catch { return [c.slice(0, i), ''] }
}))
const onHttps = (req) => process.env.VERCEL === '1' || String(req.headers['x-forwarded-proto'] || '').includes('https')
export const clientIp = (req) => clean(String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0], 60)
// a change must come from the site's own pages: a form on another site cannot use the visitor's login
export const fromThisSite = (req) => {
  const origin = req.headers.origin
  if (!origin) return true // same-origin fetches from older browsers leave it out; the cookie is SameSite=Lax too
  try {
    const host = new URL(origin).host
    return host === req.headers['x-forwarded-host'] || host === req.headers.host
  } catch { return false }
}

// ---------- sessions
const cookieText = (value, seconds, req) => `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${onHttps(req) ? '; Secure' : ''}`
export const startSession = async (req, res, userId) => {
  const raw = randomBytes(32).toString('base64url')
  await (await db()).collection('sessions').insertOne({ hash: sha(raw), userId, createdAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5), agent: clean(req.headers['user-agent'], 160) })
  res.setHeader('Set-Cookie', cookieText(raw, SESSION_DAYS * 86400, req))
}
export const endSession = async (req, res) => {
  const raw = readCookies(req)[COOKIE]
  if (raw) await (await db()).collection('sessions').deleteOne({ hash: sha(raw) })
  res.setHeader('Set-Cookie', cookieText('', 0, req))
}
export const forgetCookie = (req, res) => res.setHeader('Set-Cookie', cookieText('', 0, req))
// the logged-in customer, or null; `session` is the hash of this login (to keep it when ending the others)
export const currentUser = async (req) => {
  if (!dbReady()) return null
  const raw = readCookies(req)[COOKIE]
  if (!raw || raw.length > 100) return null
  const d = await db()
  const session = await d.collection('sessions').findOne({ hash: sha(raw) })
  if (!session || new Date(session.expiresAt) < new Date()) return null
  const user = await d.collection('users').findOne({ _id: session.userId })
  return user ? { ...user, session: session.hash } : null
}

// ---------- one-time links
export const makeToken = async (userId, kind, minutes) => {
  const raw = randomBytes(32).toString('base64url')
  const d = await db()
  await d.collection('tokens').deleteMany({ userId, kind }) // a new link replaces any older one of the same kind
  await d.collection('tokens').insertOne({ hash: sha(raw), userId, kind, expiresAt: new Date(Date.now() + minutes * 60000) })
  return raw
}
export const spendToken = async (raw, kind) => {
  if (!raw || String(raw).length > 100) return null
  const d = await db()
  const token = await d.collection('tokens').findOne({ hash: sha(raw), kind })
  if (!token) return null
  await d.collection('tokens').deleteOne({ hash: token.hash })
  return new Date(token.expiresAt) < new Date() ? null : token
}

// ---------- too many tries
export const tooMany = async (key, limit, minutes) => (await (await db()).collection('attempts').countDocuments({ key, at: { $gt: new Date(Date.now() - minutes * 60000) } })) >= limit
export const noteTry = async (...keys) => { const d = await db(); for (const key of keys) await d.collection('attempts').insertOne({ key, at: new Date() }) }
export const forgetTries = async (key) => (await db()).collection('attempts').deleteMany({ key })

// the site's name, tagline and links, from Site → Name, colour and contact in the admin
const brandInfo = () => { try { return JSON.parse(readFileSync(join(process.cwd(), 'content/site/brand.json'), 'utf8')) || {} } catch { return {} } }
const siteName = () => brandInfo().name || 'Milton Aguiar'
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
/* Where the pictures in an email are fetched from: the live site (an inbox cannot reach this
   computer), so they show once the site is deployed. */
const LIVE = 'https://miltonaguiar.vercel.app'
const assetHost = () => {
  const s = String(process.env.SITE_URL || '').replace(/\/$/, '')
  if (/^https:\/\//.test(s)) return s
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return LIVE
}
const pictureUrl = (path) => (/^https?:\/\//.test(path) ? path : `${assetHost()}${path.startsWith('/') ? '' : '/'}${path}`)

/* Every email in the site's comic style, on the red circuit picture: the name on black (the second
   word in red), a dark panel framed in ink with a small tag, a big italic heading, the words, a picture
   when there is one, and a red inked button with a hard shadow; under it the link written out,
   and a quiet footer. Built from tables with the styles written on each piece, the way email
   apps need it. */
const DISPLAY = "'Arial Black', 'Helvetica Neue', Impact, Arial, sans-serif"
const BODY = "Arial, 'Helvetica Neue', Helvetica, sans-serif"
export const emailHtml = ({ subject, kicker, title, lines, button, picture, after }) => {
  const b = brandInfo()
  const name = String(b.name || 'Milton Aguiar').trim()
  const cut = name.lastIndexOf(' ')
  const [first, second] = cut > 0 ? [name.slice(0, cut), name.slice(cut + 1)] : [name, '']
  const insta = (Array.isArray(b.social) ? b.social : []).find((x) => /instagram/i.test(x.label || ''))
  const home = assetHost() // the live address (never this computer's), for the footer link
  const para = (t) => `<p style="margin:0 0 14px;font-family:${BODY};font-size:16px;line-height:1.6;color:#d9d9d6;">${esc(t)}</p>`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#6d0d14;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#6d0d14;">${esc(lines[1] || lines[0] || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" background="${esc(pictureUrl('/email/background.jpg'))}" style="background-color:#6d0d14;background-image:url('${esc(pictureUrl('/email/background.jpg'))}');background-size:cover;background-position:center top;background-repeat:no-repeat;"><tr><td align="center" style="padding:28px 12px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
  <tr><td style="background:#0b0b0c;border:3px solid #0b0b0c;padding:16px 22px 15px;font-family:${DISPLAY};font-size:20px;font-weight:900;font-style:italic;letter-spacing:0.5px;text-transform:uppercase;color:#ffffff;line-height:1;">${esc(first)}${second ? ` <span style="color:#ff2a36;">${esc(second)}</span>` : ''}</td></tr>
  <tr><td style="background:#17171a;border:3px solid #0b0b0c;border-top:0;padding:30px 26px 30px;">
    ${kicker ? `<span style="display:inline-block;padding:5px 10px 4px;background:#0b0b0c;font-family:${DISPLAY};font-size:11px;font-weight:900;font-style:italic;letter-spacing:2px;text-transform:uppercase;color:#ffffff;">${esc(kicker)}</span>` : ''}
    <h1 style="margin:16px 0 18px;font-family:${DISPLAY};font-size:32px;line-height:1.05;font-weight:900;font-style:italic;text-transform:uppercase;color:#f3f3f1;">${esc(title || subject)}</h1>
    ${lines.map(para).join('\n    ')}
    ${picture ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;"><tr>
      <td style="vertical-align:middle;"><img src="${esc(pictureUrl(picture.src))}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;border-radius:50%;border:3px solid #ffd34d;"></td>
      <td style="vertical-align:middle;padding-left:14px;font-family:${BODY};font-size:14px;line-height:1.5;color:#d9d9d6;"><strong style="display:block;font-family:${DISPLAY};font-size:15px;font-style:italic;text-transform:uppercase;color:#ffd34d;">${esc(picture.title)}</strong>${esc(picture.text)}</td>
    </tr></table>` : ''}
    ${button ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 6px;"><tr><td style="background:#d8232f;border:3px solid #0b0b0c;border-right-width:7px;border-bottom-width:7px;">
      <a href="${esc(button.url)}" style="display:inline-block;padding:14px 24px;font-family:${DISPLAY};font-size:15px;font-weight:900;font-style:italic;letter-spacing:1px;text-transform:uppercase;color:#ffffff;text-decoration:none;">${esc(button.label)} &rarr;</a>
    </td></tr></table>
    <p style="margin:18px 0 0;font-family:${BODY};font-size:12px;line-height:1.6;color:#8a8a8f;">Button not working? Paste this into your browser:<br><a href="${esc(button.url)}" style="color:#ff5a52;word-break:break-all;">${esc(button.url)}</a></p>` : ''}
    ${after ? `<p style="margin:22px 0 0;padding-top:16px;border-top:1px dashed #3a3a40;font-family:${BODY};font-size:13px;line-height:1.6;color:#8a8a8f;">${esc(after)}</p>` : ''}
  </td></tr>
  <tr><td style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr>
  <tr><td align="center" style="background:#0b0b0c;border:3px solid #0b0b0c;padding:18px 14px 16px;font-family:${BODY};font-size:13px;line-height:1.6;color:#b9b9be;">
    ${b.tagline ? `<span style="display:block;margin-bottom:10px;">${esc(b.tagline)}</span>` : ''}<a href="${esc(home)}" style="font-family:${DISPLAY};font-size:14px;font-weight:900;font-style:italic;letter-spacing:0.5px;text-transform:uppercase;color:#ffffff;text-decoration:underline;">${esc(home.replace(/^https?:\/\//, ''))}</a>${insta ? `<span style="color:#ff2a36;font-weight:900;">&nbsp;&nbsp;/&nbsp;&nbsp;</span><a href="${esc(insta.url)}" style="font-family:${DISPLAY};font-size:14px;font-weight:900;font-style:italic;letter-spacing:0.5px;text-transform:uppercase;color:#ffffff;text-decoration:underline;">Instagram</a>` : ''}
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

/* ---------- email: two ways to send, whichever is set up
   - an email account's own sending server (SMTP), for example Gmail with an app password:
     SMTP_HOST (smtp.gmail.com), SMTP_PORT (465), SMTP_USER (the address), SMTP_PASS (the app password).
     Emails then come from that address; handy for testing, and fine for small volumes.
   - Resend (resend.com): RESEND_API_KEY, sending from an address on a domain verified there.
   MAIL_FROM is the sender as people see it ("Milton Aguiar <hello@...>"); MAIL_REPLY_TO, if set,
   is where replies go. With neither set, on this computer the email is printed instead.
   An email is { to, subject, kicker, title, lines, button: { label, url }, picture: { src, title, text }, after, replyTo }. */
export const siteUrl = (req) => (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL ? '' : `http://${req.headers.host}`)).replace(/\/$/, '')
const smtpReady = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
export const mailReady = () => smtpReady() || Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM)
let transport = null
const smtp = () => transport || (transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: (Number(process.env.SMTP_PORT) || 465) === 465,
  auth: { user: process.env.SMTP_USER, pass: String(process.env.SMTP_PASS).replace(/\s+/g, '') },
}))
export const sendMail = async (mail) => {
  const { to, subject, lines, button, after } = mail
  const brand = process.env.MAIL_BRAND || siteName()
  const text = [mail.title || subject, '', ...lines, mail.picture ? `\n${mail.picture.title}: ${mail.picture.text}` : '', button ? `\n${button.label}: ${button.url}` : '', after ? `\n${after}` : '', '', `— ${brand}`].join('\n')
  if (!mailReady()) {
    // on this computer the link is printed instead, so the whole journey can be tried without email
    if (!process.env.VERCEL) console.log(`\n[email to ${to}] ${subject}\n${text}\n`)
    else console.warn('email not sent: no SMTP_* or RESEND_API_KEY / MAIL_FROM set')
    return false
  }
  const html = emailHtml(mail)
  const from = process.env.MAIL_FROM || `${brand} <${process.env.SMTP_USER}>`
  const replyTo = mail.replyTo || process.env.MAIL_REPLY_TO || undefined // a contact message: replies go to the visitor
  if (smtpReady()) {
    try {
      await smtp().sendMail({ from, to, subject, text, html, replyTo })
      return true
    } catch (e) { console.error('the email server refused the email:', e && (e.response || e.message)); return false }
  }
  try {
    const answer = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }) })
    if (!answer.ok) console.error('resend refused the email:', answer.status)
    return answer.ok
  } catch (e) { console.error('could not reach resend:', e.message); return false }
}

// ---------- what the browser is told about the customer
export const publicUser = (u) => (u ? {
  email: u.email,
  name: u.name || '',
  phone: u.phone || '',
  verified: Boolean(u.verified),
  marketing: Boolean(u.marketing),
  createdAt: u.createdAt,
  lastVisit: u.prevLogin || u.createdAt, // for "new since your last visit"
  avatar: typeof u.avatar === 'string' ? u.avatar : '',
  card: typeof u.card === 'string' ? u.card : '', // the membership card design they chose (a reward)
  memberNo: Number(u.memberNo) || null, // the order they signed up in: the first customer is 1
  saved: Array.isArray(u.saved) ? u.saved : [],
  cart: Array.isArray(u.cart) ? u.cart : [],
} : null)

// a list of pieces (by their slug), made safe to keep: no repeats, at most 100
export const cleanSlugs = (list) => [...new Set((Array.isArray(list) ? list : []).map((s) => clean(s, 80)).filter((s) => /^[a-z0-9-]{1,80}$/.test(s)))].slice(0, 100)

// a cart from the browser, made safe to keep: { slug, size, signed, qty } lines
export const cleanCart = (lines) => (Array.isArray(lines) ? lines : []).slice(0, 30)
  .map((l) => ({ slug: clean(l && l.slug, 80), size: clean(l && l.size, 40), signed: Boolean(l && l.signed), qty: Math.min(10, Math.max(1, Math.round(Number(l && l.qty) || 1))) }))
  .filter((l) => /^[a-z0-9-]{1,80}$/.test(l.slug))
// two carts become one: the same print, size and signature is kept once, with the larger count
// (the browser's cart and the account's often hold the same lines already)
export const mergeCarts = (a, b) => {
  const out = []
  for (const l of [...cleanCart(a), ...cleanCart(b)]) {
    const same = out.find((x) => x.slug === l.slug && x.size === l.size && x.signed === l.signed)
    if (same) same.qty = Math.max(same.qty, l.qty)
    else out.push({ ...l })
  }
  return out.slice(0, 30)
}
