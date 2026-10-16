import { configured, goodPass, repo } from './_session.js'

/* Admin saving on Vercel. The admin panel thinks it is talking to GitHub; it is talking to this.
   Each request must carry the pass from /api/auth. If it does, the request is passed on to
   GitHub with the site's own token (GITHUB_TOKEN, which never reaches the browser), and only
   for this site's repository. The panel calls /api/gh/<GitHub path>, which vercel.json routes here. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!configured()) return res.status(500).json({ message: 'ADMIN_PASSCODE and GITHUB_TOKEN are not set in the Vercel project settings.' })
  const pass = String(req.headers.authorization || '').replace(/^(token|bearer)\s+/i, '')
  if (!goodPass(pass)) return res.status(401).json({ message: 'Your login has run out. Log out of the admin and log in again.' })

  // Taken from the address as the panel wrote it, so GitHub gets exactly that. Should the host
  // hand over the rewritten address instead, the same path arrives as "path" in the query.
  const [where, ...rest] = req.url.split('?')
  const query = new URLSearchParams(rest.join('?'))
  const pieces = query.getAll('path')
  query.delete('path')
  const rawPath = where.startsWith('/api/gh/') ? where.slice('/api/gh'.length) : `/${pieces.join('/').split('/').map(encodeURIComponent).join('/')}`
  const more = where.startsWith('/api/gh/') ? rest : [query.toString()].filter(Boolean)
  let path = ''
  try { path = decodeURIComponent(rawPath).toLowerCase() } catch { /* not a valid address: refused below */ }
  const home = `/repos/${repo()}`.toLowerCase()
  const allowed = path === '/user' || path === home || path.startsWith(`${home}/`)
  if (!allowed || path.includes('..')) return res.status(403).json({ message: 'The admin can only reach the repository of this site.' })

  /* What the pass may do there. Reading anything in the repository; writing only what saving content
     needs, and only content: file contents (blobs), a tree that changes files under content/ and
     public/uploads/ only, a commit, and moving a branch forward (never forced) to a commit whose
     changes are all under those two folders, checked with GitHub before it is moved. Nothing else is
     passed on: not the site's code, its settings, its history, or the repository itself, so a pass
     that fell into other hands could only change words and pictures. */
  const method = String(req.method || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    const sub = path.slice(home.length) // "/git/trees", "/git/refs/heads/main"...
    const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body) } catch { return null } })() : req.body
    const safePath = (f) => typeof f === 'string' && !f.includes('..') && /^(content|public\/uploads)\//.test(f.replace(/^\/+/, ''))
    const no = (why) => res.status(403).json({ message: `Saving refused: ${why}` })
    const gh = (p) => fetch(`https://api.github.com${home}${p}`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'milton-aguiar-admin' } }).then((r) => (r.ok ? r.json() : null))
    if (method === 'POST' && (sub === '/git/blobs' || sub === '/git/commits')) { /* contents and commits: only reachable through the checks below */ }
    else if (method === 'POST' && sub === '/git/trees') {
      if (!body || typeof body.base_tree !== 'string' || !Array.isArray(body.tree) || !body.tree.length) return no('a change must build on the site as it is.')
      if (!body.tree.every((e) => e && safePath(e.path) && (e.type === 'blob' || e.type === undefined) && (e.mode === '100644' || e.mode === undefined))) return no('only the content and the pictures can be changed.')
    } else if (method === 'PATCH' && /^\/git\/refs\/heads\/[^/]+$/.test(sub)) {
      if (!body || typeof body.sha !== 'string' || !/^[0-9a-f]{40}$/i.test(body.sha) || body.force) return no('the history cannot be rewritten.')
      const branch = sub.split('/').pop()
      const head = await gh(`/git/ref/heads/${encodeURIComponent(branch)}`)
      const now = head && head.object && head.object.sha
      if (!now) return no('the branch could not be read.')
      const diff = await gh(`/compare/${now}...${body.sha}`)
      if (!diff || diff.status !== 'ahead' || !Array.isArray(diff.files)) return no('a change must come after the site as it is.')
      if (diff.files.length >= 300 || !diff.files.every((f) => safePath(f.filename) && (!f.previous_filename || safePath(f.previous_filename)))) return no('only the content and the pictures can be changed.')
    } else return no('the admin can only save content.')
  }

  const init = {
    method: req.method,
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: req.headers.accept || 'application/vnd.github+json', 'User-Agent': 'milton-aguiar-admin' },
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.headers['Content-Type'] = 'application/json'
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})
  }
  try {
    const answer = await fetch(`https://api.github.com${rawPath}${more.length ? `?${more.join('?')}` : ''}`, init)
    for (const name of ['content-type', 'link', 'etag']) if (answer.headers.get(name)) res.setHeader(name, answer.headers.get(name))
    res.status(answer.status).send(Buffer.from(await answer.arrayBuffer()))
  } catch {
    res.status(502).json({ message: 'Could not reach GitHub.' })
  }
}
