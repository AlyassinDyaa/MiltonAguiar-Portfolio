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

/* Every email in the site's comic style, on the red circuit picture (across the top, running into its dark red): the name on black (the second
   word in red), a dark panel framed in ink with a small tag, a big italic heading, the words, a discount
   code in a dashed box and a picture when there are any, and a red inked button with a hard
   shadow; under it the link written out, and a quiet footer. Built from tables with the styles
   written on each piece, the way email apps need it.
   Staying dark everywhere: the page says it is a dark email (color-scheme), so Apple Mail and
   Outlook leave it alone. Gmail's phone app in dark mode turns light emails dark and dark ones light
   whatever they say, so every dark background is also painted as a background image (which it never
   changes), and the light words sit in two blend layers that turn its flip back (the gmail-* classes,
   which only Gmail ever matches: it puts a <u> before the body). */
const DISPLAY = "'Arial Black', 'Helvetica Neue', Impact, Arial, sans-serif"
const BODY = "Arial, 'Helvetica Neue', Helvetica, sans-serif"
const MONO = "'Courier New', Consolas, Menlo, monospace"
const C = { page: '#3e0e1a', ink: '#0b0b0c', panel: '#17171a', red: '#d8232f', bright: '#ff2a36', text: '#d9d9d6', soft: '#8a8a8f', foot: '#b9b9be', gold: '#ffd34d', line: '#3a3a40' }
const paint = (c) => `background-color:${c};background-image:linear-gradient(${c},${c});`
// light words that must stay light in Gmail's dark mode
const keep = (html, tag = 'div') => `<${tag} class="gmail-screen"><${tag} class="gmail-dif">${html}</${tag}></${tag}>`
/* Pieces in a grid of two (up to four): their picture, name and price, each a link. One piece
   gets the whole width. Built from tables, painted for Gmail's dark mode like the rest. */
const itemsHtml = (items) => {
  const list = items.slice(0, 4)
  const wide = list.length === 1 ? 300 : 220
  const cell = (it) => `<td width="${list.length === 1 ? '100%' : '50%'}" valign="top" style="padding:6px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${paint(C.ink)}border:2px solid ${C.line};"><tr><td align="center" style="padding:10px;">
          ${it.src ? `<a href="${esc(it.url || '#')}" style="text-decoration:none;"><img src="${esc(pictureUrl(it.src))}" width="${wide}" alt="${esc(it.title || '')}" style="display:block;width:100%;max-width:${wide}px;height:auto;border:0;"></a>` : ''}
          <span style="display:block;margin-top:10px;font-family:${DISPLAY};font-size:15px;font-weight:900;font-style:italic;letter-spacing:0.5px;text-transform:uppercase;line-height:1.15;color:#ffffff;">${keep(esc(it.title || ''), 'span')}</span>
          ${it.text ? `<span style="display:block;margin-top:4px;font-family:${DISPLAY};font-size:14px;font-weight:900;font-style:italic;color:${C.bright};">${esc(it.text)}</span>` : ''}
        </td></tr></table>
      </td>`
  const rows = []
  for (let i = 0; i < list.length; i += 2) rows.push(`<tr>${cell(list[i])}${list[i + 1] ? cell(list[i + 1]) : list.length > 1 ? '<td width="50%" style="padding:6px;">&nbsp;</td>' : ''}</tr>`)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;">${rows.join('')}</table>`
}
/* An email is laid out from: subject, kicker (the small tag), title, lines (paragraphs), orders,
   code, picture, items (pieces in a grid), highlight ({ label, title, lines }: a box for an event),
   button, after (the quiet line at the end) and unsubscribe (a link in the footer to stop news emails). */
