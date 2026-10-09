/* ---------------------------------------------------------------------
   Site content loader.
   All content lives in /content as JSON and is edited through the admin
   panel at /admin (or directly in the files). This module just loads it.

   The content is built into the site, so a change normally shows after the
   site has rebuilt (about a minute). For an admin who has just saved, the
   page first asks for whatever is newer than this build and lays it over
   the built-in content (showLatest, called from main.jsx before anything is
   drawn). That is why everything below is assembled by one function and
   exported as `let`: it can be put together a second time.
   --------------------------------------------------------------------- */

const files = import.meta.glob('../../content/**/*.json', { eager: true })
// keyed the way the repository names them: "content/work/venom.json"
const built = Object.fromEntries(Object.entries(files).map(([path, m]) => [path.replace('../../', ''), m.default ?? m]))

const byOrder = (a, b) => (a.order ?? 99) - (b.order ?? 99)
const live = (list) => list.filter((x) => !x.hidden) // entries ticked "Hide from the site"

export let brand, hero, marquee, home, commissions, about, contact, social, footer
/* The words on a customer's account page, and the free profile pictures (Shop → Customer accounts). */
export let accountPage
/* "Get a quote": the wording, and where the price tags and quote buttons take people (the artist's Instagram, unless the admin names somewhere else). */
export let quote
/* The comic or series the artist is drawing now, shown in its own block on the home page. */
export let project
/* Headings and introductions of the Work and Gallery pages (and of the comic samples on Work). */
export let pages
export let nav
/* Every piece, newest first; the file name is the piece's id. Pieces marked "Only in the Shop"
   (a T-shirt, a book) are left out of it, so they never land on the Work page or the home page. */
export let work
/* Selling online (Shop and payments in the admin), and everything that can be bought: the pieces
   with a price, newest first, whether or not they are on the Work page too. `everything` is every
   piece, so the cart can find what it holds. */
export let shop, forSale, everything
/* The kinds of thing sold (Prints, Original art...), each with what the buyer gets, in the order
   the admin lists them; only the ones in use. */
export let types
/* The shop's own lists, kept under Shop → Categories & sizes: categories and sub categories (DC,
   Marvel...), in the admin's order (`shopCats` and `subCats` are the ones in use), and the print
   sizes with their measurements (`sizeNotes`: "A4" -> "21 × 29.7 cm"). */
export let shopCats, subCats, sizeNotes
/* The categories that have at least one piece, in the order they first appear. */
export let categories
/* The pieces ticked "Show on the home page", in the order given to them (or simply the newest). */
export let latest
/* The four panels beside the name on the home page, and the five of "Latest" under them. */
export let heroPanels, fresh
/* The gallery: the artist makes sections and adds pictures to each. A section can also pull in
   pieces from Work, so a finished piece only has to be uploaded once. */
export let gallerySections, gallery
/* Up to six pictures for the home page: the ones ticked there, then others the home page is not
   already showing in its list of latest pieces. */
export let galleryHome
/* Step-by-step sets: one piece at each stage (pencils, inks, colours), or an old drawing and its redraw. */
export let redraws
/* Comic samples (Work page): a cover and its pages in reading order, for visitors to read. A page
   marked `spread` is one wide picture across two facing pages; `count` is the number of pages
   after the cover, a spread counting as two. */
export let comics
export let events
/* True when the page is showing an admin their newest saved changes rather than only the built-in content. */
export let previewing = false

/* Hiding. "Show or hide" in the admin switches whole pages and home-page sections off
   (anything not listed there is shown), and every entry has its own "Hide from the site" switch. */
let visibility = {}
export const shows = (group, key) => visibility[group]?.[key] !== false
/* The one theme the site is held to, when the admin has switched the other off ("dark" or "light");
   empty when visitors may choose. With both switched off, both stay on. */
export const themeOnly = () => (shows('themes', 'dark') === shows('themes', 'light') ? '' : shows('themes', 'dark') ? 'dark' : 'light')

let hiddenCats = new Set(), hiddenSubs = new Set() // categories and sub categories switched to Hide in the admin
let newPictures = {} // pictures saved after this build: "/uploads/x.webp" -> the picture itself

