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
/* "Get a quote": the wording, and where the price tags and quote buttons take people (the artist's Instagram, unless the admin names somewhere else). */
export let quote
/* The comic or series the artist is drawing now, shown in its own block on the home page. */
export let project
/* Headings and introductions of the Work and Gallery pages. */
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

let newPictures = {} // pictures saved after this build: "/uploads/x.webp" -> the picture itself

/* Leaves out anything not filled in, so the built-in wording below it shows through. */
const given = (fields) => Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null))

function assemble(content) {
  // the words on each page (content/pages) and what applies to the whole site (content/site)
  const page = (name) => content[`content/pages/${name}.json`] || {}
  const site = (name) => content[`content/site/${name}.json`] || {}
  const { social: links, footerLine, footerFine, ...name } = site('brand')
  const { kicker, text, primaryLabel, secondaryLabel, figure, marquee: words, project: current, ...sections } = page('home')
  const lists = page('lists')
  // every file of one folder, each with the name of its file
  const folder = (name) => Object.entries(content)
    .filter(([path]) => path.startsWith(`content/${name}/`))
    .map(([path, data]) => ({ ...data, slug: path.split('/').pop().replace(/\.json$/, '') }))

  // Every piece of text has a built-in wording, so a content file that predates a field still works.
  visibility = site('visibility')
  brand = { name: 'Milton Aguiar', hue: 25, ...name }
  hero = { primaryLabel: 'See the work', secondaryLabel: 'Commission a piece', figure: {}, ...given({ kicker, text, primaryLabel, secondaryLabel, figure }) }
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
  pages = {
    work: { label: 'The work', title: 'Everything so far', ...given({ label: lists.workLabel, title: lists.workTitle, intro: lists.workIntro }) },
    gallery: { label: 'The gallery', title: 'Pin-ups and pages', ...given({ label: lists.galleryLabel, title: lists.galleryTitle, intro: lists.galleryIntro }) },
  }
  shop = {
    enabled: false, currency: 'eur', buttonLabel: 'Buy', shipping: true, pricePlace: 'corner', tagPlace: 'corner',
    signedChoice: false, signedExtra: 0, cartIcon: 'bag',
    label: 'The shop', title: 'Take one home',
    thanksTitle: 'Thank you.', thanksText: 'Your order is in. A receipt is on its way to your email.',
    emptyTitle: 'The shop opens soon.', emptyText: 'Prints and originals are on their way. Follow along on Instagram to hear first.',
    ...given(site('shop')),
  }
  social = links || []
  const insta = social.find((s) => /instagram/i.test(s.label || ''))
  brand.instagram = insta?.url
  brand.handle = insta?.handle
  quote = { label: commissions.quoteLabel || 'Get a quote', url: commissions.quoteUrl || brand.instagram || '' }
  footer = { fine: 'Characters shown in fan art belong to their owners.', ...given({ line: footerLine, fine: footerFine }) }

  nav = [
    { label: 'Home', to: '/' },
    { label: 'Work', to: '/work' },
    { label: 'Shop', to: '/shop', off: !shop.enabled }, // only while online purchases are switched on
    { label: 'Gallery', to: '/gallery' },
    { label: 'Commissions', to: '/commissions' },
    { label: 'About', to: '/about' },
    { label: 'Contact', to: '/contact' },
  ].filter((n) => n.to === '/' || (!n.off && shows('pages', n.to.slice(1))))

  // what the buyer gets: the line written beside the piece's type, or the shop's own line
  const kinds = (Array.isArray(shop.types) ? shop.types : []).filter((t) => t && String(t.name || '').trim())
  const notes = Object.fromEntries(kinds.map((t) => [String(t.name).trim(), String(t.note || '').trim()]))
  everything = live(folder('work'))
    .filter((p) => p.title)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map((p) => ({ ...p, what: notes[String(p.type || '').trim()] || shop.note || '' }))
  work = everything.filter((p) => !p.shopOnly)
  forSale = everything.filter(buyable)
  const sold = new Set(forSale.map((p) => p.type).filter(Boolean))
  types = [...kinds.map((t) => String(t.name).trim()).filter((n) => sold.has(n)), ...[...sold].filter((n) => !(n in notes))]
  categories = [...new Set(work.map((p) => p.category).filter(Boolean))]
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

  redraws = live(folder('redraws'))
    .map((r) => ({ ...r, stages: (r.stages || []).filter((s) => s && s.year) }))
    .filter((r) => r.stages.length > 1)
    .sort(byOrder)
  events = live(folder('events')).filter((e) => e.name).sort(byOrder)
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

/* A piece shows its price while online purchases are switched on and it has one. */
export function buyable(piece) { return Boolean(shop?.enabled && piece && piece.slug && Number(piece.price) > 0) } // a declaration, so assemble() above can use it
/* Its status, set in the admin: "new", "sale" (with a sale price below the price) or "soldout". */
export const soldOut = (piece) => piece?.status === 'soldout'
export const onSale = (piece) => piece?.status === 'sale' && Number(piece.salePrice) > 0 && Number(piece.salePrice) < Number(piece.price)
/* What it costs now: the sale price while it is on sale, otherwise the price. */
export const nowPrice = (piece) => (onSale(piece) ? Number(piece.salePrice) : Number(piece.price))
/* It can go into a checkout: it shows a price and is not sold out. */
export const canBuy = (piece) => buyable(piece) && !soldOut(piece)
/* The small tag on a piece. "New" shows whenever it is set; "Sale" and "Sold out" only while
   prices are showing, since without a price neither means anything. */
export const badge = (piece) => {
  if (!piece) return null
  if (buyable(piece) && soldOut(piece)) return { kind: 'soldout', text: 'Sold out' }
  if (buyable(piece) && onSale(piece)) return { kind: 'sale', text: `Sale −${Math.round((1 - Number(piece.salePrice) / Number(piece.price)) * 100)}%` }
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
