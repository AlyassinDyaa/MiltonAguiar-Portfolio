import { db, dbReady } from './_db.js'
import { EMAIL, artistInbox, clean, clientIp, fromThisSite, mailReady, noteTry, sendMail } from './_users.js'

/* The Contact and Commission forms, sent straight to the artist's inbox: the visitor presses Send
   and that is it, no mail app. The email comes from the site's own address (the SMTP_* or Resend
   settings, the same as the account emails) and replying to it answers the visitor.

   POST { form: 'contact', name, email, topic, message }
   POST { form: 'commission', name, email, kind, idea, refs, due }
   Both also carry `website` (a field people never see: a bot fills it in) and `opened` (when the
   form was shown: a person takes more than a few seconds).

   Where it goes: the artist's inbox (api/_users.js, artistInbox: CONTACT_TO if set, else the Gmail
   the site sends from, else the contact email in the admin). With no way to send email it answers
   503 and the page offers Instagram or the email address instead. No copy goes to the visitor, so
   nobody can use the form to send emails to other people. */

/* How often: up to 3 messages an hour from one email address (and, against a flood from one place,
   10 an hour from one connection). Only messages that went out count. Without the database, a count
   kept by this function while it stays warm. */
const HOUR = 3600e3
const PER_EMAIL = 3
const PER_IP = 10
const memory = new Map()
// the times (ms) of this key's messages in the last hour, oldest first
const sentLately = async (key) => {
  const since = Date.now() - HOUR
  if (dbReady()) {
    const d = await db()
    return (await d.collection('attempts').find({ key, at: { $gt: new Date(since) } }, { projection: { at: 1 } }).sort({ at: 1 }).toArray()).map((x) => +x.at)
  }
  return (memory.get(key) || []).filter((t) => t > since)
}
const noteSent = async (key) => {
  if (dbReady()) return noteTry(key)
  memory.set(key, [...(memory.get(key) || []).filter((t) => t > Date.now() - HOUR), Date.now()])
}
// minutes until another may be sent: 0 when one can go now
const minutesLeft = (times, max) => (times.length < max ? 0 : Math.max(1, Math.ceil((times[times.length - max] + HOUR - Date.now()) / 60000)))

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const say = (status, body) => res.status(status).json(body)
  if (req.method !== 'POST') return say(405, { message: 'Send the form with POST.' })
  if (!fromThisSite(req)) return say(403, { message: 'That did not come from this site.' })
  const b = req.body && typeof req.body === 'object' ? req.body : {}

  // a bot: it filled in the hidden field, or sent the form the moment it appeared. It is told all
  // went well, so it does not try again, and nothing is sent.
  const opened = Number(b.opened) || 0
  if (clean(b.website, 200) || (opened && Date.now() - opened < 2500)) return say(200, { ok: true })

  const commission = b.form === 'commission'
  const name = clean(b.name, 80)
  const email = clean(b.email, 254).toLowerCase()
  const text = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max)
  const message = text(commission ? b.idea : b.message, 5000)
  if (!name) return say(400, { message: 'Add your name.', field: 'name' })
  if (!EMAIL.test(email)) return say(400, { message: 'That email address does not look right.', field: 'email' })
  if (message.length < 2) return say(400, { message: commission ? 'Tell me the idea.' : 'Write a message.', field: commission ? 'idea' : 'message' })

  const to = artistInbox() // the artist's own inbox (see api/_users.js: not the forwarding address, which Gmail would keep in Sent only)
  if (!mailReady() || !to) return say(503, { fallback: true, message: 'Messages cannot be sent from the site right now.' })
  const keys = [`contact-email:${email}`, `contact-ip:${clientIp(req)}`]
  const wait = Math.max(minutesLeft(await sentLately(keys[0]), PER_EMAIL), minutesLeft(await sentLately(keys[1]), PER_IP))
  if (wait) return say(429, { message: `You can send up to ${PER_EMAIL} messages an hour. Try again in ${wait} minute${wait === 1 ? '' : 's'}, or write on Instagram.` })

  const paras = message.split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean)
  const kind = text(b.kind, 80)
  const topic = text(b.topic, 80)
  const mail = commission
    ? {
      subject: `Commission request: ${kind || 'a piece'} for ${name}`,
      kicker: 'Commission request',
      title: `${kind || 'A commission'} for ${name}`,
      lines: [`From ${name} (${email})`, ...paras, `Reference pictures: ${text(b.refs, 500) || 'none yet'}`, `Needed by: ${text(b.due, 120) || 'no deadline'}`],
    }
    : {
      subject: `${topic ? `[${topic}] ` : ''}Message from ${name}`,
      kicker: topic || 'New message',
      title: `A message from ${name}`,
      lines: [`From ${name} (${email})`, ...paras],
    }
  const sent = await sendMail({ ...mail, to, fromLabel: email, replyTo: `${name.replace(/[<>"]/g, '')} <${email}>`, after: `Sent from the ${commission ? 'Commissions' : 'Contact'} page. Reply to this email to answer ${name} directly.` })
  if (!sent) return say(502, { fallback: true, message: 'The message could not be sent just now.' })
  for (const k of keys) { try { await noteSent(k) } catch { /* not counted this time */ } }
  return say(200, { ok: true })
}