/* Leaves out anything not filled in, so the built-in wording below it shows through. */
const given = (fields) => Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null))

/* A picture as a profile picture: where the round crop sits and how far in, set in the admin by
   dragging the picture in its circle. Kept as "left,top,zoom" (percent). */
const parseFace = (v, top = 22) => { const [x, y, z] = String(v || '').split(',').map((n) => (n.trim() === '' ? NaN : Number(n))); return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : top, zoom: Number.isFinite(z) && z >= 100 ? z : 100 } }
/* the style that puts it there, on an <img> filling a round frame */
export const faceLook = (piece) => { const f = (piece && piece.face) || { x: 50, y: 22, zoom: 100 }; return { objectPosition: `${f.x}% ${f.y}%`, transform: `scale(${f.zoom / 100})`, transformOrigin: `${f.x}% ${f.y}%` } }

function assemble(content) {
  // the words on each page (content/pages) and what applies to the whole site (content/site)
  const page = (name) => content[`content/pages/${name}.json`] || {}
  const site = (name) => content[`content/site/${name}.json`] || {}
  const { social: links, footerLine, footerFine, ...name } = site('brand')
  const { kicker, text, primaryLabel, secondaryLabel, buttons, figure, marquee: words, project: current, ...sections } = page('home')
  const lists = page('lists')
  // every file of one folder, each with the name of its file
  const folder = (name) => Object.entries(content)
    .filter(([path]) => path.startsWith(`content/${name}/`))
    .map(([path, data]) => ({ ...data, slug: path.split('/').pop().replace(/\.json$/, '') }))

  // Every piece of text has a built-in wording, so a content file that predates a field still works.
  visibility = site('visibility')
  brand = { name: 'Milton Aguiar', hue: 25, ...name }
  hero = { figure: {}, ...given({ kicker, text, figure }) }
  // the buttons under the name, in the admin's order; a home page saved before there was a list
  // keeps its two old buttons
  hero.buttons = (Array.isArray(buttons) ? buttons : [
    { words: primaryLabel || 'See the work', to: 'work', tone: 'red' },
    { words: secondaryLabel || 'Commission a piece', to: 'quote', tone: 'quiet' },
  ]).filter((b) => b && String(b.words || '').trim() && !b.off)
  marquee = words || []
  project = { label: 'Current project', buttonLabel: 'Read it', ...given(current || {}) }
  home = {
    latestLabel: 'Fresh off the board', latestTitle: 'Latest pages',
    galleryView: 'wall',
    redrawLabel: 'The process', redrawTitle: 'Pencils to colours',
    commissionsTitle: 'Commissions are', commissionsButton: 'How it works',
    eventsLabel: 'In person', eventsTitle: 'Find me at',
    ...given(sections),
    ...given({ galleryView: lists.galleryView }), // the Gallery page's opening layout is set with the rest of that page
  }
  commissions = {
    title: 'Get something drawn', processLabel: 'The process', processTitle: 'How it works',
    requestLabel: 'Request', requestTitle: 'Tell me the idea',
    closedTitle: 'Join the queue', closedText: 'The books are closed for now. Send the idea anyway and you will hear back when a slot opens.',
    tiers: [], steps: [], notes: [],
    ...given(page('commissions')),
  }
  about = { story: [], facts: [], ...given(page('about')) }
  // an About page written before it was told in panels: each of its paragraphs becomes a panel without a picture
  if (!about.story.length && about.paragraphs?.length) about.story = about.paragraphs.map((text) => ({ text }))
  about.story = about.story.filter((s) => s && s.text)
  contact = { label: 'Say hello', title: 'Get in touch', topics: [], ...given(page('contact')) }
  accountPage = { noteTitle: 'A note from the artist', note: '', signature: '', collectionTitle: 'Your collection', savedTitle: 'Saved for later', cardLabel: 'Collector', rewardText: 'Confirm your email and unlock a profile picture only confirmed members can use.', ...given(page('account')) }
  accountPage.icons = (Array.isArray(accountPage.icons) ? accountPage.icons : []).filter((i) => i && typeof i.picture === 'string' && i.picture).map((i) => ({ picture: i.picture, name: i.name || '', face: parseFace(i.face) }))
  // rewards (Shop → Rewards): profile pictures, membership card designs and discounts a customer
  // earns by confirming their email, by a number of orders, or by a number of pieces collected
  const rw = page('rewards')
  const slug = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  if (rw.rewardText) accountPage.rewardText = rw.rewardText
  const of = (key, kind) => (Array.isArray(rw[key]) ? rw[key] : []).map((r) => ({ ...r, kind }))
  accountPage.rewards = [...of('pictures', 'picture'), ...of('cards', 'card'), ...of('discounts', 'discount'),
    ...(Array.isArray(rw.rewards) ? rw.rewards : []),
    ...(rw.pictures || rw.rewards ? [] : (accountPage.verifiedIcons || []).map((i) => ({ ...i, kind: 'picture', earnedBy: 'verify' })))]
    .filter((r) => r && !r.hidden && (r.kind === 'card' ? r.cardLook || r.cardArt : r.kind === 'discount' ? Number(r.percent) > 0 : typeof r.picture === 'string' && r.picture))
    .map((r) => {
      const by = r.earnedBy === 'firstOrder' ? 'orders' : ['verify', 'orders', 'pieces'].includes(r.earnedBy) ? r.earnedBy : 'verify'
      return { id: slug(r.name) || slug(r.picture), name: r.name || '', kind: ['card', 'discount'].includes(r.kind) ? r.kind : 'picture', earnedBy: by, count: by === 'verify' ? 0 : Math.max(1, Math.round(Number(r.count) || Number(r.pieces) || 1)), percent: Number(r.percent) || 0, days: Number(r.days) || 60, picture: r.picture || '', face: parseFace(r.face), cardLook: r.cardLook || 'art', cardArt: r.cardArt || '', cardCrop: parseFace(r.cardCrop, 25) }
    })
  // the pictures given on confirming the email (the confirmation page and email show these)
  accountPage.verifiedIcons = accountPage.rewards.filter((r) => r.kind === 'picture' && r.earnedBy === 'verify')
  pages = {
    work: { label: 'The work', title: 'Everything so far', ...given({ label: lists.workLabel, title: lists.workTitle, intro: lists.workIntro }) },
    gallery: { label: 'The gallery', title: 'Pin-ups and pages', ...given({ label: lists.galleryLabel, title: lists.galleryTitle, intro: lists.galleryIntro }) },
    samples: { label: 'Read a few pages', title: 'Samples', ...given({ label: lists.samplesLabel, title: lists.samplesTitle || undefined, intro: lists.samplesIntro }) },
  }
  shop = {
    enabled: false, payments: 'stripe', currency: 'eur', buttonLabel: 'Buy', shipping: true, pricePlace: 'corner', tagPlace: 'corner',
    signedChoice: false, signedExtra: 0, cartIcon: 'bag', accounts: 'off',
    label: 'The shop', title: 'Take one home',
    thanksTitle: 'Thank you.', thanksText: 'Your order is in. A receipt is on its way to your email.',
    emptyTitle: 'The shop opens soon.', emptyText: 'Prints and originals are on their way. Follow along on Instagram to hear first.',
    ...given(site('shop')),
  }
  shop.accounts = accountPage.accounts || shop.accounts // off, optional or required (Shop → Customer accounts)
  social = links || []
  const insta = social.find((s) => /instagram/i.test(s.label || ''))
  brand.instagram = insta?.url
  brand.handle = insta?.handle
  quote = { label: commissions.quoteLabel || 'Get a quote', url: commissions.quoteUrl || brand.instagram || '' }
  footer = { fine: 'Characters shown in fan art belong to their owners.', ...given({ line: footerLine, fine: footerFine }) }

  nav = [
    { label: 'Home', to: '/' },
    { label: 'Shop', to: '/shop', off: !shop.enabled }, // only while online purchases are switched on
    { label: 'Work', to: '/work' },
    { label: 'Gallery', to: '/gallery' },
    { label: 'Commissions', to: '/commissions' },
    { label: 'About', to: '/about' },
    { label: 'Contact', to: '/contact' },
  ].filter((n) => n.to === '/' || (!n.off && shows('pages', n.to.slice(1))))

  // what the buyer gets: the line written beside the piece's type, or the shop's own line
  const kinds = (Array.isArray(shop.types) ? shop.types : []).filter((t) => t && String(t.name || '').trim())
  const notes = Object.fromEntries(kinds.map((t) => [String(t.name).trim(), String(t.note || '').trim()]))
  // how each piece is shown in the shop: its own choice, else its kind's, else the shop's
  const LOOKS = ['poster', 'framed', 'board', 'comic', 'plain']
  const looks = Object.fromEntries(kinds.map((t) => [String(t.name).trim(), t.look]))
  const lookOf = (p) => [p.look, looks[String(p.type || '').trim()], shop.look, 'poster'].find((l) => LOOKS.includes(l))
  everything = live(folder('work'))
    .filter((p) => p.title)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map((p) => ({ ...p, what: notes[String(p.type || '').trim()] || shop.note || '', look: lookOf(p), face: parseFace(p.face) }))
  work = everything.filter((p) => !p.shopOnly)
  forSale = everything.filter(buyable)
  const shopLists = site('categories')
  const named = (list) => (Array.isArray(list) ? list : []).map((x) => String((x && x.name) || '').trim()).filter(Boolean)
  // a category or sub category switched to "Hide" in the list: not offered as a filter, not named on cards
  const hiddenIn = (list) => new Set((Array.isArray(list) ? list : []).filter((x) => x && x.hidden).map((x) => String(x.name || '').trim()))
  hiddenCats = hiddenIn(shopLists.categories)
  sizeNotes = Object.fromEntries((Array.isArray(shopLists.sizes) ? shopLists.sizes : []).filter((x) => x && x.name).map((x) => [String(x.name).trim(), String(x.note || '').trim()]))
  hiddenSubs = hiddenIn(shopLists.subcategories)
  // the admin's order first, then anything in use that the lists do not name; hidden ones left out
  const inUse = (listed, field, hidden) => {
    const used = new Set(forSale.map((p) => String(p[field] || '').trim()).filter((n) => n && !hidden.has(n)))
    return [...listed.filter((n) => used.has(n)), ...[...used].filter((n) => !listed.includes(n))]
  }
  shopCats = inUse(named(shopLists.categories), 'category', hiddenCats)
  subCats = inUse(named(shopLists.subcategories), 'universe', hiddenSubs)
  const sold = new Set(forSale.map((p) => p.type).filter(Boolean))
  types = [...kinds.map((t) => String(t.name).trim()).filter((n) => sold.has(n)), ...[...sold].filter((n) => !(n in notes))]
  categories = [...new Set(work.map((p) => p.category).filter((c) => c && !hiddenCats.has(String(c).trim())))]
  // the ticked pieces in the order given to them ("Place on the home page"), newest first among those with none
  const place = (p) => (p.homeOrder === '' || p.homeOrder == null ? 99 : Number(p.homeOrder))
  const picked = work.filter((p) => p.featured).sort((a, b) => place(a) - place(b))
  latest = (picked.length ? picked : work).slice(0, 9)
  // beside the name: the first four of those, leaving out the drawing that already stands in the title panel
  const stands = hero.figure?.src
  heroPanels = [...latest, ...work.filter((p) => !latest.includes(p))].filter((p) => p.src && p.src !== stands).slice(0, 4)
  // "Latest": the ticked pieces that are not up there, then the newest of the rest
  const rest = (list) => list.filter((p) => !heroPanels.includes(p))
  fresh = [...rest(latest), ...rest(work).filter((p) => !latest.includes(p))].slice(0, 5)

  // a section's "also show pieces from Work" choice: none, every piece, or one category
  const fromWork = (from) => (!from || from === 'none' ? [] : work)
    .filter((p) => p.src && (from === 'all' || p.category === from))
    .map((p) => ({ title: p.title, src: p.src, note: p.note, category: p.category, date: p.date, link: p.link, piece: p.slug }))
  gallerySections = live(folder('gallery-sections'))
    .map((s) => ({ ...s, items: [...fromWork(s.from), ...(s.items || []).filter((g) => g && g.src)] }))
    .filter((s) => s.items.length > 0)
    .sort(byOrder)
  gallery = gallerySections.flatMap((s) => s.items)
  const listed = new Set(shows('home', 'latest') ? latest.map((p) => p.slug) : [])
  const once = new Set()
  galleryHome = [...gallery.filter((g) => g.home), ...gallery.filter((g) => !g.home && !listed.has(g.piece))]
    .filter((g) => !once.has(g.src) && once.add(g.src))
    .slice(0, 6)

  // the sets made on the Home page (Pencils, Inks, Colours), then any made the older way, one file each
  const homeSets = (Array.isArray(page('home').steps) ? page('home').steps : []).map((r, i) => ({
    slug: `set-${i}`, title: r.title || '', text: r.text || '', hidden: r.hidden, order: i, commissions: Boolean(r.commissions),
    stages: [['Pencils', r.pencils], ['Inks', r.inks], ['Colours', r.colours]].filter(([, src]) => src).map(([year, src]) => ({ year, src })),
  }))
  redraws = [...live(homeSets), ...live(folder('redraws')).sort(byOrder)]
    .map((r) => ({ ...r, stages: (r.stages || []).filter((s) => s && s.year) }))
    .filter((r) => r.stages.length > 1)
  events = live(folder('events')).filter((e) => e.name).sort(byOrder)
  // the comics with a cover, lowest order first (then by title); pages without a picture left out
  const rank = (c) => (c.order === '' || c.order == null ? 99 : Number(c.order))
  comics = live(folder('comics'))
    .filter((c) => c.title && c.cover)
    .map((c) => ({ ...c, text: c.text || '', pages: (Array.isArray(c.pages) ? c.pages : []).filter((p) => p && p.src).map((p) => ({ src: p.src, spread: Boolean(p.spread) })) }))
    .map((c) => ({ ...c, count: c.pages.reduce((n, p) => n + (p.spread ? 2 : 1), 0) })) // a spread counts as two pages
    .sort((a, b) => rank(a) - rank(b) || String(a.title).localeCompare(String(b.title)))
}
assemble(built)

