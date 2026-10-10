import { createHash } from 'node:crypto'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { pathToFileURL } from 'node:url'
import { memoryDb } from './dev/memory-db.js'

// Copies index.html to 404.html after build so GitHub Pages serves the SPA on deep links.
const spaFallback = () => ({
  name: 'spa-404',
  closeBundle() {
    try { writeFileSync(resolve('dist/404.html'), readFileSync(resolve('dist/index.html'))) } catch { /* no dist yet */ }
  },
})

// Serves the self-hosted admin panel (Decap CMS) from node_modules in dev,
// and copies its scripts into dist/admin/ on build, so the panel needs no external CDN.
const CMS_DIR = resolve('node_modules/decap-cms/dist')
const cmsFiles = () => readdirSync(CMS_DIR).filter((f) => /^(\d+\.)?decap-cms\.js$/.test(f))
// The admin saves through a small local helper (decap-server). It listens on 8083 here, not on
// its usual 8081, so that it never shares a helper with another site being worked on at the same
// time: a shared helper would save this site's edits into the other site's folder.
const ADMIN_PORT = 8083
// Without the helper the panel only shows a login it cannot complete, so `npm run dev` starts
// the helper too, unless one is already running, and stops it again on the way out.
const startAdminBackend = (server) => {
  const launch = () => {
    const child = spawn(process.execPath, [resolve('node_modules/decap-server/dist/index.js')], { stdio: 'ignore', windowsHide: true, env: { ...process.env, PORT: String(ADMIN_PORT) } })
    child.on('error', (e) => server.config.logger.warn(`admin backend did not start: ${e.message}`))
    const stop = () => { if (!child.killed) child.kill() }
    server.httpServer?.once('close', stop)
    process.once('exit', stop)
    server.config.logger.info(`  admin backend started on port ${ADMIN_PORT}`)
  }
  // Is one answering already? When this dev server has just restarted itself (after an edit to
  // this file) the helper of the server it replaced may still answer for a moment and then go,
  // so a "yes" is asked again shortly afterwards before it is believed.
  const look = (again) => {
    const probe = connect({ port: ADMIN_PORT, host: '127.0.0.1' })
    probe.once('connect', () => { probe.destroy(); if (again) setTimeout(() => look(again - 1), 1500) })
    probe.once('error', launch)
  }
  look(2)
}

/* The admin's lists can show each entry as a card with its picture. Decap only finds a picture
   in a field called "image", and a gallery section or a then-and-now set keeps its pictures
   inside a list, so the admin gets this index instead: entry -> the picture that stands for it.
   Served live while developing, and written beside the admin on build. */
const thumbs = () => {
  const read = (dir) => {
    try {
      return readdirSync(resolve('content', dir)).filter((f) => f.endsWith('.json'))
        .map((f) => ({ slug: f.replace(/\.json$/, ''), data: JSON.parse(readFileSync(resolve('content', dir, f), 'utf8')) }))
    } catch { return [] }
  }
  const work = read('work').sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)))
  const index = {}
  for (const piece of work) if (piece.data.src) index[`work/${piece.slug}`] = piece.data.src
  for (const section of read('gallery-sections')) {
    const from = section.data.from
    const pulled = from && from !== 'none' ? work.find((p) => p.data.src && (from === 'all' || p.data.category === from))?.data.src : undefined
    const picture = pulled || (section.data.items || []).find((item) => item && item.src)?.src
    if (picture) index[`gallery_sections/${section.slug}`] = picture
  }
  // a comic sample: its cover
  for (const comic of read('comics')) if (comic.data.cover) index[`comics/${comic.slug}`] = comic.data.cover
  for (const set of read('redraws')) {
    const picture = [...(set.data.stages || [])].reverse().find((stage) => stage && stage.src)?.src
    if (picture) index[`redraws/${set.slug}`] = picture
  }
  return index
}

