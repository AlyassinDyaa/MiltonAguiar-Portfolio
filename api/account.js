import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db, dbReady } from './_db.js'
import { forCustomer } from './_orders.js'
import { accountsMode } from './_buyer.js'
import { packEmails, stripe } from './_discounts.js'
import { randomBytes } from 'node:crypto'
import {
  EMAIL, checkPassword, clean, cleanCart, cleanSlugs, clientIp, currentUser, endSession, forgetCookie, forgetTries, fromThisSite, hashPassword,
  makeToken, mergeCarts, newId, noteTry, passwordProblem, publicUser, sendMail, siteUrl, startSession, tidyEmail, tooMany, spendToken,
} from './_users.js'

/* Customer accounts. One function for all of it, chosen by `action`:

   GET  /api/account                          who is logged in: { enabled, user }
   POST { action: 'signup', email, password, name, cart }
        { action: 'login', email, password, cart }       (the browser's cart joins the account's)
        { action: 'logout' }
        { action: 'forgot', email }                       emails a reset link (always answers the same)
        { action: 'reset', token, password }
        { action: 'verify', token }                       confirms the email address
        { action: 'resend' }                              a new confirmation email
        { action: 'password', current, password }         change it (other devices are logged out)
        { action: 'profile', name, phone, marketing, avatar, card }
             card: '' (the site's own design) or the id of a membership card design they have earned
             avatar: '' (initials), 'icon:<picture>' (one of the free pictures set in the admin),
             or a piece's slug (only a piece this customer has bought)
        { action: 'saved', saved }                         the pieces kept for later (slugs)
        { action: 'cart', cart }                          keeps the cart with the account
        { action: 'orders' }                              this customer's orders, newest first
        { action: 'removeOrder', number, password }       takes an order out of their account (the shop keeps it)
        { action: 'everywhere' }                          logs out every device
        { action: 'delete', password }                    deletes the account (orders stay, unlinked)

   Needs MONGODB_URI. Emails need SMTP_HOST/SMTP_USER/SMTP_PASS (or RESEND_API_KEY and MAIL_FROM);
   links in them use SITE_URL. Nothing here works unless customer accounts are Optional or
   Required (Shop → Customer accounts in the admin). */
const RESET_MINUTES = 60
const VERIFY_HOURS = 48

const say = (res, status, body) => res.status(status).json(body)

// ---------- member numbers: 1 for the first customer, 2 for the next... One more than the highest
// number an account holds now, so a deleted account takes nothing with it: delete the newest
// account and the next one to sign up gets its number. Two accounts never hold the same number
// at once (the database refuses it, and the signup simply takes the next).
const nextMemberNo = async (d) => {
  const top = await d.collection('users').find({ memberNo: { $gt: 0 } }).sort({ memberNo: -1 }).limit(1).toArray()
  return ((top[0] && Number(top[0].memberNo)) || 0) + 1
}
// a customer from before member numbers gets the next one the first time they come back
const withMemberNo = async (d, user) => {
  if (!user || user.memberNo) return user
  for (let tries = 0; ; tries++) {
    const memberNo = await nextMemberNo(d)
    try {
      await d.collection('users').updateOne({ _id: user._id }, { $set: { memberNo } })
      return { ...user, memberNo }
    } catch (e) { if (!(e && e.code === 11000) || tries >= 4) throw e }
  }
}

// ---------- which profile pictures a customer may use
const readJson = (path) => { try { return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) } catch { return null } }
const freePictures = () => {
  const page = readJson('content/pages/account.json') || {}
  return (Array.isArray(page.icons) ? page.icons : []).map((i) => i && String(i.picture || '')).filter(Boolean)
}
/* ---------- rewards (Shop → Rewards in the admin): profile pictures, membership card designs and
   discounts a customer earns, by confirming their email, by a number of orders (3, 6, 10...), or
   by a number of pieces collected. Each has an id made from its name. A discount is a personal
   code, made in Stripe the moment it is earned, that only this customer's email can use. */