/* Lay newer content over the built-in content: `content` maps a file to its new contents (or to
   null when it was deleted), `media` maps a newly uploaded picture's address to the picture. */
export function showLatest({ content = {}, media = {} }) {
  const merged = { ...built }
  for (const [path, data] of Object.entries(content)) {
    if (data == null) delete merged[path]
    else merged[path] = data
  }
  newPictures = media
  previewing = true
  assemble(merged)
}

/* Uploaded images are stored as "/uploads/x.jpg". Prefix the deploy base path. */
export const asset = (url) => newPictures[url] || (url && url.startsWith('/') ? import.meta.env.BASE_URL.replace(/\/$/, '') + url : url)

/* What a card says a piece is, after its type: its sub category, or its category, whichever is not
   hidden (empty when both are). */
/* The ways buyers can pay, from Shop → Settings & payments: { card, paypal }. */
export const payWays = () => { const p = shop?.payments || 'stripe'; return { card: p !== 'paypal', paypal: p === 'paypal' || p === 'both' } }

/* A piece's category, unless that category is switched to Hide. */
export const catOf = (p) => (p?.category && !hiddenCats.has(String(p.category).trim()) ? p.category : '')
export const filedUnder = (p) => [p.universe, p.category].map((x) => String(x || '').trim()).find((x, i) => x && !(i ? hiddenCats : hiddenSubs).has(x)) || ''