/* The page applies its theme before anything is drawn (the small script in index.html). When the
   admin has switched one theme off (Show or hide), that script has to know which one is left,
   so the build writes it into the page. */
const themeOnly = () => ({
  name: 'theme-only',
  transformIndexHtml(html) {
    let only = ''
    try {
      const { themes = {} } = JSON.parse(readFileSync(resolve('content/site/visibility.json'), 'utf8'))
      const dark = themes.dark !== false, light = themes.light !== false
      if (dark !== light) only = dark ? 'dark' : 'light'
    } catch { /* no file yet: visitors choose */ }
    return html.replace('__THEME_ONLY__', only)
  },
})

const adminBundle = () => ({
  name: 'admin-bundle',
  configureServer(server) {
    startAdminBackend(server)
    // The admin's Orders screen asks api/orders.js (on Vercel). Here the same code runs with the
    // STRIPE_SECRET_KEY from a .env.local file, and with no key, on sample orders (dev/), so the
    // screen can be worked on. There is no login on this computer, so there is no pass to check.
    const local = [
      ['/api/orders', 'api/orders.js', 'orders', 'dev/sample-orders.js', 'sampleOrders'],
    ]
    // the keys for payments, customer accounts (the database) and their emails, from a .env.local
    // file beside package.json (never committed: *.local is ignored)
    const KEYS = /^(STRIPE_|PAYPAL_|MONGODB_|SMTP_|RESEND_|MAIL_|CONTACT_TO$|ORDER_EMAIL_TO$|SITE_URL$)/
    // read afresh each time, so an edit to .env.local counts without a restart (what was put in
    // last time is taken out first: Vite would otherwise prefer it to the file)
    const ours = new Set()
    const useKeys = () => {
      for (const k of ours) delete process.env[k]
      ours.clear()
      const env = loadEnv('development', process.cwd(), '')
      for (const [k, v] of Object.entries(env)) if (KEYS.test(k) && v && !(k in process.env)) { process.env[k] = v; ours.add(k) }
      // MONGODB_URI=memory: customer accounts on a stand-in database kept in memory (dev/memory-db.js)
      if (process.env.MONGODB_URI === 'memory') { globalThis.__maTestDb ||= memoryDb(); delete process.env.MONGODB_URI }
    }
    // paying (api/checkout.js for Stripe, api/paypal.js for PayPal), discount codes (api/discount.js
    // checks one for the cart, api/discounts.js is the admin's Discounts screen: both need the
    // Stripe test key, and say so without it), customer accounts (api/account.js) and Stripe's
    // messages about payments (api/stripe-webhook.js) run here too, so a test key, a PayPal sandbox
    // and the database can be tried on this computer before the site goes live. The admin's
    // functions let in requests to localhost without a pass (api/_session.js: adminOk), never on
    // Vercel. The webhook checks its message as it arrived, so it gets it untouched. Commissions
    // (api/commissions.js: the customer's requests and the admin's side of them) run here too.
    for (const [route, file] of [['/api/checkout', 'api/checkout.js'], ['/api/paypal', 'api/paypal.js'], ['/api/discount', 'api/discount.js'], ['/api/discounts', 'api/discounts.js'], ['/api/account', 'api/account.js'], ['/api/commissions', 'api/commissions.js'], ['/api/stripe-webhook', 'api/stripe-webhook.js'], ['/api/contact', 'api/contact.js']]) {
      server.middlewares.use(route, async (req, res, next) => {
        if ((req.url || '/').split('?')[0] !== '/') return next()
        useKeys()
        let body = ''
        for await (const chunk of req) body += chunk
        let parsed = {}
        try { parsed = body ? JSON.parse(body) : {} } catch { /* not JSON: left empty */ }
        // what Vercel's response does, and the real one underneath: a stream (api/commissions.js,
        // ?stream=) writes to it and holds it open, as on Vercel
        const reply = {
          setHeader: (k, v) => res.setHeader(k, v),
          status(code) { res.statusCode = code; return reply },
          json(data) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return reply },
          write: (chunk) => res.write(chunk),
          end: (chunk) => res.end(chunk),
          on: (event, fn) => { res.on(event, fn); return reply },
          flushHeaders: () => res.flushHeaders(),
          get statusCode() { return res.statusCode },
          set statusCode(code) { res.statusCode = code },
          get headersSent() { return res.headersSent },
        }
        // a file that fails to load (a typo, or a helper it needs that changed: those are only read
        // afresh when the dev server restarts) answers with the error instead of stopping the server
        try {
          const handler = (await import(`${pathToFileURL(resolve(file)).href}?t=${Date.now()}`)).default
          await handler({ method: req.method, body: parsed, rawBody: body, url: req.url, socket: req.socket, headers: { ...req.headers, 'x-forwarded-proto': 'http' } }, reply)
        } catch (e) { if (!res.writableEnded) reply.status(500).json({ message: `${file} failed: ${e.message}` }) }
      })
    }
    for (const [route, file, name, sampleFile, sampleName] of local) {
      server.middlewares.use(route, async (req, res, next) => {
        if ((req.url || '/').split('?')[0] !== '/') return next()
        useKeys()
        let body = ''
        for await (const chunk of req) body += chunk
        let parsed = {}
        try { parsed = body ? JSON.parse(body) : {} } catch { /* not JSON: left empty */ }
        // the orders also come from the database (PayPal orders), so it alone is enough for them
        let status = 500, json = {}
        try {
          const run = process.env.STRIPE_SECRET_KEY || (name === 'orders' && (globalThis.__maTestDb || (/^mongodb/.test(process.env.MONGODB_URI || '') && !/<[^>]*>/.test(process.env.MONGODB_URI))))
            ? (await import(`${pathToFileURL(resolve(file)).href}?t=${Date.now()}`))[name]
            : (await import(pathToFileURL(resolve(sampleFile)).href))[sampleName]
          ;({ status, json } = await run({ method: req.method, body: parsed }))
        } catch (e) { json = { message: `${file} failed: ${e.message}` } }
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(json))
      })
    }
    server.middlewares.use('/admin', (req, res, next) => {
      const path = (req.originalUrl || '').split('?')[0]
      const name = (req.url || '').split('?')[0].replace(/^\//, '')
      // "/admin" and "/admin/" would otherwise fall through to the site's own router.
      if (path === '/admin') { res.statusCode = 302; res.setHeader('Location', '/admin/'); return res.end() }
      if (name === '') { res.setHeader('Content-Type', 'text/html'); return res.end(readFileSync(resolve('public/admin/index.html'))) }
      if (name === 'thumbs.json') { res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); return res.end(JSON.stringify(thumbs())) }
      if (!name.endsWith('.js') || !existsSync(resolve(CMS_DIR, name))) return next()
      res.setHeader('Content-Type', 'application/javascript')
      res.end(readFileSync(resolve(CMS_DIR, name)))
    })
  },
  closeBundle() {
    try {
      mkdirSync(resolve('dist/admin'), { recursive: true })
      for (const f of cmsFiles()) copyFileSync(resolve(CMS_DIR, f), resolve('dist/admin', f))
      writeFileSync(resolve('dist/admin/thumbs.json'), JSON.stringify(thumbs()))
      // On Vercel there is no Netlify login, so the admin logs people in with a passcode instead
      // (the functions in /api) and saves to the repository and branch this build came from.
      // The admin page reads this file; where it is missing it keeps the backend in config.yml.
      if (process.env.VERCEL) {
        const repo = process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
          ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
          : 'AlyassinDyaa/MiltonAguiar-Portfolio'
        writeFileSync(resolve('dist/admin/backend.json'), JSON.stringify({ name: 'github', repo, branch: process.env.VERCEL_GIT_COMMIT_REF || 'main' }))
      }
    } catch (e) { console.warn('admin bundle copy failed', e.message) }
  },
})