const slug = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
const rewardsList = () => {
  const page = readJson('content/pages/rewards.json')
  const list = page && Array.isArray(page.rewards) ? page.rewards
    // before the Rewards screen: the pictures for confirming the email, kept with the account page
    : ((readJson('content/pages/account.json') || {}).verifiedIcons || []).map((i) => ({ ...i, kind: 'picture', earnedBy: 'verify' }))
  const kindOf = (r) => (['card', 'discount'].includes(r.kind) ? r.kind : 'picture')
  return list.filter((r) => r && !r.hidden && (kindOf(r) === 'card' ? r.cardLook || r.cardArt : kindOf(r) === 'discount' ? Number(r.percent) > 0 : r.picture))
    .map((r) => {
      const by = r.earnedBy === 'firstOrder' ? 'orders' : ['verify', 'orders', 'pieces'].includes(r.earnedBy) ? r.earnedBy : 'verify'
      return {
        id: slug(r.name) || slug(r.picture), name: String(r.name || ''), kind: kindOf(r), earnedBy: by,
        count: by === 'verify' ? 0 : Math.max(1, Math.round(Number(r.count) || Number(r.pieces) || 1)),
        picture: String(r.picture || ''), percent: Math.min(100, Math.max(1, Number(r.percent) || 10)), days: Math.max(1, Math.round(Number(r.days) || 60)),
      }
    })
}
// how far a customer has come: email confirmed, orders, pieces (refunded and deleted orders do not count)
const progressOf = async (d, user) => {
  const match = user.verified ? { $or: [{ userId: user._id }, { email: user.email }] } : { userId: user._id }
  const orders = await d.collection('orders').find({ ...match, status: 'paid', hidden: { $ne: true } }).limit(500).toArray()
  return { verified: Boolean(user.verified), orders: orders.length, pieces: orders.reduce((n, o) => n + (o.items || []).reduce((m, i) => m + (Number(i.qty) || 1), 0), 0) }
}
const earns = (r, p) => (r.earnedBy === 'verify' ? p.verified : r.earnedBy === 'orders' ? p.orders >= r.count : p.pieces >= r.count)
// a discount reward earned: its personal code, made once in Stripe (one use, only with this email, for
// the days the admin set) and kept with the customer
const rewardCode = async (d, user, r) => {
  const had = user.rewardCodes && user.rewardCodes[r.id]
  if (had) return had
  if (!process.env.STRIPE_SECRET_KEY) return null // discounts live in Stripe: none without its key
  // the site's initials and the percentage, then a random part: MA10-3DB3B3
  const initials = String(((readJson('content/site/brand.json') || {}).name) || 'MA').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'MA'
  const code = `${initials}${Math.round(r.percent)}-${randomBytes(3).toString('hex').toUpperCase()}`
  const until = Date.now() + r.days * 864e5
  const fields = { id: code, percent_off: String(r.percent), duration: 'once', name: `${r.percent}% off · ${r.name}`.slice(0, 40), redeem_by: String(Math.floor(until / 1000)), max_redemptions: '1', 'metadata[ma]': '1', 'metadata[starts]': String(Date.now()), 'metadata[reward]': r.id, 'metadata[member]': String(user.memberNo || '') }
  for (const [k, v] of Object.entries(packEmails([user.email]))) fields[`metadata[${k}]`] = v
  await stripe('coupons', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() })
  const got = { code, percent: r.percent, until }
  await d.collection('users').updateOne({ _id: user._id }, { $set: { [`rewardCodes.${r.id}`]: got } })
  return got
}
const rewardPictures = () => rewardsList().filter((r) => r.kind === 'picture' && r.earnedBy === 'verify').map((r) => r.picture) // given on confirming
const cardAllowed = async (d, user, card) => {
  if (!card) return true
  const r = rewardsList().find((x) => x.kind === 'card' && x.id === card)
  return Boolean(r) && earns(r, await progressOf(d, user))
}