/* A piece shows its price while online purchases are switched on, it is in the Shop ("Sell it in
   the Shop" in the admin, or added under Shop) and it has a price. */
export function buyable(piece) { return Boolean(shop?.enabled && piece && piece.slug && piece.inShop && (Number(piece.price) > 0 || sizesOf(piece).length > 0)) } // a declaration, so assemble() above can use it
/* A piece's print sizes, each with its price and, when it is discounted, its lower price
   ({ name, price, sale, now }), in the order the admin put the rows in. Each size is picked from
   the list under Shop → Categories & sizes; its price is set on the piece. Rows without a size or a price are left out. With none, the piece has the one
   price of its own. */
export function sizesOf(piece) {
  const rows = (Array.isArray(piece?.sizes) ? piece.sizes : [])
    .map((r) => {
      const name = String((r && r.size) || '').trim(), price = Number(r && r.price), sale = Number(r && r.salePrice)
      const off = sale > 0 && sale < price
      return { name, price, sale: off ? sale : 0, now: off ? sale : price }
    })
    .filter((r) => r.name && r.price > 0)
  return rows.filter((r, i) => rows.findIndex((x) => x.name === r.name) === i) // a size typed twice counts once
}
/* One size of a piece, by name (the first when none is named or the name is gone). */
export const sizeOf = (piece, name) => { const all = sizesOf(piece); return all.find((r) => r.name === name) || all[0] || null }
/* Its status, set in the admin: "new", "sale" (with a sale price below the price) or "soldout". */
export const soldOut = (piece) => piece?.status === 'soldout'
/* On sale: the chosen size is discounted, or (a piece without sizes) its tag is "On sale" with a
   sale price below its price. */
