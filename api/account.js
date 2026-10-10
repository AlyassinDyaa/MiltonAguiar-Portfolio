import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db, dbReady } from './_db.js'
import { forCustomer, numberMember, stripeCodes, usesHere } from './_orders.js'
import { accountsMode } from './_buyer.js'
import { countedMatch } from './_commissions.js'
import { adminOk } from './_session.js'
import { mailingAction, unsubscribe } from './_mailings.js'
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
        { action: 'unsubscribe', u, t }                   no more news emails (the link in a mailing: api/_mailings.js)
        { action: 'resend' }                              a new confirmation email
        { action: 'password', current, password }         change it (other devices are logged out)
        { action: 'news', on }                            yes or no to news emails, from the question on the overview
        { action: 'profile', name, phone, marketing, avatar, card }
             card: '' (the site's own design) or the id of a membership card design they have earned
             avatar: '' (initials), 'icon:<picture>' (one of the free pictures set in the admin),
             or a piece's slug (only a piece this customer has bought)
        { action: 'saved', saved }                         the pieces kept for later (slugs)
        { action: 'cart', cart }                          keeps the cart with the account
        { action: 'orders' }                              this customer's orders, newest first
        { action: 'rewards' }                             every reward, earned or not, and how far they have come
        { action: 'seenGifts' }                           what the admin gave them (rewards, codes) is no longer new
        { action: 'giftShelf', id, to }                   a gift ("code:<id>" or a reward id) archived, restored or deleted
                                                          (to: 'archive', 'restore' or 'delete': it only tidies their list)
        { action: 'removeOrders', numbers, password }     takes orders out of their account (the shop keeps them),
                                                          after emailing them a copy of each (nothing goes if it cannot be sent)
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
   by a number of pieces collected, or as a gift from the admin. Each has an id made from its name.
   A discount is a personal code, made in Stripe when the customer first looks at Rewards after
   earning it (one use, for the days set on the reward), that only their account can use; it is
   listed in the admin's Discounts screen too. */
const slug = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
const rewardsList = () => {
  const page = readJson('content/pages/rewards.json') || {}
  const of = (key, kind) => (Array.isArray(page[key]) ? page[key] : []).map((r) => ({ ...r, kind }))
  // the Rewards screen has a list for each kind; an older file kept them in one list ("rewards"),
  // and before that the pictures for confirming the email lived with the account page
  const list = [...of('pictures', 'picture'), ...of('cards', 'card'), ...of('discounts', 'discount'),
    ...(Array.isArray(page.rewards) ? page.rewards : []),
    ...(page.pictures || page.rewards ? [] : ((readJson('content/pages/account.json') || {}).verifiedIcons || []).map((i) => ({ ...i, kind: 'picture', earnedBy: 'verify' })))]
  const kindOf = (r) => (['card', 'discount'].includes(r.kind) ? r.kind : 'picture')
  return list.filter((r) => r && !r.hidden && (kindOf(r) === 'card' ? r.cardLook || r.cardArt : kindOf(r) === 'discount' ? Number(r.percent) > 0 : r.picture))
    .map((r) => {
      const by = r.earnedBy === 'firstOrder' ? 'orders' : ['verify', 'orders', 'pieces', 'commissions'].includes(r.earnedBy) ? r.earnedBy : 'verify'
      return {
        id: slug(r.name) || slug(r.picture), name: String(r.name || ''), kind: kindOf(r), earnedBy: by,
        count: by === 'verify' ? 0 : Math.max(1, Math.round(Number(r.count) || Number(r.pieces) || 1)),
        picture: String(r.picture || ''), face: String(r.face || ''), cardLook: String(r.cardLook || 'art'), cardArt: String(r.cardArt || ''), cardCrop: String(r.cardCrop || ''), cardBack: String(r.cardBack || ''), cardBackCrop: String(r.cardBackCrop || ''), percent: Math.min(100, Math.max(1, Number(r.percent) || 10)), days: Math.max(1, Math.round(Number(r.days) || 60)),
      }
    })
}
/* The orders that count, the same everywhere (rewards and pictures here; the member card, the
   profile line and the Overview on the account page): paid (not refunded), not cancelled, and still
   in their account (an order the admin deleted, or they deleted from their history, no longer counts). */
const countedOrders = async (d, user) => {
  const match = user.verified ? { $or: [{ userId: user._id }, { email: user.email }] } : { userId: user._id }
  return d.collection('orders').find({ ...match, status: 'paid', hidden: { $ne: true }, customerRemoved: { $ne: true }, 'track.status': { $ne: 'cancelled' } }).sort({ createdAt: -1 }).limit(500).toArray()
}
// how far a customer has come: email confirmed, orders, pieces, and (counted apart) commissions
const progressOf = async (d, user) => {
  const orders = await countedOrders(d, user)
  let commissions = 0
  try { commissions = await d.collection('commissions').countDocuments(countedMatch(user._id)) } catch (e) { console.error('commissions not counted:', e.message) }
  return { verified: Boolean(user.verified), orders: orders.length, pieces: orders.reduce((n, o) => n + (o.items || []).reduce((m, i) => m + (Number(i.qty) || 1), 0), 0), commissions, gifts: giftsOf(user) }
}
// rewards the admin has given this customer (Sales → Customers → Gift a reward): theirs whatever their progress
const giftsOf = (user) => (Array.isArray(user && user.gifts) ? user.gifts.map((g) => g && g.id).filter(Boolean) : [])
const earnedOnItsOwn = (r, p) => (r.earnedBy === 'verify' ? p.verified : r.earnedBy === 'orders' ? p.orders >= r.count : r.earnedBy === 'commissions' ? (p.commissions || 0) >= r.count : p.pieces >= r.count)
const earns = (r, p) => (p.gifts || []).includes(r.id) || earnedOnItsOwn(r, p)
// Stripe, at the version promotion codes are read with everywhere on the site (api/_orders.js)
const stripePost = async (path, fields) => {
  const got = await stripeCodes(path, { method: 'POST', body: new URLSearchParams(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString() })
  if (!got.ok) throw new Error((got.said.error && got.said.error.message) || `stripe ${got.status}`)
  return got.said
}
/* A discount reward earned: its personal code, made once in Stripe (a coupon and one promotion code:
   one use, for the days the admin set, only for this customer's account) and kept with the customer
   as { code, percent, until (ms), promoId }, with usedAt once it has paid for an order. The reward
   is claimed in the database first, so two requests at once (two tabs) never make two codes.
   A code from before promotion codes (no promoId) no longer works at the checkout: a new one
   takes its place. */
const rewardCode = async (d, user, r) => {
  const had = user.rewardCodes && user.rewardCodes[r.id]
  if (had && had.code && had.promoId) return had
  if (!process.env.STRIPE_SECRET_KEY) return null // discounts live in Stripe: none without its key
  const users = d.collection('users')
  const key = `rewardCodes.${r.id}`
  // free to make: none yet, an old code, or a claim left behind more than two minutes ago
  const claim = await users.updateOne({ _id: user._id, $or: [{ [key]: { $exists: false } }, { [`${key}.code`]: { $exists: true }, [`${key}.promoId`]: { $exists: false } }, { [`${key}.pending`]: { $lt: Date.now() - 120000 } }] }, { $set: { [key]: { pending: Date.now() } } })
  if (!claim.modifiedCount) return null // being made by another request this moment: shown on the next look
  const forget = () => users.updateOne({ _id: user._id }, { $unset: { [key]: '' } })
  const until = Math.floor((Date.now() + r.days * 864e5) / 1000)
  let coupon
  try { coupon = await stripePost('coupons', { percent_off: r.percent, duration: 'once', name: `${r.percent}% off · ${r.name}`.slice(0, 40), redeem_by: until, 'metadata[ma]': '1', 'metadata[reward]': r.id }) } catch (err) { await forget(); throw err }
  let promo = null
  for (let attempt = 0; attempt < 3 && !promo; attempt++) {
    // the site's letters and the percentage, then a random part: MA10-3DB3B3
    const code = `MA${Math.round(r.percent)}-${randomBytes(3).toString('hex').toUpperCase()}`
    try { promo = await stripePost('promotion_codes', { coupon: coupon.id, code, max_redemptions: 1, expires_at: until, 'metadata[ma]': '1', 'metadata[reward]': r.id, 'metadata[email]': user.email, 'metadata[name]': user.name || '', 'metadata[member]': String(user.memberNo || '') }) } catch { /* that code was taken: another */ }
  }
  if (!promo) { await forget(); return null } // tried again next time
  const got = { code: promo.code, percent: r.percent, until: until * 1000, promoId: promo.id }
  await users.updateOne({ _id: user._id }, { $set: { [key]: got } })
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
  const orders = await countedOrders(d, user)
  const all = pieces().sort((a, b) => b.title.length - a.title.length)
  const owned = new Set()
  // a piece taken off the site since is still theirs: its order kept its slug and picture
  for (const o of orders) for (const i of o.items || []) { const p = all.find((x) => String(i.name || '').startsWith(x.title)); if (p) owned.add(p.slug); else if (i.slug && i.src) owned.add(i.slug) }
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

// discount codes the admin gave this email before it had an account (api/discounts.js holds them):
// once the address is confirmed they move into the account, as new gifts
const claimHeld = async (d, user) => {
  if (!user) return
  try {
    const held = await d.collection('heldCodes').find({ email: user.email }).toArray()
    if (!held.length) return
    const codes = (Array.isArray(user.giftCodes) ? user.giftCodes : []).filter((g) => !held.some((h) => h.entry.id === g.id))
    const fresh = (Array.isArray(user.newGifts) ? user.newGifts : []).filter((g) => !held.some((h) => g === `code:${h.entry.id}`))
    await d.collection('users').updateOne({ _id: user._id }, { $set: { giftCodes: [...codes, ...held.map((h) => h.entry)], newGifts: [...fresh, ...held.map((h) => `code:${h.entry.id}`)] } })
    await d.collection('heldCodes').deleteMany({ _id: { $in: held.map((h) => h._id) } })
  } catch (e) { console.error('held codes not moved:', e.message) }
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

/* ---------- the admin's side: members and gifted rewards
   { action: 'adminMembers' }                           every account: { members, rewards }
   { action: 'adminGift', email, reward, note, tell }   gives a reward; tell (on unless false) emails them.
        A discount's code is made when they next look at Rewards in their account.
   { action: 'adminUngift', email, reward }             takes a gift back (a discount code already made keeps working)
   Only with the admin's pass (on this computer, the admin has no login, so none is asked). */
/* The picture a customer has on, as their account shows it: a free picture or a reward picture
   ("icon:<picture>"), or one of the pieces they bought (its slug); with its crop ("x,y,zoom"). */
const pictureOf = (avatar) => {
  if (!avatar) return null
  if (avatar.startsWith('icon:')) {
    const src = avatar.slice(5)
    const page = readJson('content/pages/account.json') || {}
    const listed = [...(Array.isArray(page.icons) ? page.icons : []), ...(Array.isArray(page.verifiedIcons) ? page.verifiedIcons : []), ...rewardsList()].find((i) => i && i.picture === src)
    return { src, face: String((listed && listed.face) || '') }
  }
  if (!/^[a-z0-9-]{1,80}$/.test(avatar)) return null
  const piece = readJson(`content/work/${avatar}.json`)
  return piece && piece.src ? { src: piece.src, face: String(piece.face || '') } : null
}
const memberOf = (u) => ({
  email: u.email, name: u.name || '', memberNo: Number(u.memberNo) || null, verified: Boolean(u.verified), createdAt: u.createdAt,
  news: u.marketing === true, // said yes to news emails
  gifts: (Array.isArray(u.gifts) ? u.gifts : []).filter((g) => g && g.id).map((g) => ({ id: g.id, at: g.at, note: g.note || '' })),
  newGifts: Array.isArray(u.newGifts) ? u.newGifts : [], // given and not seen by them yet
  picture: pictureOf(typeof u.avatar === 'string' ? u.avatar : ''),
})
const adminAction = async (req, d, users, action, body) => {
  const rewards = rewardsList()
  if (action === 'adminMembers') {
    const all = await users.find({}, { projection: { email: 1, name: 1, memberNo: 1, verified: 1, marketing: 1, createdAt: 1, gifts: 1, newGifts: 1, avatar: 1 } }).sort({ memberNo: 1 }).limit(2000).toArray()
    const members = all.map(memberOf)
    // a piece taken off the site since: the picture its order kept
    const lost = all.filter((u, n) => !members[n].picture && /^[a-z0-9-]{1,80}$/.test(String(u.avatar || '')))
    if (lost.length) {
      try {
        const kept = new Map()
        const orders = await d.collection('orders').find({ $or: [{ userId: { $in: lost.map((u) => u._id) } }, { email: { $in: lost.map((u) => u.email) } }] }).limit(1000).toArray()
        for (const o of orders) for (const i of o.items || []) if (i && i.slug && i.src && !kept.has(i.slug)) kept.set(i.slug, i.src)
        all.forEach((u, n) => { if (!members[n].picture && kept.has(u.avatar)) members[n].picture = { src: kept.get(u.avatar), face: '' } })
      } catch (e) { console.error('kept pictures not read:', e.message) }
    }
    return [200, {
      rewards: rewards.map((r) => ({ id: r.id, name: r.name, kind: r.kind, picture: r.picture, face: r.face, cardLook: r.cardLook, cardArt: r.cardArt, cardCrop: r.cardCrop, cardBack: r.cardBack, cardBackCrop: r.cardBackCrop, percent: r.kind === 'discount' ? r.percent : undefined, days: r.kind === 'discount' ? r.days : undefined })),
      members,
    }]
  }
  const user = await users.findOne({ email: tidyEmail(body.email) })
  if (!user) return [404, { message: 'There is no account with that email.' }]
  if (action === 'adminUngift') {
    // also a reward taken off the Rewards list since it was given
    const id = clean(body.reward, 80)
    if (!id) return [400, { message: 'Which reward?' }]
    await users.updateOne({ _id: user._id }, { $pull: { gifts: { id }, newGifts: id } })
    return [200, { ok: true, member: memberOf({ ...user, gifts: (user.gifts || []).filter((g) => g && g.id !== id), newGifts: (user.newGifts || []).filter((g) => g !== id) }) }]
  }
  const r = rewards.find((x) => x.id === String(body.reward || ''))
  if (!r) return [400, { message: 'That reward is no longer offered. Reload and pick another.' }]
  if (action !== 'adminGift') return [400, { message: 'Unknown action.' }]
  const p = await progressOf(d, user)
  if (p.gifts.includes(r.id)) return [409, { message: `${user.name || user.email} already has "${r.name}" as a gift.` }]
  if (earnedOnItsOwn(r, p)) return [409, { message: `${user.name || user.email} has already earned "${r.name}".` }]
  const note = clean(body.note, 300)
  const gift = { id: r.id, at: Date.now(), note }
  // new to them: their account page says so until they have seen it
  await users.updateOne({ _id: user._id }, { $push: { gifts: gift }, $addToSet: { newGifts: r.id } })
  const member = memberOf({ ...user, gifts: [...(Array.isArray(user.gifts) ? user.gifts : []), gift], newGifts: [...new Set([...(Array.isArray(user.newGifts) ? user.newGifts : []), r.id])] })
  let mailed = false
  if (body.tell !== false) {
    const first = (user.name || '').split(' ')[0]
    const what = r.kind === 'discount' ? `${r.percent}% off one order` : r.kind === 'card' ? `the ${r.name} membership card design` : `the ${r.name} profile picture`
    const pic = r.kind === 'picture' && r.picture ? { src: r.picture === '/avatars/confirmed.svg' ? '/email/confirmed.png' : r.picture, title: r.name, text: ' Now one of your profile pictures.' }
      : r.kind === 'card' && r.cardArt ? { src: r.cardArt, title: r.name, text: ' A new look for your membership card.' } : null
    // worded as the account notice it is (a subject like "A gift for you" is what spam filters look for)
    try {
      mailed = await sendMail({
        to: user.email,
        subject: `New in your Milton Aguiar account: ${r.name}`,
        kicker: 'Your account',
        title: 'A new reward',
        lines: [
          `Hi${first ? ` ${first}` : ''},`,
          `Milton has added a reward to your account: ${what}.`,
          ...(note ? [note] : []),
          r.kind === 'discount' ? 'Your code is under Rewards in your account, ready for your next order.' : 'You can use it from Details in your account.',
        ],
        picture: pic,
        button: { label: 'See your gift', url: `${siteUrl(req)}/account?tab=rewards` },
        after: 'You are getting this because you have an account on the Milton Aguiar site.',
      })
    } catch (e) { console.error('gift email not sent:', e.message) }
  }
  return [200, { ok: true, mailed: Boolean(mailed), member }]
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

    // ---------- the admin (Sales → Customers): the members, and rewards given to them as gifts
    if (action.startsWith('admin')) {
      if (!adminOk(req)) return say(res, 401, { message: 'Your login has run out. Sign out of the admin and sign in again.' })
      // Sales → Emails: news and notices to many customers at once (api/_mailings.js)
      if (action.startsWith('adminMail')) return say(res, ...(await mailingAction(req, d, action, body)))
      return say(res, ...(await adminAction(req, d, users, action, body)))
    }

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
      await claimHeld(d, user)
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
      await claimHeld(d, await users.findOne({ _id: token.userId }))
      const { rewards } = await giveReward(users, await users.findOne({ _id: token.userId }))
      const user = await currentUser(req)
      return say(res, 200, { verified: true, rewards, user: publicUser(user) })
    }

    if (action === 'unsubscribe') {
      // from the link in a mailing, no login needed: the link carries the account's own token
      if (await tooMany(`unsub-ip:${ip}`, 30, 15)) return say(res, 429, { message: 'Too many tries. Wait a few minutes.' })
      const [status, answer] = await unsubscribe(d, body)
      if (status !== 200) { await noteTry(`unsub-ip:${ip}`); return say(res, status, answer) }
      // the same person logged in on this browser: their page shows the change at once
      const me = await currentUser(req)
      return say(res, 200, me && me._id === clean(body.u, 80) ? { ...answer, user: publicUser({ ...me, marketing: false }) } : answer)
    }

    // ---------- with a login
    const user = await currentUser(req)
    if (!user) { forgetCookie(req, res); return say(res, 401, { message: 'Log in first.', user: null }) }

    if (action === 'rewards') {
      // every reward, whether it is earned, and how far they have come; discounts earned get their code
      const p = await progressOf(d, user)
      const list = []
      for (const r of rewardsList()) {
        // a discount whose code is made stays theirs, even with fewer orders now (one deleted, or refunded)
        const made = r.kind === 'discount' && user.rewardCodes && user.rewardCodes[r.id] && user.rewardCodes[r.id].promoId
        const earned = earns(r, p) || Boolean(made)
        let code = null
        if (earned && r.kind === 'discount') { try { code = await rewardCode(d, user, r) } catch (e) { console.error('reward code not made:', e.message) } }
        // the code as the customer sees it (null while it is being made: the page asks again)
        const shown = code && code.code ? { code: code.code, percent: code.percent, until: code.until, ...(code.usedAt ? { usedAt: code.usedAt } : {}) } : null
        list.push({ id: r.id, name: r.name, kind: r.kind, earnedBy: r.earnedBy, count: r.count, percent: r.kind === 'discount' ? r.percent : undefined, days: r.kind === 'discount' ? r.days : undefined, earned, gifted: p.gifts.includes(r.id) && !earnedOnItsOwn(r, p), code: shown })
      }
      // the discount codes the admin gave them (Sales → Discounts): ready, used, or ended. Stripe is
      // asked how each stands; when it cannot say, a code shows as ready (the cart checks it anyway)
      const giftCodes = []
      for (const g of Array.isArray(user.giftCodes) ? user.giftCodes : []) {
        if (!g || !g.id) continue
        let state = g.usedAt ? 'used' : 'ready'
        if (state === 'ready' && process.env.STRIPE_SECRET_KEY) {
          try {
            const got = await stripeCodes(`promotion_codes/${encodeURIComponent(g.id)}`)
            if (got.ok) {
              const pc = got.said
              if (pc.max_redemptions && (pc.times_redeemed || 0) + (await usesHere(String(g.code).toUpperCase())) >= pc.max_redemptions) state = 'used'
              else if (!pc.active || (pc.expires_at && pc.expires_at * 1000 < Date.now())) state = 'ended'
            }
          } catch (e) { console.error('gift code not checked:', e.message) }
        }
        if (state === 'ready' && g.until && g.until < Date.now()) state = 'ended'
        giftCodes.push({ id: g.id, code: g.code, percent: g.percent, until: g.until || null, label: g.label || '', at: g.at || null, state, ...(g.usedAt ? { usedAt: g.usedAt } : {}) })
      }
      return say(res, 200, { progress: p, rewards: list, giftCodes, archived: Array.isArray(user.archivedGifts) ? user.archivedGifts : [], deleted: Array.isArray(user.deletedGifts) ? user.deletedGifts : [] })
    }

    if (action === 'giftShelf') {
      // only tidies their list: a gifted picture or card design stays theirs, a code works until it is deleted from view.
      // One gift (id), or several at once (ids: every archived gift deleted)
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : [body.id]).map((x) => clean(x, 120)))].slice(0, 200)
      if (!ids.length || !ids.every((id) => /^(code:promo_[A-Za-z0-9]+|[a-z0-9-]{1,60})$/.test(id))) return say(res, 400, { message: 'That is not one of your gifts.' })
      const archived = (Array.isArray(user.archivedGifts) ? user.archivedGifts : []).filter((g) => !ids.includes(g))
      const deleted = (Array.isArray(user.deletedGifts) ? user.deletedGifts : []).filter((g) => !ids.includes(g))
      if (body.to === 'archive') archived.push(...ids)
      else if (body.to === 'delete') deleted.push(...ids)
      else if (body.to !== 'restore') return say(res, 400, { message: 'Nothing to do.' })
      await users.updateOne({ _id: user._id }, { $set: { archivedGifts: archived.slice(-200), deletedGifts: deleted.slice(-200) } })
      return say(res, 200, { archived, deleted })
    }

    if (action === 'seenGifts') {
      await users.updateOne({ _id: user._id }, { $set: { newGifts: [] } })
      return say(res, 200, { user: publicUser({ ...user, newGifts: [] }) })
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

    // yes to news emails, or no thanks (then the overview stops asking; Details keeps the switch)
    if (action === 'news') {
      const set = body.on ? { marketing: true, newsAt: new Date() } : { marketing: false, newsAskedAt: new Date() }
      await users.updateOne({ _id: user._id }, { $set: set })
      return say(res, 200, { user: publicUser({ ...user, ...set }) })
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
      // orders from before order numbers get theirs now, oldest first (member 3's first is 0003-01)
      try { await numberMember(d, await withMemberNo(d, user)) } catch (e) { console.error('orders not numbered:', e.message) }
      const list = await d.collection('orders').find({ ...match, status: { $in: ['paid', 'refunded'] }, customerRemoved: { $ne: true }, hidden: { $ne: true } }).sort({ createdAt: -1 }).limit(100).toArray()
      return say(res, 200, { orders: list.map(forCustomer) })
    }

    if (action === 'removeOrders' || action === 'removeOrder') {
      // out of the customer's account, once they type their password, after a copy of each is emailed
      // to them (if it cannot be sent, nothing is taken out). The shop keeps the sales on record
      // (posting, refunds, tax) and the admin still sees them.
      if (await tooMany(`login:${user.email}`, 8, 15)) return say(res, 429, { message: 'Too many tries. Wait 15 minutes.' })
      if (!(await checkPassword(body.password, user.password))) { await noteTry(`login:${user.email}`); return say(res, 400, { message: 'The password is not right.', field: 'password' }) }
      const wanted = [...new Set((Array.isArray(body.numbers) ? body.numbers : [body.number]).map((n) => String(n || '').trim().toUpperCase().slice(0, 20)).filter(Boolean))].slice(0, 200)
      const match = user.verified ? { $or: [{ userId: user._id }, { email: user.email }] } : { userId: user._id }
      const list = await d.collection('orders').find({ ...match, status: { $in: ['paid', 'refunded'] }, customerRemoved: { $ne: true }, hidden: { $ne: true } }).limit(300).toArray()
      const going = list.filter((o) => wanted.includes(forCustomer(o).number))
      if (!going.length) return say(res, 404, { message: wanted.length > 1 ? 'Those orders are not in your account any more.' : 'That order is not in your account any more.' })
      // the copy: each order as it showed in their account
      const price = (n, cur) => { try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur || 'EUR', currencyDisplay: 'narrowSymbol', minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 }).format(Number(n) || 0) } catch { return `${n}` } }
      const words = { new: 'Being prepared', packed: 'Packed', shipped: 'On its way', delivered: 'Delivered', refunded: 'Refunded', cancelled: 'Cancelled', pending: 'Waiting for payment' }
      const copies = going.map((raw) => {
        const o = forCustomer(raw)
        const a = o.address
        return {
          title: `Order ${o.number}`,
          sub: [new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), words[o.status] || 'Paid', o.paidWith].filter(Boolean).join(' · '),
          rows: [...o.items.map((i) => [`${i.qty > 1 ? `${i.qty} × ` : ''}${i.name}`, i.amount != null ? price(i.amount, o.currency) : '']), ...(o.discount > 0 ? [['Discount', `−${price(o.discount, o.currency)}`]] : [])],
          total: price(o.amount, o.currency),
          foot: [a ? `Posted to ${[a.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(' '), a.country].filter(Boolean).join(', ')}.` : '', o.tracking ? `Tracking: ${o.carrier ? `${o.carrier} ` : ''}${o.tracking}` : o.trackUrl ? `Tracking: ${o.trackUrl}` : ''].filter(Boolean).join(' '),
        }
      })
      const first = (user.name || '').split(' ')[0]
      const brandName = (readJson('content/site/brand.json') || {}).name || 'Milton Aguiar'
      const sent = await sendMail({
        to: user.email,
        subject: `Your ${brandName} order history: a copy of ${going.length === 1 ? '1 order' : `${going.length} orders`}`,
        kicker: 'Your orders',
        title: going.length === 1 ? 'A copy of your order' : `A copy of ${going.length} orders`,
        lines: [`Hi${first ? ` ${first}` : ''},`, `You took ${going.length === 1 ? 'this order' : 'these orders'} out of your account. Here is a copy to keep.`],
        orders: copies,
        after: 'Questions about an order? Just reply to this email.',
      })
      if (!sent) return say(res, 502, { message: 'The copy could not be emailed just now, so nothing was taken out. Try again in a moment.' })
      await d.collection('orders').updateMany({ ref: { $in: going.map((o) => o.ref) } }, { $set: { customerRemoved: true, removedAt: new Date() } })
      return say(res, 200, { removed: going.map((o) => forCustomer(o).number) })
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