const pieces = () => {
  try {
    return readdirSync(join(process.cwd(), 'content/work')).filter((f) => f.endsWith('.json')).map((f) => ({ slug: f.slice(0, -5), ...(readJson(`content/work/${f}`) || {}) })).filter((p) => p.title)
  } catch { return [] }
}
// the pieces this customer has bought (an order line "Born Again — A3 (signed)" is Born Again)
const ownedSlugs = async (d, user) => {
  const match = user.verified ? { $or: [{ userId: user._id }, { email: user.email }] } : { userId: user._id }
  const orders = await d.collection('orders').find({ ...match, status: 'paid', hidden: { $ne: true } }).sort({ createdAt: -1 }).limit(200).toArray()
  const all = pieces().sort((a, b) => b.title.length - a.title.length)
  const owned = new Set()
  for (const o of orders) for (const i of o.items || []) { const p = all.find((x) => String(i.name || '').startsWith(x.title)); if (p) owned.add(p.slug) }
  return owned
}
const pictureAllowed = async (d, user, avatar) => {
  if (!avatar) return true
  if (avatar.startsWith('icon:')) {
    const pic = avatar.slice(5)
    if (freePictures().includes(pic)) return true
    const r = rewardsList().find((x) => x.kind === 'picture' && x.picture === pic)
    return Boolean(r) && earns(r, await progressOf(d, user))
  }
  return /^[a-z0-9-]{1,80}$/.test(avatar) && (await ownedSlugs(d, user)).has(avatar)
}

// the email is confirmed: the reward pictures are theirs, and one still showing their initials gets
// the first one as their picture straight away (they can change it under Details any time)
const giveReward = async (users, user) => {
  const rewards = rewardPictures()
  if (!rewards.length || !user || user.avatar) return { rewards, avatar: user ? user.avatar || '' : '' }
  const avatar = `icon:${rewards[0]}`
  await users.updateOne({ _id: user._id }, { $set: { avatar } })
  return { rewards, avatar }
}