export const emailHtml = ({ subject, kicker, title, lines = [], button, picture, after, code, orders, items, highlight, unsubscribe }) => {
  const b = brandInfo()
  const name = String(b.name || 'Milton Aguiar').trim()
  const cut = name.lastIndexOf(' ')
  const [first, second] = cut > 0 ? [name.slice(0, cut), name.slice(cut + 1)] : [name, '']
  const insta = (Array.isArray(b.social) ? b.social : []).find((x) => /instagram/i.test(x.label || ''))
  const home = assetHost() // the live address (never this computer's), for the footer link
  const back = pictureUrl('/email/background.jpg')
  const para = (t) => `<p style="margin:0 0 14px;font-family:${BODY};font-size:16px;line-height:1.6;color:${C.text};">${keep(esc(t), 'span')}</p>`
  const footLink = `font-family:${DISPLAY};font-size:14px;font-weight:900;font-style:italic;letter-spacing:0.5px;text-transform:uppercase;color:#ffffff;text-decoration:underline;`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(subject)}</title>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  u + .body .gmail-screen { background:#000; mix-blend-mode:screen; display:inline; }
  u + .body .gmail-dif { background:#000; mix-blend-mode:difference; display:inline; }
  u + .body div.gmail-screen, u + .body div.gmail-dif { display:block; }
  @media (max-width:600px) { .email-back { background-size:240% auto !important; } }
</style></head>
<body class="body" style="margin:0;padding:0;${paint(C.page)}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" background="${esc(back)}" style="background-color:${C.page};background-image:url('${esc(back)}');background-size:100% auto;background-position:center top;background-repeat:no-repeat;" class="email-back"><tr><td align="center" style="padding:28px 12px 36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
  <tr><td style="${paint(C.ink)}border:3px solid ${C.ink};padding:16px 22px 15px;font-family:${DISPLAY};font-size:20px;font-weight:900;font-style:italic;letter-spacing:0.5px;text-transform:uppercase;color:#ffffff;line-height:1;"><span style="color:#ffffff;">${keep(esc(first), 'span')}</span>${second ? ` <span style="color:${C.bright};">${esc(second)}</span>` : ''}</td></tr>
  <tr><td style="${paint(C.panel)}border:3px solid ${C.ink};border-top:0;padding:30px 26px 30px;">
    ${kicker ? `<span style="display:inline-block;padding:5px 10px 4px;${paint(C.ink)}font-family:${DISPLAY};font-size:11px;font-weight:900;font-style:italic;letter-spacing:2px;text-transform:uppercase;color:#ffffff;">${keep(esc(kicker), 'span')}</span>` : ''}
    <h1 style="margin:16px 0 18px;font-family:${DISPLAY};font-size:32px;line-height:1.05;font-weight:900;font-style:italic;text-transform:uppercase;color:#f3f3f1;">${keep(esc(title || subject))}</h1>
    ${lines.map(para).join('\n    ')}
    ${Array.isArray(orders) ? orders.map((o) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;${paint(C.ink)}border:2px solid ${C.line};"><tr><td style="padding:14px 16px;">
      <span style="display:block;font-family:${DISPLAY};font-size:18px;font-weight:900;font-style:italic;letter-spacing:0.5px;text-transform:uppercase;color:#ffffff;">${keep(esc(o.title), 'span')}</span>
      <span style="display:block;margin:2px 0 10px;font-family:${DISPLAY};font-size:11px;font-weight:900;font-style:italic;letter-spacing:1px;text-transform:uppercase;color:${C.soft};">${esc(o.sub || '')}</span>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${(o.rows || []).map(([l, v]) => `<tr><td style="padding:3px 0;font-family:${BODY};font-size:14px;line-height:1.45;color:${C.text};">${keep(esc(l), 'span')}</td><td align="right" style="padding:3px 0 3px 12px;font-family:${BODY};font-size:14px;color:${C.text};white-space:nowrap;">${keep(esc(v || ''), 'span')}</td></tr>`).join('')}
        ${o.total ? `<tr><td style="padding:8px 0 0;border-top:1px dashed ${C.line};font-family:${DISPLAY};font-size:12px;font-weight:900;font-style:italic;letter-spacing:1px;text-transform:uppercase;color:${C.soft};">Total</td><td align="right" style="padding:8px 0 0 12px;border-top:1px dashed ${C.line};font-family:${DISPLAY};font-size:18px;font-weight:900;font-style:italic;color:${C.bright};">${esc(o.total)}</td></tr>` : ''}
      </table>
      ${o.foot ? `<span style="display:block;margin-top:10px;font-family:${BODY};font-size:13px;line-height:1.5;color:${C.foot};">${keep(esc(o.foot), 'span')}</span>` : ''}
    </td></tr></table>`).join('\n    ') : ''}
    ${code ?`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;"><tr><td style="${paint(C.ink)}border:2px dashed ${C.gold};padding:14px 22px;">
      <span style="display:block;font-family:${DISPLAY};font-size:11px;font-weight:900;font-style:italic;letter-spacing:2px;text-transform:uppercase;color:${C.gold};">${esc(code.label || 'Your code')}</span>
      <span style="display:block;margin-top:6px;font-family:${MONO};font-size:26px;font-weight:700;letter-spacing:3px;color:#ffffff;">${keep(esc(code.text), 'span')}</span>
      ${code.note ? `<span style="display:block;margin-top:6px;font-family:${BODY};font-size:13px;color:${C.foot};">${keep(esc(code.note), 'span')}</span>` : ''}
    </td></tr></table>` : ''}
    ${picture ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;"><tr>
      <td style="vertical-align:middle;"><img src="${esc(pictureUrl(picture.src))}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;border-radius:50%;border:3px solid ${C.gold};${paint(C.ink)}"></td>
      <td style="vertical-align:middle;padding-left:14px;font-family:${BODY};font-size:14px;line-height:1.5;color:${C.text};"><strong style="display:block;font-family:${DISPLAY};font-size:15px;font-style:italic;text-transform:uppercase;color:${C.gold};">${esc(picture.title)}</strong>${keep(esc(picture.text), 'span')}</td>
    </tr></table>` : ''}
    ${Array.isArray(items) && items.length ? itemsHtml(items) : ''}
    ${highlight ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;"><tr><td style="${paint(C.ink)}border:2px solid ${C.line};border-left:5px solid ${C.red};padding:14px 18px;">
      ${highlight.label ? `<span style="display:block;font-family:${DISPLAY};font-size:11px;font-weight:900;font-style:italic;letter-spacing:2px;text-transform:uppercase;color:${C.gold};">${esc(highlight.label)}</span>` : ''}
      <span style="display:block;margin-top:6px;font-family:${DISPLAY};font-size:20px;font-weight:900;font-style:italic;text-transform:uppercase;line-height:1.1;color:#ffffff;">${keep(esc(highlight.title || ''), 'span')}</span>
      ${(highlight.lines || []).map((l) => `<span style="display:block;margin-top:4px;font-family:${BODY};font-size:14px;line-height:1.5;color:${C.text};">${keep(esc(l), 'span')}</span>`).join('')}
    </td></tr></table>` : ''}
    ${button ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 6px;"><tr><td style="${paint(C.red)}border:3px solid ${C.ink};border-right-width:7px;border-bottom-width:7px;">
      <a href="${esc(button.url)}" style="display:inline-block;padding:14px 24px;font-family:${DISPLAY};font-size:15px;font-weight:900;font-style:italic;letter-spacing:1px;text-transform:uppercase;color:#ffffff;text-decoration:none;">${keep(`${esc(button.label)} &rarr;`, 'span')}</a>
    </td></tr></table>
    <p style="margin:18px 0 0;font-family:${BODY};font-size:12px;line-height:1.6;color:${C.soft};">Button not working? Paste this into your browser:<br><a href="${esc(button.url)}" style="color:#ff5a52;word-break:break-all;">${esc(button.url)}</a></p>` : ''}
    ${after ? `<p style="margin:22px 0 0;padding-top:16px;border-top:1px dashed ${C.line};font-family:${BODY};font-size:13px;line-height:1.6;color:${C.soft};">${esc(after)}</p>` : ''}
  </td></tr>
  <tr><td style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr>
  <tr><td align="center" style="${paint(C.ink)}border:3px solid ${C.ink};padding:18px 14px 16px;font-family:${BODY};font-size:13px;line-height:1.6;color:${C.foot};">
    ${b.tagline ? `<span style="display:block;margin-bottom:10px;">${keep(esc(b.tagline), 'span')}</span>` : ''}<a href="${esc(home)}" style="${footLink}">${keep(esc(home.replace(/^https?:\/\//, '')), 'span')}</a>${insta ? `<span style="color:${C.bright};font-weight:900;">&nbsp;&nbsp;/&nbsp;&nbsp;</span><a href="${esc(insta.url)}" style="${footLink}">${keep('Instagram', 'span')}</a>` : ''}
    ${unsubscribe ? `<span style="display:block;margin-top:12px;font-family:${BODY};font-size:12px;line-height:1.5;color:${C.soft};">No more news emails? <a href="${esc(unsubscribe)}" style="color:#ff5a52;text-decoration:underline;">Unsubscribe</a></span>` : ''}
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
   An email is { to, subject, kicker, title, lines, button: { label, url }, picture: { src, title, text },
   code: { label, text, note } (a discount code, in a dashed box), orders: [{ title, sub, rows: [[what, price]],
   total, foot }] (orders written out, a box each), items: [{ src, title, text, url }] (pieces in a grid),
   highlight: { label, title, lines } (a box for an event), unsubscribe (a link in the footer), list: { unsubscribe }
   (the List-Unsubscribe header), after, replyTo, attachments: [{ filename, content (a Buffer),
   contentType }] (files sent with it: a finished commission) }. */
export const siteUrl = (req) => (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL ? '' : `http://${req.headers.host}`)).replace(/\/$/, '')
// the artist's own inbox, as for the Contact form: CONTACT_TO, else the contact email in the admin
// (Site → Name, colour and contact), else the address the site sends from
/* Emails to the artist can be switched off, each kind on its own (Shop → Settings and payments →
   Emails to you, content/site/shop.json `emails`): 'orders' (a new shop order), 'commissions' (a new
   commission request, and a commission paid), 'replies' (a customer's message on a commission, or
   their cancelling it). On unless switched off; read afresh each time. Emails to customers never
   depend on these. */
export const emailsToArtist = (kind) => {
  try {
    const emails = (JSON.parse(readFileSync(join(process.cwd(), 'content/site/shop.json'), 'utf8')) || {}).emails || {}
    return emails[kind] !== false
  } catch { return true }
}
export const artistInbox = () => {
  const m = String(process.env.MAIL_FROM || '').match(/<([^>]+)>/)
  return process.env.CONTACT_TO || brandInfo().email || (m && m[1]) || process.env.SMTP_USER || String(process.env.MAIL_FROM || '').trim()
}
const smtpReady = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
export const mailReady = () => smtpReady() || Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM)
let transport = null
const smtp = () => transport || (transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: (Number(process.env.SMTP_PORT) || 465) === 465,
  auth: { user: process.env.SMTP_USER, pass: String(process.env.SMTP_PASS).replace(/\s+/g, '') },
}))
/* Addresses that can never receive email: the reserved test domains (example.com/.net/.org and
   anything under them, *.test, *.example, *.invalid, *.localhost, localhost). Test accounts use
   them; sending there only bounces back into the site's own inbox, so those emails are skipped
   (and printed in the log) while the journey carries on as if they were sent. */
const TEST_DOMAIN = /(^|\.)(example\.(com|net|org)|[^.]+\.(test|example|invalid|localhost)|test|example|invalid|localhost)$/i
export const testAddress = (to) => {
  const m = String(to || '').trim().toLowerCase().match(/<([^>]+)>\s*$/)
  const domain = String(m ? m[1] : to || '').trim().toLowerCase().split('@').pop().replace(/\.$/, '')
  return TEST_DOMAIN.test(domain)
}
export const sendMail = async (mail) => {
  const { to, subject, lines, button, after } = mail
  const files = Array.isArray(mail.attachments) ? mail.attachments.filter((a) => a && a.filename && a.content) : []
  if (testAddress(to)) { console.log(`[email skipped: test address] ${to} / ${subject}${files.length ? ` / ${files.length} file${files.length === 1 ? '' : 's'}: ${files.map((a) => a.filename).join(', ')}` : ''}`); return true }
  const brand = process.env.MAIL_BRAND || siteName()
  const text = [mail.title || subject, '', ...lines, ...(Array.isArray(mail.orders) ? mail.orders.map((o) => ['', ...[`${o.title}${o.sub ? ` (${o.sub})` : ''}`, ...(o.rows || []).map(([l, v]) => `  ${l}  ${v || ''}`), o.total ? `  Total  ${o.total}` : '', o.foot ? `  ${o.foot}` : ''].filter(Boolean)].join('\n')) : []), mail.code ? `\n${mail.code.label || 'Your code'}: ${mail.code.text}${mail.code.note ? ` (${mail.code.note})` : ''}` : '', mail.picture ? `\n${mail.picture.title}: ${mail.picture.text}` : '', ...(Array.isArray(mail.items) && mail.items.length ? ['', ...mail.items.map((i) => `  ${i.title}${i.text ? `  ${i.text}` : ''}`)] : []), mail.highlight ? `\n${mail.highlight.title}\n${(mail.highlight.lines || []).join('\n')}` : '', button ? `\n${button.label}: ${button.url}` : '', after ? `\n${after}` : '', '', `— ${brand}`, ...(mail.unsubscribe ? ['', `No more news emails? Unsubscribe: ${mail.unsubscribe}`] : [])].join('\n')
  if (!mailReady()) {
    // on this computer the link is printed instead, so the whole journey can be tried without email
    if (!process.env.VERCEL) console.log(`\n[email to ${to}] ${subject}\n${text}\n${files.length ? `(with ${files.map((a) => `${a.filename}, ${a.content.length} bytes`).join('; ')})\n` : ''}`)
    else console.warn('email not sent: no SMTP_* or RESEND_API_KEY / MAIL_FROM set')
    return false
  }
  const html = emailHtml(mail)
  const from = process.env.MAIL_FROM || `${brand} <${process.env.SMTP_USER}>`
  const replyTo = mail.replyTo || process.env.MAIL_REPLY_TO || undefined // a contact message: replies go to the visitor
  // a mailing to many: mail apps show their own Unsubscribe button from this header
  const list = mail.list && mail.list.unsubscribe ? { unsubscribe: mail.list.unsubscribe } : null
  if (smtpReady()) {
    try {
      await smtp().sendMail({ from, to, subject, text, html, replyTo, ...(list ? { list } : {}), ...(files.length ? { attachments: files.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType || undefined })) } : {}) })
      return true
    } catch (e) { console.error('the email server refused the email:', e && (e.response || e.message)); return false }
  }
  try {
    const answer = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}), ...(list ? { headers: { 'List-Unsubscribe': `<${list.unsubscribe}>` } } : {}), ...(files.length ? { attachments: files.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') })) } : {}) }) })
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
  newsAsked: Boolean(u.newsAskedAt || u.unsubscribedAt), // said no thanks to news (or unsubscribed): the account stops asking
  createdAt: u.createdAt,
  lastVisit: u.prevLogin || u.createdAt, // for "new since your last visit"
  avatar: typeof u.avatar === 'string' ? u.avatar : '',
  card: typeof u.card === 'string' ? u.card : '', // the membership card design they chose (a reward)
  gifts: Array.isArray(u.gifts) ? u.gifts.map((g) => g && g.id).filter(Boolean) : [], // rewards the admin gave them
  newGifts: Array.isArray(u.newGifts) ? u.newGifts.filter((g) => typeof g === 'string') : [], // given and not seen yet: reward ids, and 'code:<id>' for a code
  // discount codes the admin gave them (Sales → Discounts)
  giftCodes: Array.isArray(u.giftCodes) ? u.giftCodes.filter((g) => g && g.id).map((g) => ({ id: g.id, code: g.code, percent: g.percent, until: g.until || null, label: g.label || '', at: g.at || null, ...(g.usedAt ? { usedAt: g.usedAt } : {}) })) : [],
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