export const onSale = (piece, size) => {
  const r = sizeOf(piece, size)
  if (r) return r.sale > 0
  return piece?.status === 'sale' && Number(piece.salePrice) > 0 && Number(piece.salePrice) < Number(piece.price)
}
/* The usual price and what it costs now, of the chosen size (or of the piece). */
export const fullPrice = (piece, size) => { const r = sizeOf(piece, size); return r ? r.price : Number(piece.price) }
export const nowPrice = (piece, size) => { const r = sizeOf(piece, size); return r ? r.now : (onSale(piece) ? Number(piece.salePrice) : Number(piece.price)) }
/* The lowest price it can be had for, and whether there is more than one ("from €20"). */
export const fromPrice = (piece) => { const all = sizesOf(piece); return all.length ? Math.min(...all.map((r) => r.now)) : nowPrice(piece) }
export const manyPrices = (piece) => new Set(sizesOf(piece).map((r) => r.now)).size > 1
/* It can go into a checkout: it shows a price and is not sold out. */
export const canBuy = (piece) => buyable(piece) && !soldOut(piece)
/* The small tag on a piece. "New" shows whenever it is set; "Sale" and "Sold out" only while
   prices are showing, since without a price neither means anything. */
export const badge = (piece) => {
  if (!piece) return null
  if (buyable(piece) && soldOut(piece)) return { kind: 'soldout', text: 'Sold out' }
  if (buyable(piece)) {
    // the biggest discount among its sizes (or on the piece itself)
    const all = sizesOf(piece)
    const cut = all.length ? Math.max(0, ...all.filter((r) => r.sale).map((r) => 1 - r.sale / r.price)) : onSale(piece) ? 1 - Number(piece.salePrice) / Number(piece.price) : 0
    if (cut > 0) return { kind: 'sale', text: `${all.length > 1 && all.some((r) => !r.sale) ? 'Up to ' : 'Sale '}−${Math.round(cut * 100)}%` }
  }
  if (piece.status === 'new') return { kind: 'new', text: 'New' }
  return null
}
/* 40 -> "€40 EUR", 12.5 -> "€12.50 EUR", in the shop's currency. `short` leaves the code off
   ("€40"), for an old price shown beside the new one. */
export const money = (amount, short = false) => {
  const n = Number(amount)
  const code = String(shop.currency || 'eur').toUpperCase()
  let figure = String(amount)
  try { figure = new Intl.NumberFormat('en-GB', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n) } catch { /* an unknown code: the bare number */ }
  return short ? figure : `${figure} ${code}`
}

/* A name is split in two so the second half can take the brand colour: "Milton Aguiar" at its
   first space, a name written as one word at its second capital. Anything else comes back whole. */
export const nameParts = (name = '') => {
  const space = name.trim().indexOf(' ')
  if (space > 0) return [name.trim().slice(0, space), name.trim().slice(space + 1)]
  const cut = name.slice(1).search(/[A-Z]/)
  return cut < 0 ? [name, ''] : [name.slice(0, cut + 1), name.slice(cut + 1)]
}

/* "2026-07-26" -> "26 Jul 2026" (and "Jul 26" for the short form). Dates are plain calendar days,
   so they are read as written rather than through a time zone. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const day = (date, short = false) => {
  const [y, m, d] = String(date || '').slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ''
  return short ? `${MONTHS[m - 1]} ${d}` : `${d} ${MONTHS[m - 1]} ${y}`
}