const sendVerify = async (req, user) => {
  const token = await makeToken(user._id, 'verify', VERIFY_HOURS * 60)
  // the reward, shown in the email: the first reward picture (the built-in shield as a PNG, which every
  // email app can show)
  const reward = rewardPictures()[0]
  const pic = reward ? { src: reward === '/avatars/confirmed.svg' ? '/email/confirmed.png' : reward, title: 'A picture just for you', text: ' Confirm, and it is yours: a profile picture only confirmed members can use.' } : null
  return sendMail({
    to: user.email,
    subject: 'Confirm your email',
    kicker: 'Your account',
    title: 'Confirm your email',
    lines: [`Hi${user.name ? ` ${user.name.split(' ')[0]}` : ''},`, 'Welcome in. Confirm this is your email address and your account can show every order placed with it, from the studio to your door.'],
    picture: pic,
    button: { label: 'Confirm my email', url: `${siteUrl(req)}/account/verify?token=${token}` },
    after: `The link works for ${VERIFY_HOURS} hours. Did not make an account? Ignore this email and nothing happens.`,
  })
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!dbReady()) return say(res, req.method === 'GET' ? 200 : 503, req.method === 'GET' ? { enabled: false, user: null } : { message: 'Accounts are not set up yet.' })
  if (accountsMode() === 'off') return say(res, req.method === 'GET' ? 200 : 403, req.method === 'GET' ? { enabled: false, user: null } : { message: 'Accounts are switched off.' })

  try {
    const d = await db()
    const users = d.collection('users')
    if (req.method === 'GET') {
      let me = await withMemberNo(d, await currentUser(req))
      // a picture that is no longer theirs to use (an old choice, or a free picture taken out) goes back to initials
      if (me && me.avatar && !(await pictureAllowed(d, me, me.avatar))) { await users.updateOne({ _id: me._id }, { $set: { avatar: '' } }); me = { ...me, avatar: '' } }
      if (me && me.card && !(await cardAllowed(d, me, me.card))) { await users.updateOne({ _id: me._id }, { $set: { card: '' } }); me = { ...me, card: '' } }
      return say(res, 200, { enabled: true, user: publicUser(me) })
    }
    if (req.method !== 'POST') return say(res, 405, { message: 'Use GET or POST.' })
    if (!fromThisSite(req)) return say(res, 403, { message: 'That request did not come from this site.' })
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const ip = clientIp(req)
    const action = String(body.action || '')

    // ---------- without a login
    if (action === 'signup') {
      const email = tidyEmail(body.email)
      const name = clean(body.name, 80)
      if (!EMAIL.test(email)) return say(res, 400, { message: 'That email address does not look right.', field: 'email' })
      const weak = passwordProblem(body.password)
      if (weak) return say(res, 400, { message: weak, field: 'password' })
      if (await tooMany(`signup:${ip}`, 10, 60)) return say(res, 429, { message: 'Too many new accounts from here. Try again in an hour.' })
      await noteTry(`signup:${ip}`)
      if (await users.findOne({ email })) return say(res, 409, { message: 'There is already an account with that email. Log in, or reset the password.', field: 'email' })
      const user = { _id: newId('u'), memberNo: 0, email, name, phone: '', password: await hashPassword(body.password), verified: false, marketing: Boolean(body.marketing), cart: cleanCart(body.cart), createdAt: new Date() }
      // the next member number; should someone else sign up in the same instant and take it, the one after
      for (let tries = 0; ; tries++) {
        user.memberNo = await nextMemberNo(d)
        try { await users.insertOne(user); break } catch (e) {
          if (!(e && e.code === 11000)) throw e
          if (await users.findOne({ email })) return say(res, 409, { message: 'There is already an account with that email. Log in, or reset the password.', field: 'email' })
          if (tries >= 4) throw e
        }
      }
      await startSession(req, res, user._id)
      const mailed = await sendVerify(req, user)
      return say(res, 200, { user: publicUser(user), mailed })
    }

    if (action === 'login') {
      const email = tidyEmail(body.email)
      if (await tooMany(`login:${email}`, 8, 15) || await tooMany(`login-ip:${ip}`, 30, 15)) return say(res, 429, { message: 'Too many tries. Wait 15 minutes, or reset the password.' })
      const user = EMAIL.test(email) ? await users.findOne({ email }) : null
      const good = await checkPassword(body.password, user && user.password)
      if (!user || !good) {
        await noteTry(`login:${email}`, `login-ip:${ip}`)
        return say(res, 401, { message: 'That email and password do not match an account.' })
      }
      await forgetTries(`login:${email}`)
      const cart = mergeCarts(user.cart, body.cart)
      // the visit before this one, so the account can show what is new since
      await users.updateOne({ _id: user._id }, { $set: { cart, lastLogin: new Date(), prevLogin: user.lastLogin || user.createdAt } })
      await startSession(req, res, user._id)
      return say(res, 200, { user: publicUser(await withMemberNo(d, { ...user, cart, prevLogin: user.lastLogin || user.createdAt })) })
    }

    if (action === 'logout') {
      await endSession(req, res)
      return say(res, 200, { user: null })
    }

    if (action === 'forgot') {
      const email = tidyEmail(body.email)
      const done = { sent: true } // the same answer whether or not there is an account, so the form cannot be used to find out
      if (!EMAIL.test(email)) return say(res, 400, { message: 'That email address does not look right.', field: 'email' })
      if (await tooMany(`forgot:${email}`, 3, 60) || await tooMany(`forgot-ip:${ip}`, 10, 60)) return say(res, 200, done)
      await noteTry(`forgot:${email}`, `forgot-ip:${ip}`)
      const user = await users.findOne({ email })
      if (user) {
        const token = await makeToken(user._id, 'reset', RESET_MINUTES)
        await sendMail({
          to: email,
          subject: 'Reset your password',
          kicker: 'Your account',
          title: 'Choose a new password',
          lines: ['Someone (hopefully you) asked to reset the password for this account.', 'Choose a new one with the button below, and you are logged in straight away.'],
          after: `The link works for ${RESET_MINUTES} minutes, once. If it was not you, ignore this email: your password stays as it is.`,
          button: { label: 'Choose a new password', url: `${siteUrl(req)}/account/reset?token=${token}` },
        })
      }
      return say(res, 200, done)
    }

    if (action === 'reset') {
      const weak = passwordProblem(body.password)
      if (weak) return say(res, 400, { message: weak, field: 'password' })
      const token = await spendToken(body.token, 'reset')
      if (!token) return say(res, 400, { message: 'This link has run out or has been used. Ask for a new one.' })
      const user = await users.findOne({ _id: token.userId })
      if (!user) return say(res, 400, { message: 'This account no longer exists.' })
      // a reset link reached the inbox, so the address is confirmed too; every other login ends
      await users.updateOne({ _id: user._id }, { $set: { password: await hashPassword(body.password), verified: true } })
      const given = user.verified ? { avatar: user.avatar } : await giveReward(users, { ...user, verified: true })
      user.avatar = given.avatar
      await d.collection('sessions').deleteMany({ userId: user._id })
      await forgetTries(`login:${user.email}`)
      await startSession(req, res, user._id)
      return say(res, 200, { user: publicUser({ ...user, verified: true }) })
    }

    if (action === 'verify') {
      const token = await spendToken(body.token, 'verify')
      if (!token) return say(res, 400, { message: 'This link has run out or has been used. Log in and ask for a new one.' })
      await users.updateOne({ _id: token.userId }, { $set: { verified: true } })
      const { rewards } = await giveReward(users, await users.findOne({ _id: token.userId }))
      const user = await currentUser(req)
      return say(res, 200, { verified: true, rewards, user: publicUser(user) })
    }

    // ---------- with a login
    const user = await currentUser(req)
    if (!user) { forgetCookie(req, res); return say(res, 401, { message: 'Log in first.', user: null }) }

    if (action === 'rewards') {
      // every reward, whether it is earned, and how far they have come; discounts earned get their code
      const p = await progressOf(d, user)
      const list = []
      for (const r of rewardsList()) {
        const earned = earns(r, p)
        let code = null
        if (earned && r.kind === 'discount') { try { code = await rewardCode(d, user, r) } catch (e) { console.error('reward code not made:', e.message) } }
        list.push({ id: r.id, name: r.name, kind: r.kind, earnedBy: r.earnedBy, count: r.count, percent: r.kind === 'discount' ? r.percent : undefined, days: r.kind === 'discount' ? r.days : undefined, earned, code })
      }
      return say(res, 200, { progress: p, rewards: list })
    }

    if (action === 'resend') {
      if (user.verified) return say(res, 200, { user: publicUser(user) })
      if (await tooMany(`verify:${user._id}`, 3, 60)) return say(res, 429, { message: 'A few have been sent already. Check your inbox (and spam), or try again in an hour.' })
      await noteTry(`verify:${user._id}`)
      const mailed = await sendVerify(req, user)
      return say(res, 200, { user: publicUser(user), mailed })
    }

    if (action === 'password') {
      if (await tooMany(`login:${user.email}`, 8, 15)) return say(res, 429, { message: 'Too many tries. Wait 15 minutes.' })
      if (!(await checkPassword(body.current, user.password))) { await noteTry(`login:${user.email}`); return say(res, 400, { message: 'The current password is not right.', field: 'current' }) }
      const weak = passwordProblem(body.password)
      if (weak) return say(res, 400, { message: weak, field: 'password' })
      await users.updateOne({ _id: user._id }, { $set: { password: await hashPassword(body.password) } })
      await d.collection('sessions').deleteMany({ userId: user._id, hash: { $ne: user.session } })
      return say(res, 200, { user: publicUser(user), changed: true })
    }

    if (action === 'profile') {
      const set = { name: clean(body.name, 80), phone: clean(body.phone, 30), marketing: Boolean(body.marketing) }
      if (body.card !== undefined) {
        const card = clean(body.card, 80)
        if (!(await cardAllowed(d, user, card))) return say(res, 400, { message: 'That card design is not one you have earned yet.', field: 'card' })
        set.card = card
      }
      if (body.avatar !== undefined) {
        const avatar = clean(body.avatar, 300)
        if (!(await pictureAllowed(d, user, avatar))) return say(res, 400, { message: 'That picture is not one you can use.', field: 'avatar' })
        set.avatar = avatar
      }
      await users.updateOne({ _id: user._id }, { $set: set })
      return say(res, 200, { user: publicUser({ ...user, ...set }) })
    }

    if (action === 'cart') {
      const cart = cleanCart(body.cart)
      await users.updateOne({ _id: user._id }, { $set: { cart } })
      return say(res, 200, { saved: true })
    }

    if (action === 'saved') {
      const saved = cleanSlugs(body.saved)
      await users.updateOne({ _id: user._id }, { $set: { saved } })
      return say(res, 200, { user: publicUser({ ...user, saved }) })
    }

    if (action === 'orders') {
      // orders placed while logged in, and (once the address is confirmed) any placed with it as a guest
      const match = user.verified ? { $or: [{ userId: user._id }, { email: user.email }] } : { userId: user._id }
      const list = await d.collection('orders').find({ ...match, status: { $in: ['paid', 'refunded'] }, customerRemoved: { $ne: true }, hidden: { $ne: true } }).sort({ createdAt: -1 }).limit(100).toArray()
      return say(res, 200, { orders: list.map(forCustomer) })
    }

    if (action === 'removeOrder') {
      // out of the customer's account, once they type their password. The shop keeps the sale on
      // record (posting, refunds, tax) and the admin still sees it.
      if (await tooMany(`login:${user.email}`, 8, 15)) return say(res, 429, { message: 'Too many tries. Wait 15 minutes.' })
      if (!(await checkPassword(body.password, user.password))) { await noteTry(`login:${user.email}`); return say(res, 400, { message: 'The password is not right.', field: 'password' }) }
      const number = String(body.number || '').trim().toUpperCase().slice(0, 20)
      const match = user.verified ? { $or: [{ userId: user._id }, { email: user.email }] } : { userId: user._id }
      const list = await d.collection('orders').find({ ...match, status: { $in: ['paid', 'refunded'] }, customerRemoved: { $ne: true }, hidden: { $ne: true } }).limit(200).toArray()
      const order = number && list.find((o) => forCustomer(o).number === number)
      if (!order) return say(res, 404, { message: 'That order is not in your account any more.' })
      await d.collection('orders').updateOne({ ref: order.ref }, { $set: { customerRemoved: true, removedAt: new Date() } })
      return say(res, 200, { removed: number })
    }

    if (action === 'everywhere') {
      await d.collection('sessions').deleteMany({ userId: user._id })
      forgetCookie(req, res)
      return say(res, 200, { user: null })
    }

    if (action === 'delete') {
      if (!(await checkPassword(body.password, user.password))) return say(res, 400, { message: 'The password is not right.', field: 'password' })
      await d.collection('sessions').deleteMany({ userId: user._id })
      await d.collection('tokens').deleteMany({ userId: user._id })
      await d.collection('orders').updateMany({ userId: user._id }, { $set: { userId: null } }) // the shop keeps its records of sales
      await users.deleteOne({ _id: user._id })
      forgetCookie(req, res)
      return say(res, 200, { user: null, deleted: true })
    }

    return say(res, 400, { message: 'Nothing to do.' })
  } catch (e) {
    console.error('account:', e && e.message)
    return say(res, 500, { message: 'Something went wrong on our side. Try again in a moment.' })
  }
}