/* The artwork, as the built site sends it: never the full-size file. Every uploaded picture is
   brought down to ART_MAX pixels on its long side (sharp on any screen, too small for a good
   print: A3 wants about 3500), and the pictures of the Shop, the Work page, the Gallery, the pencils-to-colours sets
   and the comic samples carry the artist's logo inside the picture itself: clearly in a corner, and faintly and large in
   the middle, so cropping the corner off does not remove it. The files in public/uploads (what the
   admin uploads, and what this computer's dev server shows) stay as they are: only the copies in
   dist, which are what visitors get, are changed. The logo and the site icon are left alone. */
const ART_MAX = 1400
const ART_FOLDERS = ['work', 'gallery-sections', 'redraws', 'comics'] // whose pictures get the watermark
const readBrand = () => { try { return JSON.parse(readFileSync(resolve('content/site/brand.json'), 'utf8')) } catch { return {} } }
// the logo on the artwork can be switched off (Show / hide → Artwork); on unless switched off
const watermarkOn = () => { try { return (JSON.parse(readFileSync(resolve('content/site/visibility.json'), 'utf8')).art || {}).watermark !== false } catch { return true } }
// the comic samples can go without it while the rest of the artwork keeps it (Show / hide → Artwork)
const comicsMarked = () => { try { return (JSON.parse(readFileSync(resolve('content/site/visibility.json'), 'utf8')).art || {}).comicsWatermark !== false } catch { return true } }
// every /uploads picture named in the Shop, Work, before-and-after and comic samples content
const artPictures = () => {
  const art = new Set()
  for (const folder of ART_FOLDERS) {
    if (folder === 'comics' && !comicsMarked()) continue
    const at = resolve('content', folder)
    if (!existsSync(at)) continue
    for (const f of readdirSync(at)) {
      if (!f.endsWith('.json')) continue
      for (const m of readFileSync(resolve(at, f), 'utf8').matchAll(/"(\/uploads\/[^"]+)"/g)) art.add(m[1])
    }
  }
  // the pencils-to-colours sets, kept on the Home page (Page text → Home → The sets)
  try {
    const home = JSON.parse(readFileSync(resolve('content/pages/home.json'), 'utf8'))
    for (const s of Array.isArray(home.steps) ? home.steps : []) for (const k of ['pencils', 'inks', 'colours']) if (s && typeof s[k] === 'string' && s[k].startsWith('/uploads/')) art.add(s[k])
  } catch { /* no Home page file: nothing to add */ }
  return art
}
// the pictures on the membership card designs (Members → Rewards): shown on cards without the logo, at /uploads/card/<name>
const cardPictures = () => {
  const set = new Set()
  try {
    for (const m of readFileSync(resolve('content/pages/rewards.json'), 'utf8').matchAll(/"card(?:Art|Back)":\s*"(\/uploads\/[^"]+)"/g)) set.add(m[1])
  } catch { /* no rewards file: nothing */ }
  return set
}
/* The admin's own scripts and styles are loaded by name (shell.js, admin.css...). After a deploy a
   browser could keep an old copy while Decap fetched the new config, and the two would not match. So
   the built admin page names each with a stamp of its contents (shell.js?v=…): a change is a new
   address, and an unchanged file can stay cached. */
