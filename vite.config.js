import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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
    const KEYS = /^(STRIPE_|PAYPAL_|MONGODB_|SMTP_|RESEND_|MAIL_|SITE_URL$)/
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
    // Vercel. The webhook checks its message as it arrived, so it gets it untouched.
    for (const [route, file] of [['/api/checkout', 'api/checkout.js'], ['/api/paypal', 'api/paypal.js'], ['/api/discount', 'api/discount.js'], ['/api/discounts', 'api/discounts.js'], ['/api/account', 'api/account.js'], ['/api/stripe-webhook', 'api/stripe-webhook.js'], ['/api/contact', 'api/contact.js']]) {
      server.middlewares.use(route, async (req, res, next) => {
        if ((req.url || '/').split('?')[0] !== '/') return next()
        useKeys()
        let body = ''
        for await (const chunk of req) body += chunk
        let parsed = {}
        try { parsed = body ? JSON.parse(body) : {} } catch { /* not JSON: left empty */ }
        const reply = {
          setHeader: (k, v) => res.setHeader(k, v),
          status(code) { res.statusCode = code; return reply },
          json(data) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return reply },
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

export default defineConfig({
  // Set VITE_BASE=/repo-name/ when deploying under a sub-path (GitHub project pages).
  base: process.env.VITE_BASE || '/',
  plugins: [react(), themeOnly(), spaFallback(), adminBundle()],
  // PORT lets a preview tool pick a free port; 5175 keeps clear of other sites' dev servers.
  server: { port: Number(process.env.PORT) || 5175 },
})