const stampAdmin = () => {
  const dir = resolve('dist/admin')
  const page = resolve(dir, 'index.html')
  if (!existsSync(page)) return
  let html = readFileSync(page, 'utf8')
  for (const name of ['admin.css', 'login.css', 'sales.js', 'shell.js']) {
    const file = resolve(dir, name)
    if (!existsSync(file)) continue
    const stamp = createHash('md5').update(readFileSync(file)).digest('hex').slice(0, 10)
    // the name as written in the page, inside double or single quotes
    html = html.split(`"${name}"`).join(`"${name}?v=${stamp}"`).split(`'${name}'`).join(`'${name}?v=${stamp}'`)
  }
  writeFileSync(page, html)
  console.log('  admin: scripts and styles stamped with their contents')
}
/* One picture as visitors get it: at most ART_MAX pixels on its long side, and for the artwork the
   logo inside the picture, clearly in a corner and faintly and large in the middle (cropping the
   corner off does not remove it). Answers null when the picture needs nothing. */
const artCopy = async (sharp, source, url, art, brand) => {
  const keep = new Set([brand.logo, brand.icon].filter(Boolean)) // the logo and the icon stay as uploaded
  if (keep.has(url)) return null
  const logoFile = brand.logo && existsSync(resolve(`public${brand.logo}`)) ? resolve(`public${brand.logo}`) : null
  const meta = await sharp(source).metadata()
  const big = Math.max(meta.width || 0, meta.height || 0) > ART_MAX
  const isArt = art.has(url) && Boolean(logoFile) && watermarkOn()
  if (!big && !isArt) return null
  let img = sharp(source)
  let w = meta.width, h = meta.height
  if (big) {
    img = img.resize({ width: ART_MAX, height: ART_MAX, fit: 'inside', withoutEnlargement: true })
    const r = Math.min(ART_MAX / w, ART_MAX / h); w = Math.round(w * r); h = Math.round(h * r)
  }
  if (isArt) {
    // the logo at a width, in white at a strength, with a soft dark shadow so it reads on light art too
    const mark = async (width, strength) => {
      const logo = await sharp(logoFile).resize({ width: Math.max(16, Math.round(width)) }).ensureAlpha().png().toBuffer()
      const lm = await sharp(logo).metadata()
      const fade = (buf, a) => sharp(buf).ensureAlpha().linear([1, 1, 1, a], [0, 0, 0, 0]).png().toBuffer()
      const shadow = await sharp(await sharp(logo).ensureAlpha().linear([0, 0, 0, 1], [0, 0, 0, 0]).png().toBuffer()).blur(Math.max(1, width / 60)).png().toBuffer()
      const pad = Math.ceil(width / 30)
      return sharp({ create: { width: lm.width + pad * 2, height: lm.height + pad * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
        { input: await fade(shadow, strength * 0.7), left: pad + Math.round(pad / 3), top: pad + Math.round(pad / 3) },
        { input: await fade(logo, strength), left: pad, top: pad },
      ]).png().toBuffer()
    }
    const short = Math.min(w, h)
    const corner = await mark(short * 0.17, 0.62)
    const middle = await mark(short * 0.62, 0.11)
    const c = await sharp(corner).metadata(), m = await sharp(middle).metadata()
    img = sharp(await img.toBuffer()).composite([
      { input: middle, left: Math.round((w - m.width) / 2), top: Math.round((h - m.height) / 2) },
      { input: corner, left: Math.max(0, Math.round(w - c.width - short * 0.025)), top: Math.max(0, Math.round(h - c.height - short * 0.025)) },
    ])
  }
  const ext = url.split('.').pop().toLowerCase()
  const out = ext === 'png' ? img.png({ compressionLevel: 9 }) : ext === 'webp' ? img.webp({ quality: 82 }) : img.jpeg({ quality: 82, mozjpeg: true })
  return { buffer: await out.toBuffer(), shrunk: big, marked: isArt }
}

/* The artwork as visitors get it: never the full-size file. When the site is built, every uploaded
   picture in dist is replaced by its copy (artCopy). The files in public/uploads (what the admin
   uploads) stay as they are. On this computer the dev server hands out the same copies, so what
   is seen here is what visitors will see. */
let building = false // set when the site is built (not on the dev server)
const protectArt = () => ({
  name: 'protect-art',
  configResolved(c) { building = c.command === 'build' },
  configureServer(server) {
    const made = new Map() // url -> { at, buffer }: made once per change of the file
    server.middlewares.use(async (req, res, next) => {
      const url = decodeURIComponent((req.url || '').split('?')[0])
      // a card's picture: the same upload brought down to size but without the logo (a card is not artwork to protect)
      const card = url.match(/^\/uploads\/card\/([^/]+\.(webp|png|jpe?g))$/i)
      if (card) {
        if (!cardPictures().has(`/uploads/${card[1]}`)) return next()
        const file = resolve(`public/uploads/${card[1]}`)
        if (!existsSync(file)) return next()
        try {
          const { default: sharp } = await import('sharp')
          const copy = await artCopy(sharp, readFileSync(file), `/uploads/${card[1]}`, new Set(), readBrand())
          res.setHeader('Content-Type', `image/${/\.jpe?g$/i.test(url) ? 'jpeg' : url.split('.').pop().toLowerCase()}`)
          res.setHeader('Cache-Control', 'no-cache')
          return res.end(copy ? copy.buffer : readFileSync(file))
        } catch { return next() }
      }
      if (!/^\/uploads\/[^/]+\.(webp|png|jpe?g)$/i.test(url)) return next()
      const file = resolve(`public${url}`)
      if (!existsSync(file)) return next()
      try {
        const { default: sharp } = await import('sharp')
        sharp.cache(false)
        const at = statSync(file).mtimeMs
        const mark = `${watermarkOn()}:${comicsMarked()}`
        let hit = made.get(url)
        if (!hit || hit.at !== at || hit.mark !== mark) {
          const copy = await artCopy(sharp, readFileSync(file), url, artPictures(), readBrand())
          hit = { at, mark, buffer: copy && copy.buffer }
          made.set(url, hit)
        }
        if (!hit.buffer) return next()
        res.setHeader('Content-Type', `image/${/\.jpe?g$/i.test(url) ? 'jpeg' : url.split('.').pop().toLowerCase()}`)
        res.setHeader('Cache-Control', 'no-cache')
        res.end(hit.buffer)
      } catch { next() }
    })
  },
  async closeBundle() {
    if (!building) return
    stampAdmin()
    const dir = resolve('dist/uploads')
    if (!existsSync(dir)) return
    const { default: sharp } = await import('sharp')
    sharp.cache(false)
    const art = artPictures(), brand = readBrand()
    let shrunk = 0, marked = 0
    for (const name of readdirSync(dir)) {
      if (!/\.(webp|png|jpe?g)$/i.test(name)) continue
      const file = resolve(dir, name)
      const copy = await artCopy(sharp, readFileSync(file), `/uploads/${name}`, art, brand) // read into memory: Windows keeps an opened file locked
      if (!copy) continue
      writeFileSync(file, copy.buffer)
      if (copy.shrunk) shrunk++
      if (copy.marked) marked++
    }
    console.log(`  artwork: ${shrunk} pictures brought down to ${ART_MAX}px, ${marked} marked with the logo`)
    // the card pictures again, without the logo, under uploads/card
    let cards = 0
    for (const url of cardPictures()) {
      const source = resolve(`public${url}`)
      if (!existsSync(source)) continue
      const copy = await artCopy(sharp, readFileSync(source), url, new Set(), brand)
      mkdirSync(resolve(dir, 'card'), { recursive: true })
      writeFileSync(resolve(dir, 'card', url.slice('/uploads/'.length)), copy ? copy.buffer : readFileSync(source))
      cards++
    }
    if (cards) console.log(`  cards: ${cards} pictures without the logo under uploads/card`)
  },
})

export default defineConfig({
  // Set VITE_BASE=/repo-name/ when deploying under a sub-path (GitHub project pages).
  base: process.env.VITE_BASE || '/',
  plugins: [react(), themeOnly(), spaFallback(), protectArt(), adminBundle()],
  // PORT lets a preview tool pick a free port; 5175 keeps clear of other sites' dev servers.
  server: { port: Number(process.env.PORT) || 5175 },
})
