/* Milton Aguiar admin: the screens for orders and customers (and the Shop's discount codes).
   shell.js puts them in the navigation, under Orders & customers and Shop:
   - Orders: every purchase made through the shop's Stripe checkout, newest first, with totals at
     the top, chips to narrow them by where they are up to (to ship, shipped...), a search, a
     period and a sort, and a panel per order with what was bought, who bought it, where it goes,
     and where it is up to (status, tracking number and a note, kept on the order in Stripe);
   - Customers: everyone who has bought, and everyone with an account on the site, with what they
     have spent; one opens everything about them, and the rewards gifted to them;
   - Discount codes: a percentage off, for a while, for chosen customers (a code each) or anyone with
     a shared code;
   - Emails: news and notices to many customers at once (those who agreed to news, or every
     account for a notice about the service), from ready-made emails, sent a few at a time.
   The orders come from /api/orders, the codes from /api/discounts (both kept in Stripe), the
   accounts from /api/account, each with the admin's own pass.
   shell.js puts the links in the navigation and shows this screen at #/sales/orders,
   #/sales/customers, #/sales/discounts and #/sales/emails. */
window.IASales = (() => {
  const el = (tag, props = {}, kids = []) => {
    const n = Object.assign(document.createElement(tag), props)
    kids.forEach((k) => k != null && k !== false && n.append(k))
    return n
  }
  const STAGES = [['new', 'New'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['complete', 'Complete'], ['cancelled', 'Cancelled']]
  const stageName = Object.fromEntries(STAGES)
  const PAYMENT = { paid: 'Paid', 'part-refunded': 'Part refunded', refunded: 'Refunded', unpaid: 'Not paid', expired: 'Abandoned' }
  const PERIODS = [['all', 'All time'], ['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['year', 'This year']]
  /* Each list is shown a page at a time: 10, 15, 20, 50 or 100 rows, as the admin picks (kept in
     this browser for every list). */
  const PER = [10, 15, 20, 50, 100]
  const perSaved = () => { try { const n = Number(localStorage.getItem('ma.sales.per')); return PER.includes(n) ? n : 20 } catch { return 20 } }

  // ---------- reading and saving ----------
  const pass = () => { try { return JSON.parse(localStorage.getItem('decap-cms-user') || '{}').token || '' } catch { return '' } }
  const api = async (method = 'GET', body) => {
    try {
      const r = await fetch('/api/orders', { method, cache: 'no-store', headers: { Authorization: `token ${pass()}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const json = await r.json().catch(() => ({}))
      return { ok: r.ok, status: r.status, json }
    } catch {
      return { ok: false, status: 0, json: { message: 'Could not reach the site. Check the connection and try again.' } }
    }
  }

  // ---------- what the screens hold ----------
  const state = {
    view: 'orders', ordersTab: 'shop', loaded: false, loading: false, orders: [], sample: false, problem: null,
    o: { q: '', stage: 'all', period: 'all', sort: 'new', page: 1, per: perSaved(), customer: '' },
    c: { q: '', kind: 'all', sort: 'spent', page: 1, per: perSaved() },
    open: null, // the order whose panel is open
    pieces: new Set(), // the orders whose pieces are shown under their row
    saved: null, // the order just saved, to say so
  }
  const done = (o) => o.payment !== 'unpaid' && o.payment !== 'expired' // a completed purchase
  const kept = (o) => done(o) ? o.total - (o.refunded || 0) : 0 // what it brought in
  const ORDER_CHIPS = [
    ['all', 'All orders', done],
    ['to-ship', 'To ship', (o) => done(o) && o.payment !== 'refunded' && o.fulfilment === 'new'],
    ['packed', 'Packed', (o) => done(o) && o.fulfilment === 'packed'],
    ['shipped', 'Shipped', (o) => done(o) && o.fulfilment === 'shipped'],
    ['delivered', 'Delivered', (o) => done(o) && o.fulfilment === 'delivered'],
    ['cancelled', 'Cancelled', (o) => done(o) && o.fulfilment === 'cancelled'],
    ['refunded', 'Refunded', (o) => o.payment === 'refunded' || o.payment === 'part-refunded'],
    ['unfinished', 'Unfinished checkouts', (o) => !done(o)],
  ]

  // ---------- small helpers ----------
  const money = (n, cur = 'EUR') => { try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur, minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n) } catch { return `${n} ${cur}` } }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const date = (t, withTime = false) => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}${withTime ? `, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''}` }
  let regions = null
  const country = (code) => { if (!code) return ''; try { regions = regions || new Intl.DisplayNames(['en'], { type: 'region' }); return regions.of(code) || code } catch { return code } }
  const inPeriod = (t, p) => {
    if (p === 'all') return true
    const now = new Date()
    if (p === 'today') return new Date(t).toDateString() === now.toDateString()
    if (p === 'year') return new Date(t).getFullYear() === now.getFullYear()
    return t >= Date.now() - Number(p) * 24 * 60 * 60 * 1000
  }
  const currency = () => (state.orders.find(done) || state.orders[0] || {}).currency || 'EUR'
  const select = (value, options, onChange, label) => {
    const s = el('select', { className: 'sl-select', ariaLabel: label }, options.map(([v, t]) => el('option', { value: v, textContent: t, selected: v === value })))
    s.addEventListener('change', () => onChange(s.value))
    return el('label', { className: 'sl-field' }, [el('span', { textContent: label }), s])
  }
  const search = (value, placeholder, onInput) => {
    const i = el('input', { type: 'search', className: 'sl-search', placeholder, value })
    let t
    i.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => onInput(i.value), 160) })
    return el('label', { className: 'sl-field grow' }, [el('span', { textContent: 'Search' }), i])
  }
  const badge = (kind, text) => el('span', { className: `sl-badge is-${kind}`, textContent: text })
  const csv = (rows, name) => {
    const text = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const a = el('a', { href: URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' })), download: name })
    document.body.append(a); a.click(); a.remove()
  }

  // ---------- the Show / hide switches for test data ----------
  /* Read from content/site/visibility.json as it is now: on the live site through the admin's
     own GitHub access (so a change shows before the site is rebuilt), on this computer from the
     file itself. Read again each time the Sales screens open. */
  // test data, screen by screen (Site → Show / hide → Test data): orders, customers, discount codes
  let showTest = { orders: true, customers: true, codes: true }
  const readSwitch = async () => {
    try {
      let text = ''
      const backend = await fetch('backend.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null) // only on Vercel
      if (backend && backend.repo) {
        const r = await fetch(`/api/gh/repos/${backend.repo}/contents/content/site/visibility.json?ref=${encodeURIComponent(backend.branch || 'main')}`, { cache: 'no-store', headers: { Authorization: `token ${pass()}`, Accept: 'application/vnd.github.raw' } })
        if (r.ok) text = await r.text()
      } else {
        const r = await fetch('/content/site/visibility.json', { cache: 'no-store' })
        if (r.ok) text = await r.text()
      }
      const v = text ? JSON.parse(text) : {}
      const s = v.sales || {}
      const all = s.testData !== false // the single switch there was before
      showTest = { orders: s.testOrders ?? all, customers: s.testCustomers ?? all, codes: s.testCodes ?? all }
    } catch { showTest = { orders: true, customers: true, codes: true } }
  }
  const visible = (list, kind) => (showTest[kind] ? list : list.filter((x) => !x.test))
  const hiddenNote = (all, what, kind) => (!showTest[kind] && all.some((x) => x.test) ? el('div', { className: 'sl-notice' }, [el('strong', { textContent: 'Test data is hidden' }), el('p', { textContent: `${all.filter((x) => x.test).length} test ${what} left out. Show them again under Site → Show / hide → Test data.` })]) : null)

  // ---------- the screen ----------
  let root = null
  const mount = () => (root = root || el('main', { className: 'ia-sales', ariaLabel: 'Orders and customers' }))

  const load = async () => {
    state.loading = true; draw()
    const r = await api('GET')
    state.loading = false; state.loaded = true
    if (r.ok) { state.orders = (r.json.orders || []).sort((a, b) => b.created - a.created); state.sample = Boolean(r.json.sample); state.mode = r.json.mode || ''; state.problem = null }
    else state.problem = { code: r.json.code || '', status: r.status, message: r.json.message || 'The orders could not be loaded.' }
    draw()
  }

  // the group each screen sits in, in the navigation: the small red line over its title
  const KICKER = { orders: 'Orders & customers', customers: 'Orders & customers', emails: 'Orders & customers', discounts: 'Shop' }
  const head = (title, lead, actions) => el('header', { className: 'sl-head' }, [
    el('div', {}, [el('div', { className: 'ia-kicker', textContent: KICKER[state.view] || 'Orders & customers' }), el('h1', { textContent: title }), el('p', { className: 'ia-lead', textContent: lead })]),
    el('div', { className: 'sl-actions' }, actions),
  ])
  const button = (text, onClick, cls = 'ia-btn ghost') => { const b = el('button', { type: 'button', className: cls, textContent: text }); b.addEventListener('click', onClick); return b }
  const notices = () => {
    if (state.problem) {
      const p = state.problem
      return el('div', { className: `sl-notice ${p.code === 'no-stripe' ? '' : 'is-bad'}` }, [
        el('strong', { textContent: p.code === 'no-stripe' ? 'Stripe is not connected yet' : p.status === 401 ? 'Your login has run out' : 'The orders could not be loaded' }),
        el('p', { textContent: p.message }),
        p.code === 'no-stripe' ? el('p', { textContent: 'In Stripe: Developers → API keys, copy the Secret key. In Vercel: the project’s Settings → Environment Variables, add STRIPE_SECRET_KEY with it, then redeploy.' }) : null,
      ])
    }
    if (state.sample && showTest.orders) return el('div', { className: 'sl-notice' }, [el('strong', { textContent: 'Sample orders' }), el('p', { textContent: 'This is the local preview without a Stripe key, so these orders are made up to show how the screen works. On the live site this shows the real orders from Stripe.' })])
    return null
  }
  const stat = (label, value, note) => el('div', { className: 'sl-stat' }, [el('span', { textContent: label }), el('strong', { textContent: value }), note ? el('small', { textContent: note }) : null])

  // ---------- rows, icons and modals ----------
  /* A row of a list: the whole row opens it, and the two icons at its end show the customer and
     delete it (each through a modal). */
  const ICON = {
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6 M12 7.5h.01"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6"/></svg>',
    pieces: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15.5 9.5a1.5 1.5 0 1 0 0-.01"/></svg>',
  }
  const iconBtn = (kind, label, onClick) => {
    const b = el('button', { type: 'button', className: `sl-icon is-${kind}`, title: label, ariaLabel: label })
    b.innerHTML = ICON[kind]
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick() })
    return b
  }
  const rowEl = (on, cells, open, acts) => {
    const r = el('div', { className: `sl-row ${on ? 'on' : ''}`, role: 'row', tabIndex: 0 }, [...cells, el('span', { className: 'sl-acts' }, acts)])
    r.addEventListener('click', (e) => { if (!e.target.closest('.sl-acts')) open() })
    r.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === r) { e.preventDefault(); open() } })
    return r
  }
  /* The rows of the page the list is on, and the bar under the list: which rows these are, the
     pages, and how many rows a page holds. */
  const pageOf = (list, f) => {
    const pages = Math.max(1, Math.ceil(list.length / f.per))
    if (f.page > pages) f.page = pages
    return list.slice((f.page - 1) * f.per, f.page * f.per)
  }
  const pager = (list, f, [one, many]) => {
    if (!list.length) return null
    const pages = Math.ceil(list.length / f.per)
    const go = (n) => { f.page = Math.min(pages, Math.max(1, n)); draw(); root.querySelector('.sl-count')?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }
    const step = (text, n, label, off) => { const b = el('button', { type: 'button', className: 'sl-page', textContent: text, ariaLabel: label, disabled: off }); b.addEventListener('click', () => go(n)); return b }
    // the first and last page, and the two either side of this one; a gap shown as …
    const show = [...new Set([1, f.page - 1, f.page, f.page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)
    const numbers = show.flatMap((n, i) => {
      const b = step(String(n), n, `Page ${n}`, false)
      if (n === f.page) { b.classList.add('on'); b.setAttribute('aria-current', 'page') }
      return i && n - show[i - 1] > 1 ? [el('span', { className: 'sl-gap', textContent: '…' }), b] : [b]
    })
    const per = el('select', { className: 'sl-select sl-per', ariaLabel: 'Rows per page' }, PER.map((n) => el('option', { value: n, textContent: String(n), selected: n === f.per })))
    per.addEventListener('change', () => {
      const n = Number(per.value)
      for (const x of [state.o, state.c, dState, cState]) x.per = n // one choice for every list
      f.page = 1
      try { localStorage.setItem('ma.sales.per', String(n)) } catch { /* only for this visit */ }
      draw()
    })
    const from = (f.page - 1) * f.per + 1, to = Math.min(list.length, f.page * f.per)
    return el('nav', { className: 'sl-pager', ariaLabel: 'Pages' }, [
      el('span', { className: 'sl-pager-info', textContent: `${from}–${to} of ${list.length} ${list.length === 1 ? one : many}` }),
      pages > 1 ? el('div', { className: 'sl-pages' }, [step('‹', f.page - 1, 'Previous page', f.page === 1), ...numbers, step('›', f.page + 1, 'Next page', f.page === pages)]) : el('span'),
      el('label', { className: 'sl-pager-per' }, [el('span', { textContent: 'Per page' }), per]),
    ])
  }
  // the letters in a customer's badge, and how long a paid order has waited to be posted
  const initials = (t) => String(t || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
  const waitDays = (o) => (done(o) && o.payment !== 'refunded' && ['new', 'packed'].includes(o.fulfilment) ? Math.floor((Date.now() - o.created) / 864e5) : 0)
  const headRow = (titles) => el('div', { className: 'sl-row sl-th', role: 'row' }, [...titles.map((t) => el('span', { role: 'columnheader', textContent: t })), el('span', { role: 'columnheader' })])

  /* The open modal, if any: { kind: 'confirm', title, text, more, yes, run, plain, back },
     { kind: 'customer', key, stub } or { kind: 'gift', email }. A confirm with `back` goes back
     to that modal when it is done or cancelled. */
  state.modal = null
  const ask = (m) => { state.modal = { kind: 'confirm', ...m }; draw() }
  const closeModal = () => { state.modal = (state.modal && state.modal.back) || null; draw() }
  const keyOf = (o) => (o.email || o.name || o.id).toLowerCase()
  const many = (n, one, more = `${one}s`) => `${n} ${n === 1 ? one : more}`

  const hideOrders = async (list) => {
    if (!list.length) return ''
    const r = await api('POST', { action: 'hide', orders: list.map((o) => ({ id: o.id, paymentIntent: o.paymentIntent })) })
    if (!r.ok) return r.json.message || 'Not deleted. Try again.'
    const gone = new Set(list.map((o) => o.id))
    state.orders = state.orders.filter((o) => !gone.has(o.id))
    if (gone.has(state.open)) state.open = null
    return ''
  }
  const askOrder = (o) => ask({
    title: `Delete order #${o.number}?`,
    text: `${o.name || o.email || 'This order'} · ${money(o.total, o.currency)} · ${date(o.created)}`,
    more: 'It is erased: it leaves Orders and Customers, and the buyer\'s account too. Stripe never deletes a payment, so Stripe keeps its own record of it (and any refund is still done there).',
    yes: 'Delete order',
    run: () => hideOrders([o]),
  })
  /* Deleting a customer takes their orders off the admin, and deletes the discount codes made
     for their email (they stop working). An account on the site is not touched. */
  const askCustomer = (c) => {
    const theirs = state.orders.filter((o) => keyOf(o) === c.key)
    const codes = codesOf(c.email)
    ask({
      title: `Delete ${c.name || c.email}?`,
      text: [c.email, many(theirs.length, 'order'), money(c.spent, c.currency), codes.length ? many(codes.length, 'discount code') : ''].filter(Boolean).join(' · '),
      more: `Their orders${codes.length ? ' and discount codes' : ''} are taken off the admin for good${codes.length ? '; the codes stop working' : ''}. Stripe keeps its own record of the payments.${c.member ? ' Their account on the site stays.' : ''}`,
      yes: 'Delete customer',
      run: async () => (await hideOrders(theirs)) || (await dropCodes(codes)),
    })
  }
  const confirmModal = (m) => {
    const said = el('p', { className: 'sl-said is-bad' })
    const yes = button(m.yes, async () => {
      yes.disabled = true; no.disabled = true; said.textContent = ''
      yes.textContent = 'Working…'
      const problem = await m.run()
      if (problem) { said.textContent = problem; yes.disabled = false; no.disabled = false; yes.textContent = m.yes; return }
      closeModal()
    }, m.plain ? 'ia-btn' : 'ia-btn sl-danger-solid')
    const no = button('Cancel', closeModal, 'ia-btn ghost')
    return [
      el('div', { className: `sl-modal-head ${m.plain ? '' : 'is-danger'}` }, [el('div', { className: 'ia-kicker', textContent: m.plain ? 'Check first' : 'Are you sure?' }), el('h2', { textContent: m.title })]),
      el('div', { className: 'sl-modal-body' }, [el('p', { className: 'sl-modal-what', textContent: m.text }), el('p', { textContent: m.more }), said]),
      el('div', { className: 'sl-modal-foot' }, [no, yes]),
    ]
  }

  /* Everything about one customer: their account (picture, member number, gifts), contact, every
     address they have had things sent to, what they have bought, and their discount codes. */
  const customerModal = (m) => {
    const key = m.key
    const theirs = state.orders.filter((o) => keyOf(o) === key).sort((a, b) => b.created - a.created)
    const c = customers().find((x) => x.key === key)
      || (m.stub ? { key, email: m.stub.email, name: m.stub.name || '', country: '', orders: theirs.filter(done).length, spent: 0, first: 0, last: 0, waiting: 0, currency: 'EUR', member: memberOf(m.stub.email), joined: 0 } : null)
    if (!c && !theirs.length) return null
    const first = theirs[0] || {}
    const email = (c && c.email) || first.email || ''
    const name = (c && c.name) || first.name || email || '—'
    const mem = c ? c.member : null
    const phone = (theirs.find((o) => o.phone) || {}).phone || ''
    const places = new Map()
    for (const o of theirs) if (o.shipTo.length) { const k = o.shipTo.join('|'); places.set(k, { lines: [o.name, ...o.shipTo.slice(0, -1), country(o.shipTo[o.shipTo.length - 1])].filter(Boolean), n: (places.get(k)?.n || 0) + 1, last: Math.max(places.get(k)?.last || 0, o.created) }) }
    const codes = codesOf(email)
    const block = (title, kids) => el('section', { className: 'sl-block' }, [el('h3', { textContent: title }), ...kids])
    const bought = c && c.orders
    return [
      el('div', { className: 'sl-modal-head sl-profile' }, [
        avatar({ name, email, member: mem }, 'lg'),
        el('div', { className: 'sl-profile-who' }, [
          el('div', { className: 'ia-kicker', textContent: 'Customer' }),
          el('h2', { textContent: name }),
          email && email !== name ? el('span', { className: 'sl-profile-mail', textContent: email }) : null,
          el('span', { className: 'sl-profile-tags' }, [
            mState.loaded && !mState.problem ? (mem ? badge('member', `Member ${memberNo(mem.memberNo)}`) : badge('noacc', 'No account')) : null,
            mem ? badge(mem.verified ? 'verified' : 'unverified', mem.verified ? 'Email confirmed' : 'Email not confirmed') : null,
          ]),
        ]),
      ]),
      el('div', { className: 'sl-modal-body' }, [
        el('div', { className: 'sl-mini-stats' }, [
          stat('Orders', String(bought || 0)),
          stat('Spent', money(c ? c.spent : 0, (c && c.currency) || first.currency)),
          bought ? stat('First order', date(c.first)) : stat('Member since', mem && mem.createdAt ? date(mem.createdAt) : '—'),
          stat('Last order', bought ? date(c.last) : '—'),
        ]),
        email ? block('Rewards gifted', [giftsFor(m, email)]) : null,
        block('Contact', [el('p', { className: 'sl-who' }, [
          email ? el('span', { className: 'sl-mail' }, [el('span', { textContent: email }), copyBtn(email, 'email')]) : el('span', { textContent: 'No email' }),
          phone ? el('a', { href: `tel:${phone.replace(/[^+\d]/g, '')}`, textContent: phone }) : el('span', { className: 'sl-dim', textContent: 'No phone number given' }),
          c && c.country ? el('span', { textContent: country(c.country) }) : null,
        ])]),
        block(places.size === 1 ? 'Address' : 'Addresses', places.size ? [el('div', { className: 'sl-addresses' }, [...places.values()].sort((a, b) => b.last - a.last).map((p) => el('p', { className: 'sl-address' }, [...p.lines.flatMap((line, i) => (i ? [el('br'), line] : [line])), el('small', { className: 'sl-hint', textContent: `Used on ${many(p.n, 'order')}, last ${date(p.last)}` })])))] : [el('p', { className: 'sl-dim', textContent: 'No delivery address on their orders.' })]),
        theirs.length ? block('Orders', [el('ul', { className: 'sl-items sl-their-orders' }, theirs.map((o) => {
          const li = el('li', {}, [el('span', { textContent: `#${o.number} · ${date(o.created)}` }), done(o) ? badge(o.fulfilment, stageName[o.fulfilment]) : badge(o.payment, PAYMENT[o.payment]), el('strong', { textContent: money(o.total, o.currency) })])
          li.addEventListener('click', () => { state.modal = null; state.open = o.id; if (state.view !== 'orders') location.hash = '#/sales/orders'; else draw() })
          return li
        }))]) : null,
        email ? block('Discount codes', codes.length ? [el('ul', { className: 'sl-items sl-their-codes' }, codes.map((d) => {
          const [k, t] = statusOf(d)
          return el('li', { className: 'is-static' }, [el('span', {}, [el('code', { className: 'sl-code', textContent: d.code }), el('small', { textContent: ` · ${d.until ? `${d.until < now() ? 'ended' : 'until'} ${date(d.until * 1000)}` : 'no end'}` })]), badge(`d-${k}`, t), el('strong', { textContent: `${d.percent}% off` })])
        }))] : [el('p', { className: 'sl-dim', textContent: dState.problem ? 'The codes could not be loaded just now.' : dState.loaded ? 'None yet.' : 'Loading the codes…' })]) : null,
      ]),
      el('div', { className: 'sl-modal-foot' }, [
        email ? button('Give them a discount', () => discountFor([c ? c.key : email.toLowerCase()], email, name), 'ia-btn ghost') : null,
        email ? copyBtn(email, 'email', 'ia-btn ghost') : null,
        theirs.length ? button('See their orders', () => { state.modal = null; location.hash = `#/sales/orders?customer=${encodeURIComponent(email || first.name)}`; draw() }, 'ia-btn ghost') : null,
        button('Close', () => { state.modal = null; draw() }, 'ia-btn'),
      ]),
    ]
  }
  const modalLayer = () => {
    const m = state.modal
    if (!m) return []
    const inside = m.kind === 'customer' ? customerModal(m) : m.kind === 'gift' ? giftModal(m) : confirmModal(m)
    if (!inside) { state.modal = null; return [] }
    // the window keeps its place when it is drawn again (picking a reward, say)
    const body = inside.find((n) => n && n.classList && n.classList.contains('sl-modal-body'))
    if (body) body.dataset.keepScroll = `modal-${m.kind}-${m.key || m.email || ''}`
    const shade = el('div', { className: 'sl-modal-shade' }, [el('div', { className: `sl-modal ${m.kind === 'confirm' ? 'is-small' : m.kind === 'customer' ? 'is-wide' : ''}`, role: m.kind === 'confirm' ? 'alertdialog' : 'dialog', ariaModal: 'true' }, inside)])
    shade.addEventListener('click', (e) => { if (e.target === shade) closeModal() })
    return [shade]
  }

  // ---------- Orders ----------
  const filteredOrders = () => {
    const f = state.o
    const chip = ORDER_CHIPS.find((c) => c[0] === f.stage) || ORDER_CHIPS[0]
    const q = f.q.trim().toLowerCase()
    const list = visible(state.orders, 'orders').filter((o) => chip[2](o) && inPeriod(o.created, f.period)
      && (!f.customer || (o.email || o.name).toLowerCase() === f.customer.toLowerCase())
      && (!q || [o.number, o.name, o.email, o.country, country(o.country), o.tracking, o.note, o.discountCode, ...o.items.map((i) => i.name)].join(' ').toLowerCase().includes(q)))
    const by = { new: (a, b) => b.created - a.created, old: (a, b) => a.created - b.created, high: (a, b) => b.total - a.total, low: (a, b) => a.total - b.total, name: (a, b) => (a.name || a.email).localeCompare(b.name || b.email) }
    return list.sort(by[f.sort] || by.new)
  }
  const ordersView = () => {
    const f = state.o
    const inRange = visible(state.orders, 'orders').filter((o) => inPeriod(o.created, f.period))
    const sold = inRange.filter(done)
    const cur = currency()
    const income = sold.reduce((t, o) => t + kept(o), 0)
    const toShip = sold.filter(ORDER_CHIPS[1][2]).length
    const list = filteredOrders()
    const set = (k, v) => { state.o[k] = v; state.o.page = 1; draw() }
    const exportCsv = () => csv([
      ['Order', 'Date', 'Customer', 'Email', 'Phone', 'Country', 'Ship to', 'Items', 'Discount code', 'Discount', 'Total', 'Refunded', 'Currency', 'Payment', 'Status', 'Tracking', 'Note'],
      ...list.map((o) => [o.number, date(o.created, true), o.name, o.email, o.phone, country(o.country), o.shipTo.join(', '), o.items.map((i) => `${i.name} x${i.qty}`).join('; '), o.discountCode, o.discount, o.total, o.refunded, o.currency, PAYMENT[o.payment] || o.payment, stageName[o.fulfilment], o.tracking, o.note]),
    ], `orders-${new Date().toISOString().slice(0, 10)}.csv`)
    return [
      ordersTabs(),
      head('Orders', 'Every purchase made through the shop, paid by card (Stripe) or PayPal. Open one to see what was bought and where it goes, and mark it packed, shipped or delivered: the buyer sees each step, and the tracking number, in their account.', [
        button(state.loading ? 'Loading…' : 'Refresh', load),
        button('Export CSV', exportCsv),
        el('a', { className: 'ia-btn ghost', href: 'https://dashboard.stripe.com/payments', target: '_blank', rel: 'noopener', textContent: 'Stripe ↗' }),
      ]),
      notices(),
      hiddenNote(state.orders, 'orders', 'orders'),
      el('div', { className: 'sl-stats' }, [
        stat('Income', money(income, cur), PERIODS.find((p) => p[0] === f.period)[1]),
        stat('Orders', String(sold.length), sold.length ? `${sold.reduce((n, o) => n + o.items.reduce((m, i) => m + i.qty, 0), 0)} pieces` : ''),
        stat('To ship', String(toShip), toShip ? 'waiting to be sent' : 'nothing waiting'),
        stat('Average order', money(sold.length ? income / sold.length : 0, cur)),
      ]),
      el('div', { className: 'sl-chips', role: 'group', ariaLabel: 'Show' }, ORDER_CHIPS.map(([k, label, test]) => {
        const n = inRange.filter(test).length
        const b = el('button', { type: 'button', className: `sl-chip ${f.stage === k ? 'on' : ''} ${k === 'to-ship' && n ? 'is-hot' : ''}`, ariaPressed: String(f.stage === k) }, [label, el('small', { textContent: String(n) })])
        b.addEventListener('click', () => set('stage', k))
        return b
      })),
      el('div', { className: 'sl-tools' }, [
        search(f.q, 'Order no., name, email, piece, tracking, code…', (v) => set('q', v)),
        select(f.period, PERIODS, (v) => set('period', v), 'Period'),
        select(f.sort, [['new', 'Newest first'], ['old', 'Oldest first'], ['high', 'Total: high to low'], ['low', 'Total: low to high'], ['name', 'Customer A–Z']], (v) => set('sort', v), 'Sort'),
      ]),
      f.customer ? el('div', { className: 'sl-filtering' }, [el('span', { textContent: `Orders from ${f.customer}` }), button('Show everyone', () => { state.o.customer = ''; history.replaceState(null, '', '#/sales/orders'); draw() }, 'sl-clear')]) : null,
      el('p', { className: 'sl-count', textContent: state.loading && !state.loaded ? 'Loading the orders…' : `${list.length} ${list.length === 1 ? 'order' : 'orders'}` }),
      list.length ? el('div', { className: 'sl-table is-orders', role: 'table' }, [
        headRow(['Order', 'Customer', 'Pieces', 'Total', 'Payment', 'Status']),
        ...pageOf(list, f).flatMap((o) => {
          const showing = state.pieces.has(o.id)
          const look = o.items.length ? iconBtn('pieces', showing ? 'Hide the pieces' : 'See the pieces bought', () => { if (showing) state.pieces.delete(o.id); else state.pieces.add(o.id); draw() }) : null
          if (look && showing) look.classList.add('on')
          return [rowEl(state.open === o.id, [
            el('span', { className: 'sl-c-order' }, [el('strong', { textContent: `#${o.number}` }), el('small', { textContent: date(o.created, true) }), waitDays(o) >= 2 ? el('em', { className: 'sl-wait', textContent: `waiting ${waitDays(o)} days` }) : null]),
            el('span', { className: 'sl-c-who' }, [el('i', { className: 'sl-initials', ariaHidden: 'true', textContent: initials(o.name || o.email) }), el('span', {}, [el('strong', { textContent: o.name || '—' }), el('small', { textContent: o.email || country(o.country) })])]),
            el('span', { className: 'sl-c-items' }, [
              el('span', { className: 'sl-thumbs', ariaHidden: 'true' }, o.items.filter((i) => i.src).slice(0, 3).map((i) => el('img', { src: i.src, alt: '', loading: 'lazy' }))),
              el('span', {}, [el('strong', { textContent: o.items[0] ? `${o.items[0].title || o.items[0].name}${o.items[0].qty > 1 ? ` ×${o.items[0].qty}` : ''}` : '—' }), el('small', { textContent: [o.items[0] && o.items[0].size, o.items[0] && o.items[0].signed != null ? (o.items[0].signed ? 'signed' : 'unsigned') : '', o.items.length > 1 ? `+ ${o.items.length - 1} more` : ''].filter(Boolean).join(' · ') })]),
            ]),
            el('span', { className: 'sl-c-total' }, [el('strong', { textContent: money(o.total, o.currency) }), o.refunded ? el('small', { textContent: `${money(o.refunded, o.currency)} refunded` }) : o.discount ? el('small', { textContent: `${money(o.discount, o.currency)} off` }) : null]),
            el('span', { className: 'sl-c-pay' }, [badge(o.payment, PAYMENT[o.payment] || o.payment), o.paidWith ? el('small', { textContent: o.paidWith }) : null]),
            el('span', {}, [done(o) ? badge(o.fulfilment, stageName[o.fulfilment]) : el('small', { className: 'sl-dim', textContent: '—' })]),
          ], () => { state.open = o.id; draw() }, [look, iconBtn('info', 'Customer details', () => { state.modal = { kind: 'customer', key: keyOf(o) }; draw() }), iconBtn('trash', `Delete order #${o.number}`, () => askOrder(o))]), showing ? piecesPanel(o) : null]
        }),
      ]) : (state.loaded && !state.problem ? el('div', { className: 'sl-empty' }, [el('strong', { textContent: state.orders.length ? 'No orders match' : 'No orders yet' }), el('p', { textContent: state.orders.length ? 'Try another chip, period or search.' : 'Purchases made through the shop show up here.' })]) : null),
      pager(list, f, ['order', 'orders']),
    ]
  }

  /* What was bought, piece by piece: its picture, size, type, signed or not, how many, and a way
     into the piece itself. The details come from the site's content, matched by the line's name. */
  const tag = (k, v) => (v === '' || v == null ? null : el('span', { className: 'sl-tag' }, [el('small', { textContent: k }), String(v)]))
  const piecesPanel = (o) => el('div', { className: 'sl-pieces' }, o.items.map((i) => el('div', { className: 'sl-piece' }, [
    i.src ? el('img', { src: i.src, alt: '', loading: 'lazy' }) : el('span', { className: 'sl-piece-ph' }),
    el('div', { className: 'sl-piece-info' }, [
      el('strong', { textContent: i.title || i.name }),
      el('div', { className: 'sl-tags' }, [
        tag('Size', i.size || (i.slug ? 'Standard' : '')),
        tag('Type', i.type),
        tag('Signed', i.signed == null ? '' : i.signed ? 'Yes' : 'No'),
        tag('Qty', i.qty),
        tag('Universe', i.universe),
        tag('Category', i.category),
      ]),
      el('div', { className: 'sl-piece-foot' }, [
        i.total != null ? el('b', { textContent: money(i.total, o.currency) }) : null,
        i.slug && !i.gone ? el('a', { className: 'sl-link', href: `#/collections/shop/entries/${i.slug}`, textContent: 'Open the piece' }) : el('small', { className: 'sl-dim', textContent: i.gone ? 'Taken off the site since' : 'Not a piece on the site any more' }),
      ]),
    ]),
  ])))

  // the panel of one order
  const orderPanel = (o) => {
    const close = () => { state.open = null; state.saved = null; draw() }
    let stage = o.fulfilment
    const stages = el('div', { className: 'sl-stages', role: 'radiogroup', ariaLabel: 'Status' }, STAGES.map(([k, t]) => {
      const b = el('button', { type: 'button', className: `sl-stage is-${k} ${k === stage ? 'on' : ''}`, role: 'radio', ariaChecked: String(k === stage), textContent: t })
      // a new stage is saved at once (with the tracking number and note as they are), so the buyer sees it
      b.addEventListener('click', () => { if (busy || k === stage) return; stage = k; stages.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)) }); store() })
      return b
    }))
    const tracking = el('input', { className: 'sl-input', value: o.tracking, placeholder: 'For example CTT RR123456789PT', maxLength: 200 })
    const note = el('textarea', { className: 'sl-input', value: o.note, placeholder: 'Only you see this', maxLength: 480, rows: 3 })
    const save = el('button', { type: 'button', className: 'ia-btn', textContent: 'Save', disabled: true })
    const said = el('span', { className: 'sl-said', textContent: state.saved === o.id ? 'Saved ✓' : '' })
    state.saved = null
    const dirty = () => { save.disabled = stage === o.fulfilment && tracking.value === o.tracking && note.value === o.note; said.textContent = '' }
    tracking.addEventListener('input', dirty); note.addEventListener('input', dirty)
    let busy = false
    const store = async () => {
      busy = true; save.disabled = true; said.textContent = 'Saving…'
      const r = await api('POST', { id: o.id, paymentIntent: o.paymentIntent, fulfilment: stage, tracking: tracking.value.trim(), note: note.value.trim() })
      busy = false
      if (r.ok) { Object.assign(o, { fulfilment: stage, tracking: tracking.value.trim(), note: note.value.trim() }); state.saved = o.id; draw() }
      else { said.textContent = r.json.message || 'Not saved. Try again.'; save.disabled = false }
    }
    save.addEventListener('click', store)
    const block = (title, kids) => el('section', { className: 'sl-block' }, [el('h3', { textContent: title }), ...kids])
    const panel = el('aside', { className: 'sl-panel', role: 'dialog', ariaModal: 'true', ariaLabel: `Order #${o.number}` }, [
      el('header', { className: 'sl-panel-head' }, [
        el('div', {}, [el('div', { className: 'ia-kicker', textContent: date(o.created, true) }), el('h2', { textContent: `Order #${o.number}` }), el('div', { className: 'sl-badges' }, [badge(o.payment, PAYMENT[o.payment] || o.payment), done(o) ? badge(o.fulfilment, stageName[o.fulfilment]) : null])]),
        button('×', close, 'sl-x'),
      ]),
      el('div', { className: 'sl-panel-body' }, [
        done(o) && (o.paymentIntent || o.provider === 'paypal' || o.free) ? block('Where it is up to', [stages, el('label', { className: 'sl-label' }, [el('span', { textContent: 'Tracking number' }), tracking]), el('label', { className: 'sl-label' }, [el('span', { textContent: 'Note' }), note]), el('div', { className: 'sl-save' }, [save, said])]) : null,
        block('Pieces', [
          el('ul', { className: 'sl-items' }, o.items.map((i) => el('li', {}, [el('span', { textContent: i.name }), el('small', { textContent: `× ${i.qty}` }), el('strong', { textContent: money(i.total, o.currency) })]))),
          o.discount ? el('div', { className: 'sl-sum is-refund' }, [el('span', { textContent: `Discount${o.discountCode ? ` · ${o.discountCode}` : ''}` }), el('strong', { textContent: `− ${money(o.discount, o.currency)}` })]) : null,
          el('div', { className: 'sl-sum' }, [el('span', { textContent: 'Total' }), el('strong', { textContent: money(o.total, o.currency) })]),
          o.paidWith ? el('div', { className: 'sl-sum is-method' }, [el('span', { textContent: 'Paid with' }), el('strong', { textContent: o.paidWith })]) : null,
          o.refunded ? el('div', { className: 'sl-sum is-refund' }, [el('span', { textContent: 'Refunded' }), el('strong', { textContent: `− ${money(o.refunded, o.currency)}` })]) : null,
        ]),
        block('Customer', [
          el('p', { className: 'sl-who' }, [el('strong', { textContent: o.name || '—' }), o.email ? el('span', { className: 'sl-mail' }, [el('span', { textContent: o.email }), copyBtn(o.email, 'email')]) : null, o.phone ? el('span', { textContent: o.phone }) : null]),
          o.email ? button('All orders from this customer', () => { state.open = null; location.hash = `#/sales/orders?customer=${encodeURIComponent(o.email)}` }, 'sl-link') : null,
        ]),
        o.shipTo.length ? block('Ship to', [el('p', { className: 'sl-address' }, [o.name, ...o.shipTo.slice(0, -1), country(o.shipTo[o.shipTo.length - 1])].filter(Boolean).flatMap((line, i) => (i ? [el('br'), line] : [line])))]) : null,
        block('Payment', [o.stripe ? el('a', { className: 'ia-btn ghost', href: o.stripe, target: '_blank', rel: 'noopener', textContent: o.provider === 'paypal' ? 'Open in PayPal ↗' : 'Open in Stripe ↗' }) : null, el('p', { className: 'sl-dim', textContent: o.provider === 'paypal' ? 'Paid with PayPal. Refunds are done in PayPal.' : 'Refunds and receipts are done in Stripe.' })]),
      ]),
    ])
    const shade = el('div', { className: 'sl-shade' })
    shade.addEventListener('click', close)
    return [shade, panel]
  }


  // ---------- Members and gifts ----------
  /* The site's member accounts (api/account.js), and the rewards the admin gives them as gifts.
     A gift is theirs at once, whatever their progress, and they can be emailed about it. A
     discount gift gets its own code when they next open Rewards. */
  const mState = { loaded: false, loading: false, list: [], rewards: [], problem: '' }
  const mApi = async (body) => {
    try {
      const r = await fetch('/api/account', { method: 'POST', cache: 'no-store', headers: { Authorization: `token ${pass()}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) }
    } catch { return { ok: false, status: 0, json: { message: 'Could not reach the site. Check the connection and try again.' } } }
  }
  const loadMembers = async () => {
    mState.loading = true
    const r = await mApi({ action: 'adminMembers' })
    mState.loading = false; mState.loaded = true
    if (r.ok) { mState.list = (r.json.members || []).map((m) => ({ ...m, gifts: m.gifts || [], newGifts: m.newGifts || [] })); mState.rewards = r.json.rewards || []; mState.problem = '' }
    else mState.problem = r.status === 503 || r.status === 403 ? 'Member accounts are not set up on this site, so there is nobody to give a gift to.' : (r.json.message || 'The members could not be loaded.')
    draw()
  }
  const memberOf = (email) => { const e = String(email || '').toLowerCase(); return e ? mState.list.find((m) => String(m.email).toLowerCase() === e) : undefined }
  const rewardOf = (id) => mState.rewards.find((r) => r.id === id)
  const KIND_NAME = { picture: 'Profile picture', card: 'Card design', discount: 'Discount' }
  const memberNo = (n) => (n ? `#${String(n).padStart(4, '0')}` : '')
  // a member's answer from the server replaces what is held, so every screen sees it
  const keepMember = (mem, fresh) => { if (fresh && fresh.email) Object.assign(mem, fresh, { gifts: fresh.gifts || [], newGifts: fresh.newGifts || [] }) }

  /* A picture shown the way the account crops it: "x,y,zoom" in percent. */
  const faceStyle = (face) => {
    const [x, y, z] = String(face || '').split(',').map((n) => (n.trim() === '' ? NaN : Number(n)))
    const fx = Number.isFinite(x) ? x : 50, fy = Number.isFinite(y) ? y : 22, zoom = Number.isFinite(z) && z >= 100 ? z : 100
    return `object-position:${fx}% ${fy}%;transform:scale(${zoom / 100});transform-origin:${fx}% ${fy}%`
  }
  // a customer's picture from their account, or their initials
  const avatar = (p, size = '') => {
    const pic = p.member && p.member.picture && p.member.picture.src ? p.member.picture : null
    return el('i', { className: `sl-initials ${pic ? 'has-pic' : ''} ${size ? `is-${size}` : ''}`, ariaHidden: 'true' }, [
      pic ? el('img', { src: pic.src, alt: '', loading: 'lazy', style: faceStyle(pic.face) }) : initials(p.name || p.email),
    ])
  }
  // a reward, small: the picture as cropped, a mini card in its look, or the percentage
  const rewardThumb = (r) => {
    if (r.kind === 'picture' && r.picture) return el('span', { className: 'sl-rthumb is-pic' }, [el('img', { src: r.picture, alt: '', loading: 'lazy', style: faceStyle(r.face) })])
    if (r.kind === 'card') {
      const art = r.cardArt && (r.cardLook === 'art' || !r.cardLook)
      const t = el('span', { className: `sl-rthumb is-design is-${r.cardLook || 'ink'} ${art ? 'has-art' : ''}` })
      if (art) {
        // placed and zoomed as set under the design: "x,y,zoom" in percent
        const [x, y, z] = String(r.cardCrop || '').split(',').map((n) => (n.trim() === '' ? NaN : Number(n)))
        t.style.setProperty('--card-art', `url("${r.cardArt}")`)
        t.style.setProperty('--art-x', `${Number.isFinite(x) ? x : 50}%`)
        t.style.setProperty('--art-y', `${Number.isFinite(y) ? y : 25}%`)
        t.style.setProperty('--art-zoom', String(Number.isFinite(z) && z >= 100 ? z / 100 : 1))
      }
      return t
    }
    return el('span', { className: 'sl-rthumb is-off', textContent: `${r.percent || '?'}%` })
  }

  const askUngift = (mem, r, back) => ask({
    title: `Take back "${r ? r.name : 'this reward'}"?`,
    text: `${mem.name || mem.email}${memberNo(mem.memberNo) ? ` · member ${memberNo(mem.memberNo)}` : ''}`,
    more: 'It leaves their account (unless they have earned it on their own since). A discount code already made for them keeps working until it runs out.',
    yes: 'Take it back',
    back,
    run: async () => {
      const res = await mApi({ action: 'adminUngift', email: mem.email, reward: r.id })
      if (!res.ok) return res.json.message || 'Not taken back. Try again.'
      if (res.json.member) keepMember(mem, res.json.member)
      else { mem.gifts = mem.gifts.filter((x) => x.id !== r.id); mem.newGifts = mem.newGifts.filter((x) => x !== r.id) }
      if (back) { back.said = `"${r.name}" taken back`; back.bad = false }
      return ''
    },
  })
  // what the gift did, in a line
  const giftSaid = (rw, mem, tell, json) => `"${rw ? rw.name : 'The reward'}" gifted to ${mem.name || mem.email}${tell ? (json.mailed ? ' · they have been emailed' : ' · the email could not be sent, so tell them yourself') : ''}${rw && rw.kind === 'discount' ? ' · its code is made when they open Rewards' : ''}`
  const giveGift = async (m, mem, rw) => {
    m.busy = true; m.said = ''; draw()
    const r = await mApi({ action: 'adminGift', email: mem.email, reward: rw.id, note: (m.note || '').trim(), tell: m.tell !== false })
    m.busy = false
    if (!r.ok) { m.said = r.json.message || 'The gift was not given. Try again.'; m.bad = true; return draw() }
    if (r.json.member) keepMember(mem, r.json.member)
    else mem.gifts = [...mem.gifts, { id: rw.id, at: Date.now(), note: m.note || '' }]
    m.said = giftSaid(rw, mem, m.tell !== false, r.json)
    m.bad = m.tell !== false && !r.json.mailed
    m.reward = ''; m.chosen = ''; m.note = ''; m.picking = false
    draw()
  }

  /* The rewards in a customer's window: what they have been gifted (× takes one back), and
     "+ Gift a reward", which opens the rewards not yet theirs as tiles, a note and Gift it. */
  const giftsFor = (m, email) => {
    if (!mState.loaded) return el('p', { className: 'sl-dim', textContent: 'Loading their account…' })
    if (mState.problem) return el('p', { className: 'sl-dim', textContent: mState.problem })
    const mem = memberOf(email)
    if (!mem) return el('p', { className: 'sl-dim', textContent: 'No account on the site with this email, so nothing can be gifted. Rewards go to members.' })
    if (m.tell === undefined) m.tell = true
    const has = new Set(mem.gifts.map((g) => g.id))
    const unseen = new Set(mem.newGifts || [])
    const gifted = mem.gifts.map((g) => ({ g, r: rewardOf(g.id) }))
    const open = mState.rewards.filter((r) => !has.has(r.id))
    const chips = gifted.length
      ? el('div', { className: 'sl-gift-chips' }, gifted.map(({ g, r }) => {
        const rw = r || { id: g.id, name: g.id, kind: 'discount' }
        const x = el('button', { type: 'button', className: 'sl-gift-x', ariaLabel: `Take back ${rw.name}`, title: 'Take back', disabled: Boolean(m.busy), textContent: '×' })
        x.addEventListener('click', () => askUngift(mem, rw, m))
        return el('span', { className: `sl-gift-chip ${unseen.has(g.id) ? 'is-unseen' : ''}`, title: `${KIND_NAME[rw.kind] || 'Reward'} · gifted ${g.at ? date(g.at) : ''}${g.note ? ` · "${g.note}"` : ''}${unseen.has(g.id) ? ' · not seen by them yet' : ''}` }, [rewardThumb(rw), el('span', { textContent: rw.name }), x])
      }))
      : el('p', { className: 'sl-dim', textContent: 'Nothing gifted yet.' })
    const kids = [chips]
    if (m.picking) {
      const tiles = open.length ? el('div', { className: 'sl-rpick', role: 'radiogroup', ariaLabel: 'Reward to gift' }, open.map((r) => {
        const t = el('button', { type: 'button', role: 'radio', ariaChecked: String(m.chosen === r.id), className: `sl-rtile ${m.chosen === r.id ? 'on' : ''}` }, [rewardThumb(r), el('strong', { textContent: r.name }), el('small', { textContent: r.kind === 'discount' ? `${r.percent}% off${r.days ? ` · ${r.days} days` : ''}` : KIND_NAME[r.kind] })])
        t.addEventListener('click', () => { m.chosen = r.id; m.said = ''; draw() })
        return t
      })) : el('p', { className: 'sl-dim', textContent: 'There are no rewards to give yet. Add them under Members → Rewards.' })
      const note = el('textarea', { className: 'sl-input', rows: 2, maxLength: 300, placeholder: 'A line from you, in the email (optional)', value: m.note || '' })
      note.addEventListener('input', () => { m.note = note.value })
      const tell = el('input', { type: 'checkbox', checked: m.tell !== false })
      tell.addEventListener('change', () => { m.tell = tell.checked })
      const cancel = button('Cancel', () => { m.picking = false; m.chosen = ''; draw() }, 'ia-btn ghost')
      cancel.disabled = Boolean(m.busy)
      const give = button(m.busy ? 'Gifting…' : 'Gift it', () => { const rw = rewardOf(m.chosen); if (rw) giveGift(m, mem, rw) }, 'ia-btn')
      give.disabled = Boolean(m.busy) || !m.chosen
      kids.push(el('div', { className: 'sl-gift-picker' }, [
        tiles,
        el('label', { className: 'sl-field sl-gift-notefield' }, [el('span', { textContent: 'Your note' }), note]),
        el('div', { className: 'sl-gift-foot' }, [el('label', { className: 'sl-gift-tell' }, [tell, el('span', { textContent: 'Email them about it' })]), el('span', { className: 'sl-gift-grow' }), cancel, give]),
      ]))
    } else {
      const add = button(open.length ? '+ Gift a reward' : 'Every reward gifted', () => { m.picking = true; m.chosen = ''; m.said = ''; draw() }, 'ia-btn ghost sl-gift-add')
      add.disabled = Boolean(m.busy) || !open.length
      kids.push(add)
    }
    if (m.said) kids.push(el('p', { className: `sl-gift-note ${m.bad ? 'is-bad' : ''}`, role: 'status', textContent: m.said }))
    return el('div', { className: 'sl-gifts' }, kids)
  }

  // the gift window (Customers → Gift a reward): any member, which reward, a note, and Send
  const giftModal = (m) => {
    const said = el('p', { className: `sl-said ${m.bad ? 'is-bad' : ''}`, textContent: m.said || '' })
    if (!mState.loaded) return [el('div', { className: 'sl-modal-head' }, [el('div', { className: 'ia-kicker', textContent: 'Gift a reward' }), el('h2', { textContent: 'Loading the members…' })])]
    if (mState.problem) return [
      el('div', { className: 'sl-modal-head' }, [el('div', { className: 'ia-kicker', textContent: 'Gift a reward' }), el('h2', { textContent: 'Not possible here' })]),
      el('div', { className: 'sl-modal-body' }, [el('p', { textContent: mState.problem })]),
      el('div', { className: 'sl-modal-foot' }, [button('Close', closeModal, 'ia-btn')]),
    ]
    if (m.tell === undefined) m.tell = true
    const member = memberOf(m.email)
    const has = new Set(member ? member.gifts.map((g) => g.id) : [])
    const pick = el('select', { className: 'sl-select', ariaLabel: 'Member' }, [el('option', { value: '', textContent: mState.list.length ? 'Choose a member…' : 'No members yet' }), ...[...mState.list].sort((a, b) => (a.memberNo || 0) - (b.memberNo || 0)).map((x) => el('option', { value: x.email, selected: x.email === m.email, textContent: `${memberNo(x.memberNo)}  ${x.name || '(no name)'} · ${x.email}` }))])
    pick.addEventListener('change', () => { m.email = pick.value; m.reward = ''; m.said = ''; draw() })
    const who = el('label', { className: 'sl-field' }, [el('span', { textContent: 'Member' }), pick])
    const whoCard = member ? el('div', { className: 'sl-gift-who' }, [avatar({ name: member.name, email: member.email, member }), el('span', {}, [el('strong', { textContent: member.name || member.email }), el('small', { textContent: `${memberNo(member.memberNo)} · ${member.email}` })])]) : null
    // which reward: a tile for each, its thumbnail, kind and name
    const tiles = mState.rewards.length ? el('div', { className: 'sl-gift-grid', role: 'radiogroup', ariaLabel: 'Reward' }, mState.rewards.map((r) => {
      const given = has.has(r.id)
      const b = el('button', { type: 'button', className: `sl-gift is-${r.kind === 'card' ? 'design' : r.kind} ${m.reward === r.id ? 'on' : ''}`, role: 'radio', ariaChecked: String(m.reward === r.id), disabled: given || !member }, [
        rewardThumb(r),
        el('span', {}, [el('small', { textContent: given ? 'Already given' : KIND_NAME[r.kind] }), el('strong', { textContent: r.name })]),
      ])
      b.addEventListener('click', () => { m.reward = r.id; m.said = ''; draw() })
      return b
    })) : el('p', { className: 'sl-dim', textContent: 'There are no rewards to give yet. Add them under Members → Rewards.' })
    const note = el('textarea', { className: 'sl-input', rows: 3, maxLength: 300, placeholder: 'A line from you, in the email (optional). E.g. "Thank you for the kind words at the convention."', value: m.note || '' })
    note.addEventListener('input', () => { m.note = note.value })
    const tell = el('input', { type: 'checkbox', checked: m.tell !== false })
    tell.addEventListener('change', () => { m.tell = tell.checked })
    const send = button(m.busy ? 'Sending…' : 'Gift it', async () => {
      if (!member) { m.said = 'Choose a member first.'; m.bad = true; return draw() }
      const rw = rewardOf(m.reward)
      if (!rw) { m.said = 'Choose a reward to give.'; m.bad = true; return draw() }
      giveGift(m, member, rw)
    }, 'ia-btn')
    send.disabled = Boolean(m.busy)
    return [
      el('div', { className: 'sl-modal-head' }, [el('div', { className: 'ia-kicker', textContent: 'Gift a reward' }), el('h2', { textContent: 'Give a member a reward' })]),
      el('div', { className: 'sl-modal-body sl-gift-body' }, [
        who,
        whoCard,
        el('div', { className: 'sl-field' }, [el('span', { textContent: 'Reward' }), tiles]),
        el('label', { className: 'sl-field' }, [el('span', { textContent: 'Your note' }), note]),
        el('label', { className: 'sl-gift-tell' }, [tell, el('span', { textContent: 'Email them about it' })]),
        el('p', { className: 'sl-hint', textContent: 'It is theirs at once, whatever they have bought. A discount gets its own code, for their email only, when they next open Rewards.' }),
        said,
      ]),
      el('div', { className: 'sl-modal-foot' }, [button('Close', closeModal, 'ia-btn ghost'), send]),
    ]
  }

  // ---------- Customers ----------
  /* Everyone who has bought (by email, or by name when there is none), and everyone with an
     account on the site, who may not have bought yet. */
  const customers = () => {
    const by = new Map()
    for (const o of visible(state.orders, 'customers').filter(done)) {
      const key = (o.email || o.name || o.id).toLowerCase()
      const c = by.get(key) || { key, email: o.email, name: '', country: '', orders: 0, spent: 0, first: o.created, last: 0, waiting: 0, currency: o.currency }
      c.orders++; c.spent += kept(o)
      if (o.created >= c.last) { c.last = o.created; c.name = o.name || c.name; c.country = o.country || c.country }
      c.first = Math.min(c.first, o.created)
      if (ORDER_CHIPS[1][2](o)) c.waiting++
      by.set(key, c)
    }
    for (const c of by.values()) c.member = c.email ? memberOf(c.email) || null : null
    for (const m of mState.list) {
      const key = String(m.email || '').toLowerCase()
      if (!key) continue
      const joined = new Date(m.createdAt).getTime() || 0
      const c = by.get(key)
      if (c) { c.joined = joined; c.name = c.name || m.name; continue }
      by.set(key, { key, email: m.email, name: m.name || '', country: '', orders: 0, spent: 0, first: joined, last: joined, waiting: 0, currency: currency(), member: m, joined })
    }
    return [...by.values()]
  }
  const customersView = () => {
    const f = state.c
    const all = customers()
    const kinds = [
      ['all', 'Everyone', () => true],
      ['members', 'Members', (c) => Boolean(c.member)],
      ['buyers', 'Buyers', (c) => c.orders > 0],
      ['repeat', 'Bought more than once', (c) => c.orders > 1],
      ['waiting', 'Waiting for an order', (c) => c.waiting > 0],
    ]
    const kind = kinds.find((k) => k[0] === f.kind) || kinds[0]
    const q = f.q.trim().toLowerCase()
    const sorts = { spent: (a, b) => b.spent - a.spent || b.last - a.last, orders: (a, b) => b.orders - a.orders || b.spent - a.spent, last: (a, b) => b.last - a.last, name: (a, b) => (a.name || a.email).localeCompare(b.name || b.email), member: (a, b) => ((a.member && a.member.memberNo) || 9e9) - ((b.member && b.member.memberNo) || 9e9) }
    const list = all.filter((c) => kind[2](c) && (!q || [c.name, c.email, country(c.country), c.member ? memberNo(c.member.memberNo) : ''].join(' ').toLowerCase().includes(q))).sort(sorts[f.sort] || sorts.spent)
    const set = (k, v) => { state.c[k] = v; state.c.page = 1; draw() }
    const cur = currency()
    const buyers = all.filter((c) => c.orders > 0)
    const total = buyers.reduce((t, c) => t + c.spent, 0)
    const open = (c) => { state.modal = { kind: 'customer', key: c.key }; draw() }
    return [
      head('Customers', 'Everyone who has bought from the shop, and everyone with an account on the site. Open one to see their orders and codes, give them a discount, or gift them a reward.', [
        button('Gift a reward', () => { state.modal = { kind: 'gift', email: '' }; draw() }, 'ia-btn'),
        button(state.loading || mState.loading ? 'Loading…' : 'Refresh', () => { load(); loadMembers(); loadDiscounts() }),
        button('Export CSV', () => csv([['Name', 'Email', 'Member', 'Email confirmed', 'Country', 'Orders', 'Spent', 'Currency', 'First order', 'Last order'], ...list.map((c) => [c.name, c.email, c.member ? memberNo(c.member.memberNo) : '', c.member ? (c.member.verified ? 'Yes' : 'No') : '', country(c.country), c.orders, c.spent, c.currency, c.orders ? date(c.first) : '', c.orders ? date(c.last) : ''])], `customers-${new Date().toISOString().slice(0, 10)}.csv`)),
      ]),
      notices(),
      hiddenNote(state.orders, 'customers\' orders', 'customers'),
      mState.problem && mState.loaded ? el('div', { className: 'sl-notice' }, [el('strong', { textContent: 'Accounts not shown' }), el('p', { textContent: mState.problem })]) : null,
      el('div', { className: 'sl-stats' }, [
        stat('Customers', String(all.length), mState.loaded && !mState.problem ? many(all.filter((c) => c.member).length, 'member') : ''),
        stat('Came back', String(all.filter((c) => c.orders > 1).length), 'bought more than once'),
        stat('Spent on average', money(buyers.length ? total / buyers.length : 0, cur), many(buyers.length, 'buyer')),
        stat('Waiting for an order', String(all.filter((c) => c.waiting).length)),
      ]),
      el('div', { className: 'sl-chips', role: 'group', ariaLabel: 'Show' }, kinds.map(([k, label, test]) => {
        const b = el('button', { type: 'button', className: `sl-chip ${f.kind === k ? 'on' : ''}`, ariaPressed: String(f.kind === k) }, [label, el('small', { textContent: String(all.filter(test).length) })])
        b.addEventListener('click', () => set('kind', k))
        return b
      })),
      el('div', { className: 'sl-tools' }, [
        search(f.q, 'Name, email, country, member no.…', (v) => set('q', v)),
        select(f.sort, [['spent', 'Most spent'], ['orders', 'Most orders'], ['last', 'Latest'], ['name', 'Name A–Z'], ['member', 'Member number']], (v) => set('sort', v), 'Sort'),
      ]),
      el('p', { className: 'sl-count', textContent: `${list.length} ${list.length === 1 ? 'customer' : 'customers'}` }),
      list.length ? el('div', { className: 'sl-table is-customers', role: 'table' }, [
        headRow(['Customer', 'Country', 'Orders', 'Spent', 'Last order']),
        ...pageOf(list, f).map((c) => {
          const theirs = c.orders || codesOf(c.email).length
          return rowEl(false, [
            el('span', { className: 'sl-c-who' }, [avatar(c), el('span', {}, [
              el('strong', { textContent: c.name || c.email || '—' }),
              el('small', { textContent: c.name ? c.email : '' }),
              c.member ? badge('member', `Member ${memberNo(c.member.memberNo)}`) : null,
            ])]),
            el('span', {}, [el('small', { textContent: country(c.country) || '—' })]),
            el('span', {}, [el('strong', { textContent: String(c.orders) }), c.waiting ? el('small', { className: 'sl-hot', textContent: `${c.waiting} to ship` }) : null]),
            el('span', { className: 'sl-c-total' }, [el('strong', { textContent: money(c.spent, c.currency) })]),
            el('span', {}, [el('small', { textContent: c.orders ? date(c.last) : c.joined ? `Joined ${date(c.joined)}` : '—' })]),
          ], () => open(c), [
            iconBtn('info', 'Customer details', () => open(c)),
            theirs ? iconBtn('trash', `Delete ${c.name || c.email}`, () => askCustomer(c)) : el('span', { className: 'sl-icon-gap' }),
          ])
        }),
      ]) : (state.loaded && !state.problem ? el('div', { className: 'sl-empty' }, [el('strong', { textContent: all.length ? 'Nobody matches' : 'No customers yet' }), el('p', { textContent: all.length ? 'Try another chip or search.' : 'Everyone who buys from the shop, or makes an account, shows up here.' })]) : null),
      pager(list, f, ['customer', 'customers']),
    ]
  }

  // ---------- Discounts ----------
  /* Discount codes, kept in Stripe (api/discounts.js): a percentage off, for a while, either a
     code each for chosen customers or one shared code for anyone given it. Buyers type it in
     the cart. Codes are made, emailed, switched off and deleted; they are not edited. */
  const DVIEWS = [['active', 'Active'], ['usedup', 'Used up'], ['ended', 'Ended'], ['off', 'Switched off'], ['all', 'All']]
  const DSORTS = [['new', 'Newest first'], ['ending', 'Ending soonest'], ['big', 'Biggest discount'], ['used', 'Most used']]
  const LENGTHS = [['7', '1 week'], ['14', '2 weeks'], ['30', '1 month'], ['90', '3 months'], ['180', '6 months'], ['date', 'Until a date…'], ['none', 'No end date']]
  const USES = [['1', 'Once'], ['3', '3 times'], ['10', '10 times'], ['', 'No limit']]
  const PERCENTS = [5, 10, 15, 20, 25, 30, 50]
  const dState = { loaded: false, loading: false, list: [], mode: '', problem: null, q: '', view: 'active', sort: 'new', page: 1, per: perSaved(), busy: false, result: null, note: null }
  const draft = { percent: 10, other: '', length: '30', date: '', mode: 'people', picked: new Set(), emails: '', code: '', uses: '1', usesTouched: false, label: '', find: '' }
  const now = () => Math.floor(Date.now() / 1000)
  const statusOf = (d) => (!d.active ? ['off', 'Switched off'] : d.until && d.until < now() ? ['ended', 'Ended'] : d.uses && d.used >= d.uses ? ['usedup', 'Used up'] : ['active', 'Active'])
  const codesOf = (email) => { const e = String(email || '').toLowerCase(); return e ? dState.list.filter((d) => d.email && d.email.toLowerCase() === e) : [] }
  const dApi = async (method, body) => {
    try {
      const r = await fetch('/api/discounts', { method, cache: 'no-store', headers: { Authorization: `token ${pass()}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) }
    } catch { return { ok: false, status: 0, json: { message: 'Could not reach the site. Check the connection and try again.' } } }
  }
  let discGen = 0 // a newer load makes an older one's answer stale
  const loadDiscounts = async () => {
    const gen = ++discGen
    dState.loading = true; draw()
    const r = await dApi('GET')
    if (gen !== discGen) return
    dState.loading = false
    if (r.ok) { dState.list = (r.json.discounts || []).sort((a, b) => b.created - a.created); dState.mode = r.json.mode || ''; dState.problem = null; dState.loaded = true }
    else dState.problem = { setup: r.status === 503 || Boolean(r.json.setup), status: r.status, message: r.json.message || 'The discount codes could not be loaded.' }
    draw()
  }
  // the last moment it works, in seconds: null for no end, undefined while the date is not picked
  const endOf = () => {
    if (draft.length === 'none') return null
    if (draft.length === 'date') return draft.date ? Math.floor(new Date(`${draft.date}T23:59:00`).getTime() / 1000) : undefined
    return now() + Number(draft.length) * 86400
  }
  const typedEmails = () => [...new Set(draft.emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))]
  // the people chosen: ticked customers with an email, and any typed addresses
  const chosen = () => {
    const byKey = new Map(customers().map((c) => [c.key, c]))
    const list = [...draft.picked].map((k) => byKey.get(k)).filter((c) => c && c.email).map((c) => ({ email: c.email.toLowerCase(), name: c.name || '' }))
    for (const e of typedEmails()) if (!list.some((p) => p.email === e)) list.push({ email: e, name: '' })
    return list
  }
  // from a customer: the new-discount form with them chosen
  const discountFor = (keys, email, name) => {
    draft.mode = 'people'; draft.picked = new Set(keys); draft.find = ''
    if (email && !customers().some((c) => keys.includes(c.key) && c.email)) draft.emails = email
    if (!draft.usesTouched) draft.uses = '1'
    dState.result = null; dState.note = null
    state.modal = null
    if (state.view === 'discounts') { draw(); root.scrollTop = 0 } else location.hash = '#/sales/discounts'
  }
  const copyBtn = (text, what, cls = 'sl-link') => {
    const b = button(`Copy ${what}`, async () => {
      try { await navigator.clipboard.writeText(text); b.textContent = 'Copied' } catch { b.textContent = 'Could not copy' }
      setTimeout(() => { b.textContent = `Copy ${what}` }, 1600)
    }, cls)
    return b
  }
  const sentOn = (d) => (d.sent ? date(d.sent) : '')
  // send a personal code to its person by email, from the site, after asking
  const emailCode = (d) => ask({
    title: `Email ${d.code}?`,
    text: `To ${d.name ? `${d.name} (${d.email})` : d.email}: ${d.percent}% off${d.until ? `, until ${date(d.until * 1000)}` : ''}.`,
    more: `They get an email from Milton Aguiar with the code and how to use it in the cart. Its button, See your gift, opens the Rewards tab of their account (they log in first, or make an account with this email), where the code waits for them.${d.sent ? ` It was last emailed ${sentOn(d)}.` : ''}`,
    yes: 'Send it',
    plain: true,
    run: async () => {
      const r = await dApi('POST', { action: 'email', id: d.id })
      if (!r.ok) return r.json.message || 'Not sent. Try again.'
      const sent = (r.json.discount && r.json.discount.sent) || new Date().toISOString()
      for (const x of [...dState.list, ...(dState.result || [])]) if (x.id === d.id) x.sent = sent
      return ''
    },
  })
  const emailBtn = (d) => { const b = button(d.sent ? 'Email again' : 'Email it', () => emailCode(d), 'sl-link'); b.title = d.sent ? `Emailed ${sentOn(d)}` : 'Send it to them by email'; return b }
  const askStop = (d) => ask({
    title: `Switch off ${d.code}?`,
    text: `${d.percent}% off · ${d.email || 'anyone with the code'} · used ${d.used}${d.uses ? ` of ${d.uses}` : ' times'}`,
    more: 'It stops working at once and cannot be switched back on. It stays in this list, marked Switched off.',
    yes: 'Switch off',
    run: async () => {
      const r = await dApi('POST', { action: 'stop', id: d.id })
      if (!r.ok || !r.json.discount) return r.json.message || 'Stripe did not switch it off. Try again.'
      for (const x of [...dState.list, ...(dState.result || [])]) if (x.id === d.id) Object.assign(x, r.json.discount)
      return ''
    },
  })
  // deletes codes, a hundred at a time; says what went wrong, or nothing
  const dropCodes = async (codes) => {
    if (!codes.length) return ''
    const ids = codes.map((d) => d.id)
    const gone = new Set()
    let problem = ''
    for (let i = 0; i < ids.length; i += 100) {
      const r = await dApi('POST', { action: 'delete', ids: ids.slice(i, i + 100) })
      if (!r.ok) problem = r.json.message || ''
      ;(r.json.deleted || []).forEach((id) => gone.add(id))
    }
    dState.list = dState.list.filter((d) => !gone.has(d.id))
    if (dState.result) dState.result = dState.result.filter((d) => !gone.has(d.id))
    return gone.size < ids.length ? (problem || `${ids.length - gone.size} could not be deleted. Try again in a moment.`) : ''
  }
  const askDelete = (d) => ask({
    title: `Delete ${d.code}?`,
    text: `${d.percent}% off · ${d.email || 'anyone with the code'} · used ${d.used} ${d.used === 1 ? 'time' : 'times'}`,
    more: 'It stops working at once and leaves this list for good. Orders that already used it keep their discount.',
    yes: 'Delete code',
    run: () => dropCodes([d]),
  })

  const makeDiscount = async () => {
    const percent = Number(draft.percent)
    const until = endOf()
    const fail = (t) => { dState.note = { ok: false, text: t }; draw() }
    if (!(percent >= 1 && percent <= 100)) return fail('Choose how much off: between 1% and 100%.')
    if (until === undefined) return fail('Pick the last day the discount works.')
    const people = draft.mode === 'people' ? chosen() : []
    if (draft.mode === 'people' && !people.length) return fail('Choose at least one customer, or type an email address.')
    const bad = people.find((p) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))
    if (bad) return fail(`"${bad.email}" is not an email address.`)
    if (draft.mode === 'anyone' && draft.code.length < 3) return fail('Type the code: at least 3 letters or numbers.')
    dState.busy = true; dState.note = null; draw()
    const r = await dApi('POST', { action: 'create', percent, until, uses: draft.uses ? Number(draft.uses) : null, label: draft.label.trim(), ...(draft.mode === 'people' ? { people } : { code: draft.code }) })
    dState.busy = false
    if (r.ok && Array.isArray(r.json.discounts)) {
      const made = r.json.discounts
      dState.result = made
      dState.list = [...made, ...dState.list.filter((d) => !made.some((x) => x.id === d.id))]
      const failed = r.json.failed || []
      dState.note = failed.length ? { ok: false, text: `No code could be made for ${failed.join(', ')}.` } : { ok: true, text: made.length ? 'Done' : 'Nothing was made.' }
      if (made.length) { draft.picked.clear(); draft.emails = ''; draft.code = '' }
      draw()
      setTimeout(() => root.querySelector('.sl-made')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60)
    } else fail(r.json.message || 'Not made. Try again.')
  }

  const step = (n, title, kids) => el('div', { className: 'sl-step' }, [el('div', { className: 'sl-step-n', textContent: String(n) }), el('div', { className: 'sl-step-body' }, [el('h3', { textContent: title }), ...kids])])

  // the form for a new discount: four numbered steps, a sentence saying what it makes, Create
  const discountForm = () => {
    const sentence = el('p', { className: 'sl-sentence' })
    const sayIt = () => {
      const end = endOf()
      const n = chosen().length
      const whom = draft.mode === 'people' ? (n ? `for ${many(n, 'person', 'people')}, a code each` : 'for nobody yet') : `for anyone with ${draft.code || 'the code'}`
      const usesText = draft.uses ? `, ${draft.mode === 'people' ? 'each code ' : ''}used ${draft.uses === '1' ? 'once' : `up to ${draft.uses} times`}` : ', no limit on uses'
      sentence.replaceChildren(el('b', { textContent: `${draft.percent || '?'}% off` }), ` ${whom}, ${end === null ? 'with no end date' : end === undefined ? 'until the date you pick' : `until ${date(end * 1000)}`}${usesText}.`)
    }
    // 1. how much
    const pcts = el('div', { className: 'sl-chips is-tight' }, PERCENTS.map((p) => {
      const b = el('button', { type: 'button', className: `sl-chip ${!draft.other && draft.percent === p ? 'on' : ''}`, ariaPressed: String(!draft.other && draft.percent === p), textContent: `${p}%` })
      b.addEventListener('click', () => { draft.percent = p; draft.other = ''; draw() })
      return b
    }))
    const other = el('input', { type: 'number', className: 'sl-input sl-other', min: 1, max: 100, step: 1, value: draft.other, placeholder: 'Other %', ariaLabel: 'Another percentage' })
    other.addEventListener('input', () => { draft.other = other.value; draft.percent = Number(other.value) || 0; pcts.querySelectorAll('.sl-chip').forEach((c) => { c.classList.remove('on'); c.ariaPressed = 'false' }); sayIt() })
    // 2. how long
    const length = el('select', { className: 'sl-select sl-length', ariaLabel: 'How long it lasts' }, LENGTHS.map(([v, t]) => el('option', { value: v, textContent: t, selected: draft.length === v })))
    length.addEventListener('change', () => { draft.length = length.value; draw() })
    const day = el('input', { type: 'date', className: 'sl-input sl-day', value: draft.date, min: new Date(Date.now() + 864e5).toISOString().slice(0, 10), ariaLabel: 'Last day' })
    day.addEventListener('input', () => { draft.date = day.value; sayIt() })
    // 3. for whom
    const modes = el('div', { className: 'sl-seg is-two', role: 'radiogroup', ariaLabel: 'Who it is for' }, [['people', 'Chosen customers'], ['anyone', 'Anyone with the code']].map(([v, t]) => {
      const b = el('button', { type: 'button', role: 'radio', ariaChecked: String(draft.mode === v), className: `sl-stage ${draft.mode === v ? 'on' : ''}`, textContent: t })
      b.addEventListener('click', () => { draft.mode = v; if (!draft.usesTouched) draft.uses = v === 'people' ? '1' : ''; draw() })
      return b
    }))
    let whom
    if (draft.mode === 'people') {
      const all = customers().filter((c) => c.email)
      const q = draft.find.trim().toLowerCase()
      const list = all.filter((c) => !q || [c.name, c.email, c.member ? memberNo(c.member.memberNo) : ''].join(' ').toLowerCase().includes(q)).sort((a, b) => b.last - a.last)
      const count = el('span', { className: 'sl-chosen', textContent: `${chosen().length} chosen` })
      const find = el('input', { type: 'search', className: 'sl-search sl-find', value: draft.find, placeholder: 'Find a customer…', ariaLabel: 'Find a customer' })
      let t
      find.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { draft.find = find.value; draw() }, 160) })
      const allBtn = button('Choose all shown', () => { list.forEach((c) => draft.picked.add(c.key)); draw() }, 'sl-link')
      const noneBtn = button('Clear', () => { draft.picked.clear(); draw() }, 'sl-link')
      const box = el('div', { className: 'sl-picklist' }, list.length ? list.map((c) => {
        const input = el('input', { type: 'checkbox', checked: draft.picked.has(c.key) })
        const row = el('label', { className: `sl-pick-row ${draft.picked.has(c.key) ? 'on' : ''}` }, [input, avatar(c, 'sm'), el('span', { className: 'sl-pick-who' }, [
          el('strong', { textContent: c.name || c.email }),
          el('small', { textContent: [c.name ? c.email : '', c.orders ? `${many(c.orders, 'order')} · ${money(c.spent, c.currency)}` : 'no orders yet', c.member ? `member ${memberNo(c.member.memberNo)}` : ''].filter(Boolean).join(' · ') }),
        ])])
        // ticking leaves the list where it is: only the count and the sentence change
        input.addEventListener('change', () => { if (input.checked) draft.picked.add(c.key); else draft.picked.delete(c.key); row.classList.toggle('on', input.checked); count.textContent = `${chosen().length} chosen`; sayIt() })
        return row
      }) : [el('p', { className: 'sl-pick-empty', textContent: !state.loaded && !mState.loaded ? 'Loading the customers…' : all.length ? 'Nobody matches.' : 'No customers with an email yet. Type addresses below.' })])
      box.dataset.keepScroll = 'picklist'
      const emails = el('textarea', { className: 'sl-input', rows: 2, value: draft.emails, placeholder: 'Or type email addresses, one per line' })
      emails.addEventListener('input', () => { draft.emails = emails.value; count.textContent = `${chosen().length} chosen`; sayIt() })
      whom = [el('div', { className: 'sl-pick-top' }, [find, count, allBtn, noneBtn]), box, emails]
    } else {
      const code = el('input', { type: 'text', className: 'sl-input sl-code-in', value: draft.code, placeholder: 'For example MILTON10', maxLength: 30, spellcheck: false, ariaLabel: 'The code' })
      code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30); draft.code = code.value; sayIt() })
      whom = [code, el('p', { className: 'sl-hint', textContent: 'One code for everyone you share it with: letters, numbers, - and _. Handy for a season, a launch or a convention.' })]
    }
    // 4. how often, and the name buyers see
    const uses = el('select', { className: 'sl-select', ariaLabel: 'Uses' }, USES.map(([v, t]) => el('option', { value: v, textContent: t, selected: draft.uses === v })))
    uses.addEventListener('change', () => { draft.uses = uses.value; draft.usesTouched = true; sayIt() })
    const label = el('input', { type: 'text', className: 'sl-input', value: draft.label, maxLength: 40, placeholder: 'For example "Thank-you discount"' })
    label.addEventListener('input', () => { draft.label = label.value })
    const field = (t, control) => el('label', { className: 'sl-field' }, [el('span', { textContent: t }), control])
    sayIt()
    const create = button(dState.busy ? 'Making the codes…' : 'Create discount', makeDiscount, 'ia-btn sl-go')
    create.disabled = dState.busy
    return el('section', { className: 'sl-form' }, [
      el('h2', { className: 'sl-h2', textContent: 'New discount' }),
      dState.mode === 'test' ? el('p', { className: 'sl-hint', textContent: 'Stripe is in test mode: codes made now only work with test payments.' }) : null,
      step(1, 'How much off', [el('div', { className: 'sl-line' }, [pcts, other])]),
      step(2, 'How long it lasts', [el('div', { className: 'sl-line' }, [length, draft.length === 'date' ? day : null])]),
      step(3, 'Who it is for', [modes, ...whom]),
      step(4, 'Details', [el('div', { className: 'sl-pair' }, [field(draft.mode === 'people' ? 'Each code can be used' : 'The code can be used', uses), field('Name at checkout (optional)', label)])]),
      el('div', { className: 'sl-make' }, [sentence, create, dState.note ? el('span', { className: `sl-said ${dState.note.ok ? '' : 'is-bad'}`, textContent: dState.note.text }) : null]),
    ])
  }
  // the person a code is for, with their account's picture when they have one
  const personFor = (d) => {
    const c = customers().find((x) => x.email && x.email.toLowerCase() === String(d.email || '').toLowerCase())
    return { name: d.name || (c && c.name) || '', email: d.email, member: memberOf(d.email) || null }
  }
  // what was just made: the codes, ready to copy or send
  const madePanel = () => {
    const made = dState.result
    if (!made || !made.length) return null
    return el('section', { className: 'sl-form sl-made' }, [
      el('h2', { className: 'sl-h2', textContent: `Made ${many(made.length, 'code')}` }),
      el('p', { className: 'sl-hint', textContent: made.some((d) => d.email) ? 'Send each person their code: "Email it" sends it from the site, in its own design. Or copy them and send them yourself.' : 'Share the code wherever you like: buyers type it in the cart.' }),
      el('div', { className: 'sl-made-list' }, made.map((d) => {
        const p = personFor(d)
        return el('div', { className: 'sl-made-row' }, [
          d.email ? avatar(p) : el('i', { className: 'sl-initials is-all', ariaHidden: 'true', textContent: '%' }),
          el('span', { className: 'sl-made-who' }, [
            el('strong', { textContent: d.email ? p.name || d.email : 'Anyone with the code' }),
            el('small', { textContent: d.email ? [p.name ? d.email : '', p.member ? `member ${memberNo(p.member.memberNo)}` : 'no account yet'].filter(Boolean).join(' · ') : `${d.percent}% off, shared` }),
          ]),
          el('span', { className: 'sl-code-chip' }, [el('b', { textContent: `${d.percent}%` }), el('code', { className: 'sl-code', textContent: d.code })]),
          el('span', { className: 'sl-made-acts' }, [
            copyBtn(d.code, 'code'),
            d.email ? emailBtn(d) : null,
            d.sent ? el('small', { className: 'sl-dim', textContent: `emailed ${sentOn(d)}` }) : null,
          ]),
        ])
      })),
      made.length > 1 ? el('div', { className: 'sl-made-foot' }, [copyBtn(made.map((d) => `${d.code}${d.email ? `  ${d.email}` : ''}`).join('\n'), 'all'), button('Done', () => { dState.result = null; dState.note = null; draw() }, 'sl-link')]) : el('div', { className: 'sl-made-foot' }, [button('Done', () => { dState.result = null; dState.note = null; draw() }, 'sl-link')]),
    ])
  }

  const discRow = (d) => {
    const [k, t] = statusOf(d)
    const rw = d.reward ? rewardOf(d.reward) : null
    const who = d.email ? (d.name ? `${d.name} · ${d.email}` : d.email) : 'Anyone with the code'
    const links = el('span', { className: 'sl-disc-links' }, [
      copyBtn(d.code, 'code'),
      d.email && k === 'active' ? emailBtn(d) : null,
      d.active ? button('Switch off', () => askStop(d), 'sl-link sl-danger') : null,
    ])
    const acts = [
      d.email ? iconBtn('info', 'Customer details', () => { state.modal = { kind: 'customer', key: d.email.toLowerCase(), stub: { email: d.email, name: d.name } }; draw() }) : el('span', { className: 'sl-icon-gap' }),
      iconBtn('trash', `Delete ${d.code}`, () => askDelete(d)),
    ]
    return el('div', { className: `sl-row is-static is-${k}`, role: 'row' }, [
      el('span', { className: 'sl-pct', textContent: `${d.percent}%` }),
      el('span', { className: 'sl-disc-code' }, [
        el('strong', {}, [el('code', { className: 'sl-code', textContent: d.code }), d.reward ? badge('reward', 'Reward') : null, d.test && showTest.codes ? badge('test', 'Test') : null]),
        el('small', { className: 'sl-disc-who' }, [d.email ? avatar(personFor(d), 'xs') : null, el('span', { textContent: [who, rw ? `reward: ${rw.name}` : '', d.label && d.label !== `${d.percent}% off` ? `"${d.label}"` : ''].filter(Boolean).join(' · ') })]),
      ]),
      el('span', { className: 'sl-disc-meta' }, [
        el('span', { textContent: d.until ? `${d.until < now() ? 'Ended' : 'Until'} ${date(d.until * 1000)}` : 'No end date' }),
        el('small', { textContent: `used ${d.used}${d.uses ? ` of ${d.uses}` : ' times'}${d.sent ? ` · emailed ${sentOn(d)}` : ''}` }),
      ]),
      el('span', {}, [badge(`d-${k}`, t)]),
      links,
      el('span', { className: 'sl-acts' }, acts),
    ])
  }

  const discountsView = () => {
    const f = dState
    // every code shows: with Stripe's test key every code is a test one, with the live key none is,
    // so the test-data switch would only ever hide them all
    const all = f.list
    const inView = (d, v) => v === 'all' || statusOf(d)[0] === v
    const q = f.q.trim().toLowerCase()
    const by = { new: (a, b) => b.created - a.created, ending: (a, b) => (a.until || 9e12) - (b.until || 9e12), big: (a, b) => b.percent - a.percent, used: (a, b) => b.used - a.used }
    const list = all.filter((d) => inView(d, f.view) && (!q || [d.code, d.name, d.email, d.label].join(' ').toLowerCase().includes(q))).sort(by[f.sort] || by.new)
    const set = (k, v) => { dState[k] = v; dState.page = 1; draw() }
    const p = f.problem
    const problem = p ? el('div', { className: `sl-notice ${p.setup ? '' : 'is-bad'}` }, [
      el('strong', { textContent: p.setup ? 'Stripe is not connected yet' : p.status === 401 ? 'Your login has run out' : 'The discount codes could not be loaded' }),
      el('p', { textContent: p.message }),
      p.setup ? el('p', { textContent: 'Discount codes are kept in Stripe. In Stripe: Developers → API keys, copy the Secret key. In Vercel: the project’s Settings → Environment Variables, add STRIPE_SECRET_KEY with it, then redeploy.' }) : null,
    ]) : null
    return [
      head('Discount codes', 'Make a discount for chosen customers (each gets a code of their own) or one code for anyone you give it to. Buyers type it in the cart when they pay.', [
        button(f.loading ? 'Loading…' : 'Refresh', () => { loadDiscounts(); if (!mState.loading) loadMembers() }),
      ]),
      problem,
      p && p.setup ? null : discountForm(),
      madePanel(),
      el('h2', { className: 'sl-h2 is-list', textContent: 'Your discount codes' }),
      el('div', { className: 'sl-chips', role: 'group', ariaLabel: 'Show' }, DVIEWS.map(([k, label]) => {
        const b = el('button', { type: 'button', className: `sl-chip ${f.view === k ? 'on' : ''}`, ariaPressed: String(f.view === k) }, [label, el('small', { textContent: String(all.filter((d) => inView(d, k)).length) })])
        b.addEventListener('click', () => set('view', k))
        return b
      })),
      el('div', { className: 'sl-tools' }, [
        search(f.q, 'Code, name, email…', (v) => set('q', v)),
        select(f.sort, DSORTS, (v) => set('sort', v), 'Sort'),
      ]),
      el('p', { className: 'sl-count', textContent: f.loading && !f.loaded ? 'Loading the codes…' : `${list.length} ${list.length === 1 ? 'code' : 'codes'}` }),
      list.length ? el('div', { className: 'sl-table is-discounts', role: 'table' }, [
        headRow(['Off', 'Code', 'Ends · used', 'Status', '']),
        ...pageOf(list, f).map(discRow),
      ]) : (f.loaded && !p ? el('div', { className: 'sl-empty' }, [el('strong', { textContent: all.length ? 'Nothing here' : 'No discount codes yet' }), el('p', { textContent: all.length ? 'Try another chip or search.' : 'Make the first one above.' })]) : null),
      pager(list, f, ['code', 'codes']),
    ]
  }

  // ---------- Commissions ----------
  /* Orders → Commissions (#/sales/orders?tab=commissions): every commission asked for on
     the site (api/commissions.js), a conversation with each customer, the quote they accept and
     pay, and the stages of the work. One opens in a panel; asked again every 20 seconds while this
     tab is showing. What is typed in the panel is kept while the screen is drawn again. */
  const C_STATUS = [['requested', 'New'], ['discussing', 'Discussing'], ['quoted', 'Quoted'], ['paid', 'Paid'], ['sketch', 'Sketch'], ['inks', 'Inks'], ['colours', 'Colours'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']]
  const cStatusName = Object.fromEntries(C_STATUS)
  const C_WORK = [['sketch', 'Sketch'], ['inks', 'Inks'], ['colours', 'Colours'], ['delivered', 'Delivered'], ['cancelled', 'Cancel']]
  // what a piece goes through once paid, set on the quote (api/_commissions.js STAGE_SETS)
  const C_SETS = [['sketch', 'Sketch → Delivered (a sketch)', ['sketch', 'delivered']], ['inks', 'Sketch → Inks → Delivered (an inked piece)', ['sketch', 'inks', 'delivered']], ['full', 'Sketch → Inks → Colours → Delivered (full colour, or bigger)', ['sketch', 'inks', 'colours', 'delivered']]]
  const setWords = (key) => ((C_SETS.find((x) => x[0] === key) || C_SETS[2])[2]).map((k) => cStatusName[k]).join(' → ')
  // a label with the red star of a field that must be filled in
  const reqLabel = (text) => el('span', {}, [text, el('b', { className: 'sl-req', ariaHidden: 'true', textContent: ' *' })])
  const C_CHIPS = [
    ['all', 'All', () => true],
    ['unread', 'Unread', (c) => c.unread > 0],
    ['to-answer', 'To quote', (c) => ['requested', 'discussing'].includes(c.status)],
    ...C_STATUS.map(([k, t]) => [k, t, (c) => c.status === k]),
  ]
  const cState = { deliver: {}, saidBad: false, loaded: false, loading: false, list: [], problem: '', chip: 'all', q: '', page: 1, per: perSaved(), open: null, detail: null, detailProblem: '', drafts: {}, said: '', stick: true }
  const cApi = async (body) => {
    try {
      const r = await fetch('/api/commissions', { method: 'POST', cache: 'no-store', headers: { Authorization: `token ${pass()}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) }
    } catch { return { ok: false, status: 0, json: { message: 'Could not reach the site. Check the connection and try again.' } } }
  }
  const loadCommissions = async (quiet = false) => {
    if (cState.loading) return
    cState.loading = true
    if (!quiet) draw()
    const r = await cApi({ action: 'adminList' })
    cState.loading = false; cState.loaded = true
    if (r.ok) { cState.list = r.json.commissions || []; cState.problem = '' } else cState.problem = r.json.message || 'The commissions could not be loaded.'
    draw()
  }
  // one commission, in full (opening it marks the customer's messages read)
  // what a commission's window shows, to tell whether anything changed (the window is only drawn again when it did)
  const cKey = (d) => (d ? `${d.id}:${(d.messages || []).length}:${d.status}:${d.updatedAt || ''}:${JSON.stringify(d.quote || null)}:${JSON.stringify(d.payment || null)}` : '')
  const loadCommission = async (id) => {
    const before = `${cKey(cState.detail)}|${cState.detailProblem || ''}`
    const r = await cApi({ action: 'adminGet', id })
    if (cState.open !== id) return
    if (r.ok) { cState.detail = r.json.commission; cState.detailProblem = ''; const row = cState.list.find((x) => x.id === id); if (row) row.unread = 0 } else cState.detailProblem = r.json.message || 'It could not be opened.'
    if (`${cKey(cState.detail)}|${cState.detailProblem || ''}` !== before) draw()
  }
  const openCommission = (id) => {
    cState.open = id; cState.detail = cState.detail && cState.detail.id === id ? cState.detail : null; cState.detailProblem = ''; cState.said = ''; cState.stick = true
    history.replaceState(null, '', `#/sales/orders?tab=commissions&c=${encodeURIComponent(id)}`)
    cFails = 0
    draw(); loadCommission(id); cListen()
  }
  const closeCommission = () => {
    cHush()
    cState.open = null; cState.detail = null
    history.replaceState(null, '', '#/sales/orders?tab=commissions')
    draw()
  }
  // an answer from the server with the whole commission: kept, and its row brought up to date
  const keepCommission = (c) => {
    cState.detail = c
    const row = cState.list.find((x) => x.id === c.id)
    const last = c.messages && c.messages[c.messages.length - 1]
    const fresh = { id: c.id, number: c.number, title: c.title, kind: c.kind, status: c.status, price: c.price, currency: c.currency, ship: c.ship, paid: c.paid, updatedAt: c.updatedAt, lastAt: last ? last.at : c.lastAt, lastFrom: last ? last.from : '', lastText: last ? last.text : '', unread: 0, email: c.email, name: c.name, userId: c.userId, test: c.test, createdAt: c.createdAt }
    if (row) Object.assign(row, fresh); else cState.list.unshift(fresh)
  }
  /* The open conversation, live: api/commissions.js sends every change down a line held open
     (Server-Sent Events, read with fetch so the pass goes in the Authorization header, never in an
     address), opened again whenever it ends. The window is only drawn again when something changed.
     A database that cannot do it says so (`fallback`), and a line failing three times running gives
     up for that commission: then the conversation is asked for, as below. Hidden: the line closes. */
  let cLive = false // the line is open and talking
  let cNoWatch = false // the database cannot: ask, for as long as this page is open
  let cLineFor = '' // the commission the line is for
  let cLine = null
  let cFails = 0
  const cOn = () => Boolean(root && root.isConnected && document.visibilityState === 'visible' && state.view === 'orders' && state.ordersTab === 'commissions' && document.documentElement.hasAttribute('data-ia-sales'))
  const cRead = async (url, signal, onEvent) => {
    const answer = await fetch(url, { headers: { Authorization: `token ${pass()}`, Accept: 'text/event-stream' }, cache: 'no-store', signal })
    if (!answer.ok || !answer.body) throw new Error(`stream ${answer.status}`)
    const reader = answer.body.getReader()
    const decoder = new TextDecoder()
    let held = ''
    for (;;) {
      const { value, done: ended } = await reader.read()
      if (ended) return
      held += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let at
      while ((at = held.indexOf('\n\n')) >= 0) {
        const block = held.slice(0, at)
        held = held.slice(at + 2)
        let event = 'message'
        const data = []
        for (const line of block.split('\n')) { if (line.startsWith('event:')) event = line.slice(6).trim(); else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, '')) }
        if (!data.length) continue // a comment, to keep the line open
        try { onEvent(event, JSON.parse(data.join('\n'))) } catch { /* not ours */ }
      }
    }
  }
  const cHush = () => { cLineFor = ''; cLive = false; if (cLine) { cLine.abort(); cLine = null } }
  const cListen = async () => {
    const id = cState.open
    if (!id || cNoWatch || !cOn() || cLineFor === id) return
    if (cLineFor) cHush()
    cLineFor = id
    while (cLineFor === id && cState.open === id && !cNoWatch && cOn()) {
      cLine = new AbortController()
      let heard = false
      try {
        await cRead(`/api/commissions?stream=${encodeURIComponent(id)}&admin=1`, cLine.signal, (event, data) => {
          if (cState.open !== id) return
          if (event === 'commission' && data.commission) {
            heard = true; cLive = true; cFails = 0
            const before = `${cKey(cState.detail)}|${cState.detailProblem || ''}`
            keepCommission(data.commission); cState.detailProblem = ''
            if (`${cKey(cState.detail)}|` !== before) draw()
          } else if (event === 'fallback') cNoWatch = true
          else if (event === 'gone') { cState.detailProblem = 'It is not there any more.'; cState.detail = null; draw() }
        })
      } catch { /* opened again below */ }
      cLive = false
      if (cLineFor !== id || cNoWatch) break
      if (!heard && ++cFails >= 3) break // asked for instead, until another one is opened
      await new Promise((resolve) => { setTimeout(resolve, heard ? 200 : 1500 * cFails) })
    }
    if (cLineFor === id) cLineFor = ''
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cListen(); else cHush() })

  // while the Commissions tab shows (and this browser tab is in view): the list is asked for every 15
  // seconds; the open conversation comes down its live line, or (without one) is asked for every 3
  // seconds (every 10 once nothing has changed for a minute)
  let cQuietSince = Date.now()
  let cSeen = ''
  let cListAt = 0
  const cTick = async () => {
    try {
      const on = root && root.isConnected && document.visibilityState === 'visible' && state.view === 'orders' && state.ordersTab === 'commissions' && document.documentElement.hasAttribute('data-ia-sales')
      if (on) {
        if (Date.now() - cListAt > 15000) { cListAt = Date.now(); loadCommissions(true) }
        if (cState.open && cFails < 3 && !cNoWatch && cLineFor !== cState.open) cListen() // its line, if it is not open
        if (cState.open && !cLive) {
          await loadCommission(cState.open)
          const d = cState.detail
          const k = d ? `${(d.messages || []).length}:${d.status}:${d.updatedAt || ''}` : ''
          if (k !== cSeen) { cSeen = k; cQuietSince = Date.now() }
        }
      } else if (cLineFor) cHush() // not showing: the line closes
    } catch { /* asked again next time */ }
    setTimeout(cTick, Date.now() - cQuietSince > 60000 ? 10000 : 3000)
  }
  setTimeout(cTick, 3000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cQuietSince = Date.now() })

  const ago = (t) => {
    const mins = Math.round((Date.now() - new Date(t)) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins} min ago`
    if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`
    return date(new Date(t).getTime())
  }
  const cUnread = () => cState.list.reduce((n, c) => n + (c.unread || 0), 0)
  // the two tabs at the top of Orders: the shop's orders, and the commissions
  const ordersTabs = () => {
    const tab = (k, label, href, n, hot) => el('a', { className: `sl-otab ${state.ordersTab === k ? 'on' : ''}`, href, ariaCurrent: state.ordersTab === k ? 'page' : null }, [label, n != null ? el('small', { className: hot ? 'is-hot' : '', textContent: String(n) }) : null])
    const unread = cUnread()
    return el('nav', { className: 'sl-otabs', ariaLabel: 'Orders' }, [
      tab('shop', 'Shop', '#/sales/orders', state.loaded ? visible(state.orders, 'orders').filter(done).length : null, false),
      tab('commissions', 'Commissions', '#/sales/orders?tab=commissions', unread || (cState.loaded ? cState.list.length : null), unread > 0),
    ])
  }

  const filteredCommissions = () => {
    const chip = C_CHIPS.find((c) => c[0] === cState.chip) || C_CHIPS[0]
    const q = cState.q.trim().toLowerCase()
    return cState.list.filter((c) => chip[2](c) && (!q || [c.number, c.name, c.email, c.title, c.kind, c.lastText].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (b.unread > 0) - (a.unread > 0) || new Date(b.lastAt || b.updatedAt) - new Date(a.lastAt || a.updatedAt))
  }
  const askDeleteCommission = (c) => ask({
    title: `Delete commission ${c.number}?`,
    text: `${c.name || c.email} · ${c.title} · ${cStatusName[c.status] || c.status}${c.price != null ? ` · ${money(c.price, c.currency)}` : ''}`,
    more: `It is erased with its whole conversation: it leaves this list and the customer's account.${c.paid ? ' It is paid: the payment stays in Stripe or PayPal (refund it there if needed).' : ''}`,
    yes: 'Delete commission',
    run: async () => {
      const r = await cApi({ action: 'adminDelete', id: c.id })
      if (!r.ok) return r.json.message || 'Not deleted. Try again.'
      cState.list = cState.list.filter((x) => x.id !== c.id)
      if (cState.open === c.id) closeCommission()
      return ''
    },
  })
  const commissionsView = () => {
    const list = filteredCommissions()
    const all = cState.list
    const set = (k, v) => { cState[k] = v; cState.page = 1; draw() }
    const working = all.filter((c) => ['paid', 'sketch', 'inks', 'colours'].includes(c.status))
    const paidSum = all.filter((c) => c.paid && c.status !== 'cancelled').reduce((t, c) => t + (Number(c.price) || 0), 0)
    if (!mState.loaded && !mState.loading) loadMembers() // their pictures
    return [
      ordersTabs(),
      head('Commissions', 'Pieces asked for on the Commissions page. Talk each one over with the customer, send a quote (they accept and pay it in their account), then move it through Sketch, Inks, Colours and Delivered: they see every step, and get an email.', [
        button(cState.loading ? 'Loading…' : 'Refresh', () => loadCommissions()),
      ]),
      cState.problem ? el('div', { className: 'sl-notice is-bad' }, [el('strong', { textContent: 'The commissions could not be loaded' }), el('p', { textContent: cState.problem })]) : null,
      el('div', { className: 'sl-stats' }, [
        stat('Unread', String(cUnread()), cUnread() ? 'messages waiting' : 'all read'),
        stat('To quote', String(all.filter(C_CHIPS[2][2]).length), 'new or being talked over'),
        stat('In the works', String(working.length), 'paid, not delivered'),
        stat('Paid', money(paidSum), `${all.filter((c) => c.paid).length} commissions`),
      ]),
      el('div', { className: 'sl-chips', role: 'group', ariaLabel: 'Show' }, C_CHIPS.map(([k, label, test]) => {
        const n = all.filter(test).length
        if (n === 0 && !['all', 'unread', 'to-answer'].includes(k) && cState.chip !== k) return null
        const b = el('button', { type: 'button', className: `sl-chip ${cState.chip === k ? 'on' : ''} ${k === 'unread' && n ? 'is-hot' : ''}`, ariaPressed: String(cState.chip === k) }, [label, el('small', { textContent: String(n) })])
        b.addEventListener('click', () => set('chip', k))
        return b
      })),
      el('div', { className: 'sl-tools' }, [search(cState.q, 'Number, name, email, piece, message…', (v) => set('q', v))]),
      el('p', { className: 'sl-count', textContent: cState.loading && !cState.loaded ? 'Loading the commissions…' : `${list.length} ${list.length === 1 ? 'commission' : 'commissions'}` }),
      list.length ? el('div', { className: 'sl-table is-commissions', role: 'table' }, [
        headRow(['Commission', 'Customer', 'Piece', 'Status', 'Price', 'Last']),
        ...pageOf(list, cState).map((c) => rowEl(cState.open === c.id, [
          el('span', { className: 'sl-c-order' }, [el('strong', { textContent: c.number }), el('small', { textContent: date(new Date(c.createdAt).getTime()) })]),
          el('span', { className: 'sl-c-who' }, [avatar({ name: c.name, email: c.email, member: memberOf(c.email) }), el('span', {}, [el('strong', { textContent: c.name || '—' }), el('small', { textContent: c.email })])]),
          el('span', {}, [el('strong', { textContent: c.title }), el('small', { textContent: c.kind })]),
          el('span', {}, [badge(`c-${c.status}`, cStatusName[c.status] || c.status), c.removed ? el('small', { textContent: 'Removed by the customer' }) : null]),
          el('span', { className: 'sl-c-total' }, [el('strong', { textContent: c.price != null ? money(c.price, c.currency) : '—' }), el('small', { textContent: c.paid ? (c.paidWith ? `Paid · ${c.paidWith}` : 'Paid') : c.price != null ? 'Not paid yet' : 'No quote yet' })]),
          el('span', { className: 'sl-c-last' }, [
            el('strong', {}, [c.unread ? el('b', { className: 'sl-unread', textContent: String(c.unread) }) : null, ago(c.lastAt || c.updatedAt)]),
            el('small', { textContent: `${c.lastFrom === 'customer' ? '' : c.lastFrom === 'artist' ? 'You: ' : ''}${c.lastText || ''}` }),
          ]),
        ], () => openCommission(c.id), [iconBtn('trash', `Delete commission ${c.number}`, () => askDeleteCommission(c))])),
      ]) : (cState.loaded && !cState.problem ? el('div', { className: 'sl-empty' }, [el('strong', { textContent: all.length ? 'None match' : 'No commissions yet' }), el('p', { textContent: all.length ? 'Try another chip or search.' : 'Requests made on the Commissions page (by customers logged in to their account) show up here.' })]) : null),
      pager(list, cState, ['commission', 'commissions']),
    ]
  }

  // a message's words, with web addresses as links
  const linked = (text) => {
    const out = []
    String(text || '').split(/(https?:\/\/[^\s<>"]+)/g).forEach((part, i) => out.push(i % 2 ? el('a', { href: part, target: '_blank', rel: 'noopener noreferrer', textContent: part.replace(/^https?:\/\//, '') }) : part))
    return out
  }
  const ymd = (d) => (d ? String(d).slice(0, 10) : '')
  // a quote as it shows in the conversation
  const quoteNote = (q) => el('div', { className: 'sl-qnote' }, [
    el('span', { className: 'sl-qnote-tag', textContent: 'Quote' }),
    el('strong', { textContent: money(q.price, q.currency) }),
    el('p', {}, linked(q.includes)),
    el('dl', {}, [
      q.due ? el('dt', { textContent: 'Ready by' }) : null, q.due ? el('dd', { textContent: date(new Date(q.due).getTime()) }) : null,
      el('dt', { textContent: 'Delivery' }), el('dd', { textContent: q.ship ? 'Posted to them' : 'Digital' }),
      el('dt', { textContent: 'Stages' }), el('dd', { textContent: setWords(q.stages || 'full') }),
    ]),
  ])
  const commissionPanel = (c) => {
    const id = cState.open
    const draft = cState.drafts[id] || (cState.drafts[id] = {})
    const block = (title, kids, cls = '') => el('section', { className: `sl-block ${cls}` }, [el('h3', { textContent: title }), ...kids])
    const said = el('p', { className: `sl-said ${cState.saidBad ? 'is-bad' : ''}`, role: 'status', textContent: cState.said })
    const fail = (r) => { said.classList.add('is-bad'); said.textContent = r.json.message || 'That did not work. Try again.' }
    const run = async (btn, body, done) => {
      btn.disabled = true; said.classList.remove('is-bad'); said.textContent = 'Saving…'
      const r = await cApi({ id, ...body })
      btn.disabled = false
      if (!r.ok) return fail(r)
      cState.saidBad = false
      keepCommission(r.json.commission); done(); cState.stick = true
      draw()
    }
    const input = (key, props, tag = 'input') => {
      const n = el(tag, { className: 'sl-input', ...props })
      n.dataset.draft = key // drawn again while typed in: found again by this, and given the focus back
      if (draft[key] !== undefined) { if (props.type === 'checkbox') n.checked = draft[key]; else n.value = draft[key] }
      n.addEventListener(props.type === 'checkbox' ? 'change' : 'input', () => { draft[key] = props.type === 'checkbox' ? n.checked : n.value })
      return n
    }
    if (!c) {
      const panel = el('aside', { className: 'sl-panel is-commission', role: 'dialog', ariaModal: 'true', ariaLabel: 'Commission' }, [
        el('header', { className: 'sl-panel-head' }, [el('div', {}, [el('div', { className: 'ia-kicker', textContent: 'Commission' }), el('h2', { textContent: cState.detailProblem ? 'Not found' : 'Opening…' })]), button('×', closeCommission, 'sl-x')]),
        el('div', { className: 'sl-panel-body' }, [cState.detailProblem ? el('p', { className: 'sl-said is-bad', textContent: cState.detailProblem }) : null]),
      ])
      const shade = el('div', { className: 'sl-shade' }); shade.addEventListener('click', closeCommission)
      return [shade, panel]
    }
    const paid = Boolean(c.payment && c.payment.paidAt)
    const d = c.details || {}
    const mem = memberOf(c.email)

    // the conversation: the customer on the left, Milton on the right, the site's notes in the middle
    const thread = el('div', { className: 'sl-thread' }, (c.messages || []).map((m) => el('div', { className: `sl-msg is-${m.from}` }, [
      m.from !== 'system' ? el('span', { className: 'sl-msg-who', textContent: m.from === 'artist' ? 'You' : (c.name || 'Customer').split(' ')[0] }) : null,
      m.kind === 'quote' && m.quote ? quoteNote(m.quote) : el('div', { className: 'sl-msg-bubble' }, [
        m.text ? el('p', {}, linked(m.text)) : null,
        m.links && m.links.length ? el('ul', { className: 'sl-msg-links' }, m.links.map((l) => el('li', {}, [el('a', { href: l, target: '_blank', rel: 'noopener noreferrer', textContent: l.replace(/^https?:\/\//, '') })]))) : null,
      ]),
      el('time', { textContent: date(new Date(m.at).getTime(), true) }),
    ])))
    thread.addEventListener('scroll', () => { cState.stick = thread.scrollTop + thread.clientHeight >= thread.scrollHeight - 30 })
    const reply = input('reply', { placeholder: c.status === 'cancelled' ? 'It is cancelled; you can still write to them' : `Write to ${(c.name || 'them').split(' ')[0]}…`, rows: 3, maxLength: 4000, ariaLabel: 'Your message' }, 'textarea')
    const links = input('links', { placeholder: 'Links (optional): paste one or more', maxLength: 2000, ariaLabel: 'Links' })
    const send = button('Send', () => {
      if (!(draft.reply || '').trim() && !(draft.links || '').trim()) { reply.focus(); return }
      run(send, { action: 'adminMessage', text: draft.reply || '', links: String(draft.links || '').split(/[\s,]+/).filter(Boolean) }, () => { draft.reply = ''; draft.links = ''; cState.said = 'Sent ✓' })
    }, 'ia-btn')
    reply.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send.click() })

    // the quote: price, what it includes, when, and whether it is posted
    const q = c.quote
    const price = input('price', { type: 'number', min: '1', step: '1', inputMode: 'decimal', value: q ? String(q.price) : '', placeholder: 'For example 250', required: true, ariaRequired: 'true' })
    const includes = input('includes', { rows: 3, maxLength: 1000, value: q ? q.includes : '', placeholder: 'For example: A3 full colour, signed, high-resolution file', required: true, ariaRequired: 'true' }, 'textarea')
    // what the piece goes through: from the quote, else guessed from the kind of piece they asked for
    const stageWant = draft.stages ?? ((q && q.stages) || c.suggestedStages || 'full')
    const stageSel = el('select', { className: 'sl-select', required: true, ariaRequired: 'true' }, C_SETS.map(([k, t]) => el('option', { value: k, textContent: t, selected: k === stageWant })))
    stageSel.addEventListener('change', () => { draft.stages = stageSel.value })
    const due = input('due', { type: 'date', value: q ? ymd(q.due) : '' })
    const shipBox = input('ship', { type: 'checkbox', className: 'sl-switch-box', checked: q ? Boolean(q.ship) : false })
    const ship = el('label', { className: 'sl-switch' }, [shipBox, el('span', { className: 'sl-switch-track', ariaHidden: 'true' }), el('span', {}, [el('strong', { textContent: 'Post it to me' }), el('small', { textContent: 'On: the checkout asks for their address. Off: a digital piece.' })])])
    const sendQuote = button(q ? 'Send the new quote' : 'Send quote', () => {
      const p = Number(draft.price ?? price.value)
      if (!(p >= 1)) { said.classList.add('is-bad'); said.textContent = 'Put a price first.'; price.focus(); return }
      if (!String(draft.includes ?? includes.value).trim()) { said.classList.add('is-bad'); said.textContent = 'Say what the price includes.'; includes.focus(); return }
      run(sendQuote, { action: 'adminQuote', price: p, includes: draft.includes ?? includes.value, due: draft.due ?? due.value, ship: draft.ship ?? shipBox.checked, stages: stageSel.value }, () => { ['price', 'includes', 'due', 'ship', 'stages'].forEach((k) => delete draft[k]); cState.said = 'Quote sent ✓ They have an email.' })
    }, 'ia-btn')
    const quoteForm = el('div', { className: 'sl-quote-form' }, [
      el('div', { className: 'sl-quote-row' }, [
        el('label', { className: 'sl-label' }, [reqLabel('Price (€)'), price]),
        el('label', { className: 'sl-label' }, [el('span', { textContent: 'Ready by (optional)' }), due]),
      ]),
      el('label', { className: 'sl-label' }, [reqLabel('What is included'), includes]),
      el('label', { className: 'sl-label' }, [reqLabel('What the piece goes through'), stageSel, el('small', { className: 'sl-hint', textContent: `Their tracker shows only these stages. Picked from what they asked for (${(c.details && c.details.kind) || 'the kind of piece'}); change it if needed.` })]),
      ship,
      el('div', { className: 'sl-save' }, [sendQuote, el('small', { className: 'sl-hint', textContent: 'Full price, paid up front. They accept and pay it in their account.' })]),
    ])
    const quoteNow = q ? el('div', { className: 'sl-quote-now' }, [
      el('strong', { textContent: money(q.price, q.currency) }),
      el('span', {}, linked(q.includes)),
      el('small', { textContent: [q.due ? `Ready by ${date(new Date(q.due).getTime())}` : '', q.ship ? 'Posted to them' : 'Digital', setWords(q.stages || 'full'), `sent ${date(new Date(q.at).getTime(), true)}`].filter(Boolean).join(' · ') }),
    ]) : null

    // the stages of the work: once it is paid (cancel any time)
    const note = input('note', { placeholder: 'A note for them with the step (optional)', maxLength: 2000 })
    const goesThrough = c.stages || ['sketch', 'inks', 'colours', 'delivered']
    const stages = el('div', { className: 'sl-stages', role: 'group', ariaLabel: 'Stage', style: `grid-template-columns:repeat(${goesThrough.length + 1},minmax(0,1fr))` }, C_WORK.filter(([k]) => k === 'cancelled' || goesThrough.includes(k)).map(([k, t]) => {
      const off = (k !== 'cancelled' && !paid) || c.status === k
      const b = el('button', { type: 'button', className: `sl-stage is-${k === 'cancelled' ? 'cancelled' : k === 'delivered' ? 'delivered' : 'new'} ${c.status === k ? 'on' : ''}`, textContent: t, disabled: off && c.status !== k, ariaPressed: String(c.status === k) })
      b.addEventListener('click', () => {
        if (c.status === k) return
        const go = () => run(b, { action: 'adminStage', status: k, note: draft.note || '' }, () => { draft.note = ''; cState.said = `${cStatusName[k]} ✓ They have an email.` })
        if (k === 'cancelled') ask({ title: `Cancel commission ${c.number}?`, text: `${c.name || c.email} · ${c.title}`, more: paid ? 'It is paid: cancelling does not refund it. Refund it in Stripe or PayPal, then tell them here.' : 'They see it cancelled in their account, and get an email. An open checkout for it is closed.', yes: 'Cancel it', run: async () => { await go(); return '' } })
        else go()
      })
      return b
    }))


    // the finished piece, sent to their email: the files go up in pieces of 3 MB (20 MB in all), then
    // one email carries them (api/commissions.js adminFileChunk, adminDeliver). Chosen files are kept
    // while the window is drawn again.
    const CHUNK = 3 * 1048576
    const CAP = 20 * 1048576
    const dv = cState.deliver[id] || (cState.deliver[id] = { files: [], busy: false, progress: '' })
    const sizeOf = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
    const b64 = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.onerror = () => reject(new Error('A file could not be read.')); r.readAsDataURL(blob) })
    const deliver = async () => {
      if (dv.busy) return
      const upload = Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => x.toString(16).padStart(2, '0')).join('')
      dv.busy = true; cState.said = ''; cState.saidBad = false
      try {
        for (const [fi, f] of dv.files.entries()) {
          const total = Math.max(1, Math.ceil(f.size / CHUNK))
          for (let i = 0; i < total; i++) {
            dv.progress = `Uploading ${f.name}${total > 1 ? ` (${i + 1} of ${total})` : ''}…`; draw()
            const r = await cApi({ action: 'adminFileChunk', id, upload, file: fi, name: f.name, type: f.type, index: i, total, data: await b64(f.slice(i * CHUNK, (i + 1) * CHUNK)) })
            if (!r.ok) throw new Error(r.json.message || 'A file could not be sent. Try again.')
          }
        }
        dv.progress = 'Emailing it to them…'; draw()
        const r = await cApi({ action: 'adminDeliver', id, upload, note: draft.dnote || '', link: draft.dlink || '' })
        if (!r.ok) throw new Error(r.json.message || 'It could not be sent. Try again.')
        keepCommission(r.json.commission)
        cState.said = `Sent to ${c.email} ✓${r.json.sent && r.json.sent.length ? ` (${r.json.sent.join(', ')})` : ''}`
        dv.files = []; draft.dnote = ''; draft.dlink = ''; cState.stick = true
      } catch (e) { cState.said = e.message; cState.saidBad = true }
      dv.busy = false; dv.progress = ''
      draw()
    }
    const deliverBlock = () => {
      const total = dv.files.reduce((n, f) => n + f.size, 0)
      const over = total > CAP
      const picker = el('input', { type: 'file', multiple: true, id: `dv-${id}`, className: 'sl-file', accept: 'image/*,application/pdf,application/zip,.zip,.psd,.tif,.tiff', disabled: dv.busy })
      picker.addEventListener('change', () => { dv.files.push(...picker.files); draw() })
      const dnote = input('dnote', { rows: 2, maxLength: 2000, placeholder: 'A note with it (optional)', ariaLabel: 'A note with it' }, 'textarea')
      const dlink = input('dlink', { placeholder: 'https://… (Google Drive, WeTransfer)', maxLength: 500, ariaLabel: 'Download link' })
      const go = button(dv.busy ? dv.progress || 'Sending…' : 'Send to their email', deliver, 'ia-btn')
      go.disabled = dv.busy || over || (!dv.files.length && !String(draft.dlink || '').trim())
      dlink.addEventListener('input', () => { go.disabled = dv.busy || over || (!dv.files.length && !dlink.value.trim()) })
      return [
        el('label', { className: 'sl-label', htmlFor: `dv-${id}` }, [el('span', { textContent: 'The finished files (images, PDF or zip)' })]),
        el('div', { className: 'sl-file-pick' }, [picker, el('small', { className: 'sl-hint', textContent: 'Choose one or more. Up to 20 MB in all, sent attached to one email.' })]),
        dv.files.length ? el('ul', { className: 'sl-files' }, dv.files.map((f, i) => {
          const x = button('×', () => { dv.files.splice(i, 1); draw() }, 'sl-file-x')
          x.setAttribute('aria-label', `Remove ${f.name}`); x.disabled = dv.busy
          return el('li', {}, [el('span', { textContent: f.name }), el('small', { textContent: sizeOf(f.size) }), x])
        })) : null,
        dv.files.length ? el('p', { className: `sl-files-total ${over ? 'is-over' : ''}`, textContent: over ? `${sizeOf(total)} in all: over 20 MB, too big for an email. Remove some, or put them in Google Drive or WeTransfer and send the link below.` : `${dv.files.length} ${dv.files.length === 1 ? 'file' : 'files'}, ${sizeOf(total)} in all` }) : null,
        el('label', { className: 'sl-label' }, [el('span', { textContent: 'A note (optional)' }), dnote]),
        el('label', { className: 'sl-label' }, [el('span', { textContent: 'A download link for big files (optional)' }), dlink]),
        el('div', { className: 'sl-save' }, [go, el('small', { className: 'sl-hint', textContent: c.status === 'complete' ? 'They have confirmed it already: this only sends the files.' : 'It is marked Delivered, with a note in the conversation. They confirm when they have it.' })]),
      ]
    }

    const p = c.payment
    const stripeLink = p && p.provider === 'stripe' && p.pi ? `https://dashboard.stripe.com/${p.test ? 'test/' : ''}payments/${p.pi}` : ''
    const paypalLink = p && p.provider === 'paypal' && p.captureId ? `https://www.${p.test ? 'sandbox.' : ''}paypal.com/activity/payment/${p.captureId}` : ''
    const a = c.address
    const panel = el('aside', { className: 'sl-panel is-commission', role: 'dialog', ariaModal: 'true', ariaLabel: `Commission ${c.number}` }, [
      el('header', { className: 'sl-panel-head' }, [
        el('div', {}, [
          el('div', { className: 'ia-kicker', textContent: `Asked ${date(new Date(c.createdAt).getTime(), true)}` }),
          el('h2', { textContent: c.number }),
          el('p', { className: 'sl-panel-sub', textContent: c.title }),
          el('div', { className: 'sl-badges' }, [badge(`c-${c.status}`, cStatusName[c.status] || c.status), paid ? badge('paid', p.refunded ? 'Refunded' : 'Paid') : null, c.test ? badge('test', 'Test') : null, c.removed ? badge('removed', 'Removed by the customer') : null]),
        ]),
        button('×', closeCommission, 'sl-x'),
      ]),
      el('div', { className: 'sl-panel-body' }, [
        el('section', { className: 'sl-block sl-c-person' }, [
          avatar({ name: c.name, email: c.email, member: mem }, 'lg'),
          el('div', {}, [
            el('strong', { textContent: c.name || '—' }),
            el('span', { className: 'sl-mail' }, [el('span', { textContent: c.email }), copyBtn(c.email, 'email')]),
            mem ? el('small', { textContent: `Member ${memberNo(mem.memberNo)}${mem.verified ? ' · email confirmed' : ''}` }) : null,
          ]),
        ]),
        block('Conversation', [thread, c.status === 'complete'
          ? el('div', { className: 'sl-closed' }, [el('p', { textContent: `Complete — confirmed by the customer${c.completedAt ? ` on ${date(new Date(c.completedAt).getTime())}` : ''}; the conversation is closed.` }), button('Reopen conversation', () => ask({ title: `Reopen ${c.number}?`, text: `${c.name || c.email} · ${c.title}`, more: 'It goes back to Delivered and you can write to each other again. They get an email saying so.', yes: 'Reopen it', plain: true, run: async () => { const r = await cApi({ action: 'adminReopen', id }); if (!r.ok) return r.json.message || 'Not reopened. Try again.'; keepCommission(r.json.commission); cState.said = 'Reopened ✓'; return '' } }), 'ia-btn ghost')])
          : c.status === 'cancelled'
            ? el('div', { className: 'sl-closed' }, [el('p', { textContent: 'Cancelled — the conversation is closed.' })])
            : el('div', { className: 'sl-reply' }, [reply, links, el('div', { className: 'sl-save' }, [send, el('small', { className: 'sl-hint', textContent: 'They see it in their account and get an email.' })])])]),
        block('What they asked for', [el('dl', { className: 'sl-dl' }, [
          el('dt', { textContent: 'Kind' }), el('dd', { textContent: d.kind || '—' }),
          d.size ? el('dt', { textContent: 'Size' }) : null, d.size ? el('dd', { textContent: d.size }) : null,
          d.budget ? el('dt', { textContent: 'Budget' }) : null, d.budget ? el('dd', { textContent: d.budget }) : null,
          el('dt', { textContent: 'Needed by' }), el('dd', { textContent: d.due || 'No deadline' }),
          el('dt', { textContent: 'The idea' }), el('dd', {}, linked(d.idea)),
          d.refs && d.refs.length ? el('dt', { textContent: 'References' }) : null,
          d.refs && d.refs.length ? el('dd', {}, d.refs.map((l) => el('a', { href: l, target: '_blank', rel: 'noopener noreferrer', textContent: l.replace(/^https?:\/\//, '') }))) : null,
        ])]),
        block('Quote', paid || c.status === 'cancelled' ? [quoteNow || el('p', { className: 'sl-dim', textContent: 'No quote was sent.' })] : [quoteNow, quoteForm].filter(Boolean)),
        block('Stage', c.status === 'complete'
          ? [el('p', { className: 'sl-dim', textContent: `Complete: they confirmed they received it${c.completedAt ? ` on ${date(new Date(c.completedAt).getTime())}` : ''}.` })]
          : [stages, note, el('small', { className: 'sl-hint', textContent: paid ? 'Each step is saved at once, with a note in the conversation and an email to them. Delivered: send the files below.' : 'The work stages open once it is paid.' })]),
        paid && c.status !== 'cancelled' ? block('Upload the finished piece', deliverBlock(), 'sl-deliver') : null,
        block('Payment', p && p.paidAt ? [
          el('div', { className: 'sl-paid-with' }, [el('small', { textContent: 'Paid with' }), el('strong', { textContent: p.paidWith || (p.provider === 'paypal' ? 'PayPal' : 'Card') })]),
          el('div', { className: 'sl-sum' }, [el('span', { textContent: 'Paid' }), el('strong', { textContent: money(p.amount, p.currency) })]),
          p.code ? el('div', { className: 'sl-sum is-refund' }, [el('span', { textContent: `Code ${p.code}` }), el('strong', { textContent: `− ${money(p.discount || 0, p.currency)}` })]) : null,
          el('p', { className: 'sl-dim', textContent: `${date(new Date(p.paidAt).getTime(), true)}${p.test ? ' · test payment' : ''}${p.refunded ? ' · refunded' : ''}` }),
          a ? el('p', { className: 'sl-address' }, [a.name, a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), country(a.country)].filter(Boolean).flatMap((line, i) => (i ? [el('br'), line] : [line]))) : el('p', { className: 'sl-dim', textContent: c.quote && c.quote.ship ? 'No address came with the payment.' : 'Digital: nothing to post.' }),
          stripeLink || paypalLink ? el('a', { className: 'ia-btn ghost', href: stripeLink || paypalLink, target: '_blank', rel: 'noopener', textContent: stripeLink ? 'Open in Stripe ↗' : 'Open in PayPal ↗' }) : null,
        ] : [el('p', { className: 'sl-dim', textContent: c.pending ? `A ${c.pending.provider === 'paypal' ? 'PayPal' : 'card'} checkout was opened ${date(new Date(c.pending.at).getTime(), true)}; not paid yet.` : 'Not paid yet.' })]),
        el('section', { className: 'sl-block' }, [button('Delete this commission', () => askDeleteCommission(c), 'ia-btn ghost sl-danger')]),
      ]),
      el('footer', { className: 'sl-panel-foot' }, [said]),
    ])
    panel.querySelector('.sl-panel-body').dataset.keepScroll = `commission-${id}`
    const shade = el('div', { className: 'sl-shade' })
    shade.addEventListener('click', closeCommission)
    // the newest message in view, unless they scrolled up to read
    requestAnimationFrame(() => { if (cState.stick) thread.scrollTop = thread.scrollHeight })
    return [shade, panel]
  }

  // ---------- Emails ----------
  /* Emails (#/sales/emails): news and notices to many customers at once (api/_mailings.js,
     through /api/account). Who it goes to (those who agreed to news, or every account for a notice
     about the service), why (a ready-made email for each reason, every word editable), a live
     preview drawn by the same code as the real email, a test to the artist's own inbox, then the
     send: this page sends it a few at a time, with a bar, and can stop and carry on later without
     sending anyone the same email twice. Past mailings are listed under it. */
  const eState = { loaded: false, loading: false, problem: '', info: null, audience: 'news', fields: null, touched: false, html: '', run: null, note: null }
  const SOCIAL = { instagram: 'Link to the post', youtube: 'Link to the video', discord: 'Link to the server or event', globalcomix: 'Link to the comic' }
  const AUDIENCE_SHORT = { news: 'Agreed to news', all: 'All accounts' }
  const reasonName = (k) => (eState.info && eState.info.templates[k] && eState.info.templates[k].label) || k
  const loadMailInfo = async () => {
    eState.loading = true; draw()
    const r = await mApi({ action: 'adminMailInfo' })
    eState.loading = false; eState.loaded = true
    if (r.ok) { eState.info = r.json; eState.problem = '' }
    else eState.problem = r.status === 503 || r.status === 403 ? 'Customer accounts are not set up on this site, so there is nobody to email.' : (r.json.message || 'The emails screen could not be loaded.')
    draw()
  }
  const countFor = (a) => (eState.info ? eState.info.counts[a] || 0 : 0)
  // the email as drawn by the server, a moment after the last change
  let previewTimer = 0, previewGen = 0
  const preview = () => {
    clearTimeout(previewTimer)
    previewTimer = setTimeout(async () => {
      if (!eState.fields) return
      const gen = ++previewGen
      const r = await mApi({ action: 'adminMailPreview', fields: eState.fields, audience: eState.audience })
      if (gen !== previewGen || !r.ok) return
      eState.html = r.json.html || ''
      const frame = root && root.querySelector('.sl-mail-frame')
      if (frame && frame.srcdoc !== eState.html) frame.srcdoc = eState.html
    }, 300)
  }
  const applyTemplate = (reason) => {
    const t = eState.info.templates[reason]
    if (!t) return
    const { label: _label, ...fields } = t
    eState.fields = { ...fields, pieces: [], discount: null, event: null }
    eState.touched = false; eState.note = null
    draw(); preview()
  }
  const pickReason = (reason) => {
    if (!reason) return
    if (eState.fields && eState.touched && reason !== eState.fields.reason) {
      ask({ title: 'Start from the template?', text: `${reasonName(reason)}: a ready-made email.`, more: 'What you have written so far is replaced by its words.', yes: 'Use the template', plain: true, run: async () => { applyTemplate(reason); return '' } })
      return
    }
    applyTemplate(reason)
  }
  // a field of the email: kept as it is typed, the preview follows; drawing again keeps the caret there
  const mailInput = (key, props = {}, area = false) => {
    const i = el(area ? 'textarea' : 'input', { className: 'sl-input', value: eState.fields[key] || '', ...(area ? { rows: 6 } : { type: 'text' }), ...props })
    i.dataset.focus = `mail-${key}`
    i.addEventListener('input', () => { eState.fields[key] = i.value; eState.touched = true; preview() })
    return i
  }
  const field = (t, control, cls = '') => el('label', { className: `sl-field ${cls}` }, [el('span', { textContent: t }), control])

  // the reason's own part: the code, the pieces, the link, the convention
  const extras = () => {
    const f = eState.fields
    const r = f.reason
    if (r === 'discount') {
      const codes = dState.list.filter((d) => statusOf(d)[0] === 'active' && !d.email)
      const s = el('select', { className: 'sl-select', ariaLabel: 'Discount code' }, [
        el('option', { value: '', textContent: codes.length ? 'Pick a code…' : dState.loaded ? 'No shared codes running' : 'Loading the codes…' }),
        ...codes.map((d) => el('option', { value: d.id, textContent: `${d.code} · ${d.percent}% off · ${d.until ? `until ${date(d.until * 1000)}` : 'no end date'}`, selected: Boolean(f.discount && f.discount.code === d.code) })),
      ])
      s.addEventListener('change', () => { const d = codes.find((x) => x.id === s.value); f.discount = d ? { code: d.code, percent: d.percent, until: d.until || null } : null; eState.touched = true; preview() })
      return [field('The code', s), el('p', { className: 'sl-hint', textContent: 'Only codes for anyone (one shared code) that are still running. Make one under Shop → Discount codes → Anyone with the code. In the words, {percent}, {code} and {until} stand for it.' })]
    }
    if (r === 'pieces') {
      const all = eState.info.pieces
      const count = el('span', { className: 'sl-chosen', textContent: `${f.pieces.length} of 4 chosen` })
      const box = el('div', { className: 'sl-picklist sl-mail-pieces' }, all.length ? all.map((p) => {
        const input = el('input', { type: 'checkbox', checked: f.pieces.includes(p.slug) })
        const row = el('label', { className: `sl-pick-row ${f.pieces.includes(p.slug) ? 'on' : ''}` }, [input, el('img', { src: p.src, alt: '', loading: 'lazy' }), el('span', { className: 'sl-pick-who' }, [el('strong', { textContent: p.title }), el('small', { textContent: [p.price, p.date ? date(p.date) : ''].filter(Boolean).join(' · ') })])])
        input.addEventListener('change', () => {
          if (input.checked && f.pieces.length >= 4) { input.checked = false; count.textContent = 'Four at most'; return }
          f.pieces = input.checked ? [...f.pieces, p.slug] : f.pieces.filter((s) => s !== p.slug)
          row.classList.toggle('on', input.checked); count.textContent = `${f.pieces.length} of 4 chosen`; eState.touched = true; preview()
        })
        return row
      }) : [el('p', { className: 'sl-pick-empty', textContent: 'Nothing is in the shop just now.' })])
      box.dataset.keepScroll = 'mail-pieces'
      return [el('div', { className: 'sl-pick-top' }, [count, el('small', { className: 'sl-hint', textContent: 'Newest first. Each shows with its picture, name and price.' })]), box]
    }
    if (SOCIAL[r]) return [field(SOCIAL[r], mailInput('buttonUrl', { placeholder: 'https://…', spellcheck: false })), el('p', { className: 'sl-hint', textContent: 'The button in the email opens it. Filled in from your social links (Site → Brand & contact) when there is one: paste the link to the new one.' })]
    if (r === 'event') {
      const ev = f.event || {}
      const list = eState.info.events
      const s = list.length ? el('select', { className: 'sl-select', ariaLabel: 'Convention' }, [el('option', { value: '', textContent: 'Pick one of your conventions…' }), ...list.map((e) => el('option', { value: e.slug, textContent: [e.name, e.when].filter(Boolean).join(' · '), selected: ev.name === e.name }))]) : null
      if (s) s.addEventListener('change', () => { const e = list.find((x) => x.slug === s.value); if (!e) return; f.event = { name: e.name, when: e.when, place: e.place, role: e.role }; if (e.url) f.buttonUrl = e.url; eState.touched = true; draw(); preview() })
      const part = (k, label, ph) => {
        const i = el('input', { type: 'text', className: 'sl-input', value: ev[k] || '', placeholder: ph, maxLength: 120 })
        i.dataset.focus = `mail-event-${k}`
        i.addEventListener('input', () => { f.event = { ...(f.event || {}), [k]: i.value }; eState.touched = true; preview() })
        return field(label, i)
      }
      return [s ? field('From Conventions', s) : el('p', { className: 'sl-hint', textContent: 'No conventions on the site yet: type the details here (or add it under Conventions).' }),
        el('div', { className: 'sl-pair' }, [part('name', 'Name', 'Comic Con Portugal'), part('when', 'When', '14–15 Nov 2026'), part('place', 'Where', 'Porto'), part('role', 'Where to find you there', 'Artist Alley, table 42')]),
        el('p', { className: 'sl-hint', textContent: 'Shown in a box in the email. In the words, {event} stands for its name.' })]
    }
    return [el('p', { className: 'sl-hint', textContent: r === 'commissions' ? 'The button opens the commission request form on your site.' : 'Nothing more to pick: write your news below.' })]
  }

  // sending: a few at a time, until done, stopped, or the day's limit
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
  const runMailing = async (m) => {
    if (eState.run && eState.run.going) return
    const run = eState.run = { going: true, stop: false, mailing: m, message: '', capped: false }
    draw()
    let busy = 0
    while (!run.stop) {
      const r = await mApi({ action: 'adminMailSend', id: m.id })
      if (r.json.mailing) run.mailing = r.json.mailing
      if (r.json.today && eState.info) eState.info.today = r.json.today
      if (r.status === 409 && busy++ < 10) { await sleep(3000); continue }
      if (!r.ok) { run.message = r.json.message || 'Sending stopped: the site did not answer. Resume it from the list below.'; break }
      busy = 0
      if (r.json.capped) { run.capped = true; run.message = r.json.message; break }
      if (run.mailing.done) break
      draw()
    }
    run.going = false
    if (run.stop && !run.mailing.done) run.message = 'Stopped. Resume it from the list below whenever you like: nobody gets it twice.'
    draw()
    loadMailInfo()
  }
  const startMailing = async () => {
    const f = eState.fields
    const n = countFor(eState.audience)
    ask({
      title: `Send to ${many(n, 'person', 'people')}?`,
      text: `"${f.subject}" · ${AUDIENCE_SHORT[eState.audience]}`,
      more: `It goes out ${eState.info.batch} at a time while this page stays open, each with their first name and an unsubscribe link. You can stop and carry on later: nobody gets it twice.${eState.audience === 'all' ? ' This goes to everyone with an account, also those who said no to news: only for notices about the service.' : ''}`,
      yes: `Send to ${many(n, 'person', 'people')}`,
      plain: true,
      run: async () => {
        const r = await mApi({ action: 'adminMailStart', fields: f, audience: eState.audience })
        if (!r.ok) return r.json.message || 'It could not be started. Try again.'
        setTimeout(() => runMailing(r.json.mailing), 0)
        return ''
      },
    })
  }
  const sendTest = async (b) => {
    b.disabled = true; b.textContent = 'Sending…'
    const r = await mApi({ action: 'adminMailTest', fields: eState.fields, audience: eState.audience })
    eState.note = r.ok ? { ok: true, text: `Test sent to ${r.json.to}` } : { ok: false, text: r.json.message || 'Not sent. Try again.' }
    draw()
  }
  addEventListener('beforeunload', (e) => { if (eState.run && eState.run.going) { e.preventDefault(); e.returnValue = '' } })

  const bar = (pct) => {
    const b = el('div', { className: 'sl-mail-bar', role: 'progressbar', ariaLabel: 'Sent so far' }, [el('i', { style: `width:${pct}%` })])
    b.setAttribute('aria-valuenow', String(pct))
    return b
  }
  const progress = () => {
    const run = eState.run
    if (!run) return null
    const m = run.mailing
    const handled = m.sent + m.failed + m.skipped
    const pct = m.total ? Math.round((handled / m.total) * 100) : 100
    return el('div', { className: `sl-mail-run ${m.done ? 'is-done' : run.capped || run.message ? 'is-held' : ''}` }, [
      el('div', { className: 'sl-mail-run-top' }, [
        el('strong', { textContent: m.done ? `Sent: ${m.subject}` : run.going ? `Sending: ${m.subject}` : `Paused: ${m.subject}` }),
        run.going ? button(run.stop ? 'Stopping…' : 'Stop', () => { run.stop = true; draw() }, 'ia-btn ghost') : button('Close', () => { eState.run = null; draw() }, 'sl-link'),
      ]),
      bar(pct),
      el('p', { className: 'sl-hint', textContent: `${m.sent} of ${m.total} sent${m.failed ? ` · ${m.failed} failed` : ''}${m.skipped ? ` · ${m.skipped} left out (unsubscribed or gone since)` : ''}` }),
      run.message ? el('p', { className: `sl-said ${run.capped ? 'is-bad' : ''}`, textContent: run.message }) : null,
      run.capped ? button('Resume', () => runMailing(m), 'ia-btn sl-go') : null,
    ])
  }

  const mailRow = (m) => {
    const st = m.done ? (m.ended ? ['cancelled', 'Stopped'] : ['paid', 'Sent']) : ['packed', 'Not finished']
    const running = eState.run && eState.run.going && eState.run.mailing.id === m.id
    return el('div', { className: 'sl-row is-static', role: 'row' }, [
      el('span', {}, [el('strong', { textContent: date(new Date(m.createdAt).getTime()) }), el('small', { textContent: m.finishedAt ? `finished ${date(new Date(m.finishedAt).getTime(), true)}` : m.lastAt ? `last sent ${date(new Date(m.lastAt).getTime(), true)}` : 'not sent yet' })]),
      el('span', {}, [el('strong', { textContent: m.subject }), el('small', { textContent: `${reasonName(m.reason)} · ${AUDIENCE_SHORT[m.audience] || m.audience}` })]),
      el('span', {}, [el('strong', { textContent: `${m.sent} / ${m.total}` }), el('small', { textContent: [m.failed ? `${m.failed} failed` : '', m.skipped ? `${m.skipped} left out` : ''].filter(Boolean).join(' · ') || 'sent' })]),
      el('span', {}, [badge(st[0], running ? 'Sending' : st[1])]),
      el('span', { className: 'sl-disc-links' }, [
        !m.done && !running ? button('Resume', () => ask({ title: 'Carry on sending?', text: `"${m.subject}": ${m.total - m.sent - m.failed - m.skipped} still to go.`, more: 'It picks up where it stopped. Those who already have it do not get it again.', yes: 'Resume', plain: true, run: async () => { setTimeout(() => runMailing(m), 0); return '' } }), 'sl-link') : null,
        button('Use again', () => {
          eState.fields = { ...m.fields, pieces: [...(m.fields.pieces || [])] }
          eState.audience = m.audience; eState.touched = true; eState.note = null
          draw(); preview(); root.scrollTop = 0
        }, 'sl-link'),
        !m.done && !running ? button('Give up the rest', () => ask({ title: 'Give up the rest?', text: `"${m.subject}": ${m.sent} of ${m.total} sent.`, more: 'Nobody else gets it. It stays in this list, marked Stopped.', yes: 'Give up the rest', run: async () => { const r = await mApi({ action: 'adminMailEnd', id: m.id }); if (!r.ok) return r.json.message || 'Try again.'; loadMailInfo(); return '' } }), 'sl-link sl-danger') : null,
      ]),
    ])
  }

  const emailsView = () => {
    const info = eState.info
    const head_ = head('Emails', 'Write to your customers: news, a discount, new pieces, a convention. Ready-made emails in your own voice to start from, a preview of exactly what they get, then send.', [
      button(eState.loading ? 'Loading…' : 'Refresh', () => { loadMailInfo(); loadDiscounts() }),
    ])
    if (eState.problem) return [head_, el('div', { className: 'sl-notice is-bad' }, [el('strong', { textContent: 'Emails are not available' }), el('p', { textContent: eState.problem })])]
    if (!info) return [head_, el('p', { className: 'sl-count', textContent: 'Loading…' })]
    const f = eState.fields
    const n = countFor(eState.audience)
    // 1. who
    const seg = el('div', { className: 'sl-seg is-two', role: 'radiogroup', ariaLabel: 'Who it goes to' }, info.audiences.map((a) => {
      const b = el('button', { type: 'button', role: 'radio', ariaChecked: String(eState.audience === a.id), className: `sl-stage ${eState.audience === a.id ? 'on' : ''}`, textContent: a.id === 'news' ? 'Agreed to news' : 'All account holders' })
      b.addEventListener('click', () => { eState.audience = a.id; draw(); preview() })
      return b
    }))
    const who = [seg,
      el('p', { className: 'sl-mail-count' }, [el('b', { textContent: String(n) }), ` ${n === 1 ? 'person' : 'people'} · ${info.audiences.find((a) => a.id === eState.audience).label}`]),
      eState.audience === 'all' ? el('p', { className: 'sl-mail-warn', textContent: 'Only for notices about the service (a change to the shop, to accounts, to how their data is kept). News, offers and new pieces may only go to those who agreed to news: that is the law in the EU.' }) : null,
      el('p', { className: 'sl-hint', textContent: 'Accounts with a confirmed email only. Test addresses (example.com and the like) are never counted or sent to.' })]
    // 2. why
    const reasons = el('select', { className: 'sl-select', ariaLabel: 'Reason' }, [el('option', { value: '', textContent: 'Choose a reason…', selected: !f }), ...Object.entries(info.templates).map(([k, t]) => el('option', { value: k, textContent: t.label, selected: Boolean(f && f.reason === k) }))])
    reasons.addEventListener('change', () => pickReason(reasons.value))
    // 3. the words
    const words = f ? [
      el('div', { className: 'sl-pair' }, [field('Subject', mailInput('subject', { maxLength: 150 })), field('Small label', mailInput('kicker', { maxLength: 40, placeholder: 'Shop news' }))]),
      field('Heading', mailInput('title', { maxLength: 120 })),
      field('The text', mailInput('text', { maxLength: 5000 }, true)),
      el('p', { className: 'sl-hint', textContent: 'Each line is a paragraph. Every email starts with "Hi" and the person\'s first name, and ends with a link to unsubscribe.' }),
      el('div', { className: 'sl-pair' }, [field('Button words', mailInput('buttonLabel', { maxLength: 60, placeholder: 'Leave empty for no button' })), SOCIAL[f.reason] ? null : field('Button link', mailInput('buttonUrl', { maxLength: 500, placeholder: '/shop or https://…', spellcheck: false }))]),
    ] : []
    // 4. send
    const today = info.today || { sent: 0, cap: 450 }
    const going = Boolean(eState.run && eState.run.going)
    const testBtn = button('Send a test to me', () => sendTest(testBtn), 'ia-btn ghost')
    testBtn.disabled = !f || !info.testTo || going
    const sendBtn = button(`Send to ${many(n, 'person', 'people')}`, startMailing, 'ia-btn sl-go')
    sendBtn.disabled = !f || !n || going || today.sent >= today.cap
    const frame = el('iframe', { className: 'sl-mail-frame', title: 'Preview of the email', srcdoc: eState.html || '' })
    frame.setAttribute('sandbox', '') // the email's links stay put
    return [
      head_,
      el('div', { className: 'sl-mail-grid' }, [
        el('section', { className: 'sl-form sl-mail-form' }, [
          el('h2', { className: 'sl-h2', textContent: 'New email' }),
          step(1, 'Who it goes to', who),
          step(2, 'Why you are writing', [reasons, ...(f ? extras() : [el('p', { className: 'sl-hint', textContent: 'Each reason starts you off with a ready-made email in your own words. You can change all of it.' })])]),
          f ? step(3, 'The email', words) : null,
          f ? step(4, 'Check and send', [
            el('div', { className: 'sl-line' }, [testBtn, sendBtn]),
            el('p', { className: 'sl-hint', textContent: `${info.testTo ? `The test goes to ${info.testTo}${info.testIsFake ? ' (a test address: it is only written in the server\'s log)' : ''}.` : 'Add your email under Site → Brand & contact to get tests.'} Sent by mailings in the last 24 hours: ${today.sent} of ${today.cap} (Gmail allows about 500 a day).` }),
            today.sent >= today.cap ? el('p', { className: 'sl-said is-bad', textContent: "Gmail's daily limit is near: carry on tomorrow." }) : null,
            eState.note ? el('p', { className: `sl-said ${eState.note.ok ? '' : 'is-bad'}`, textContent: eState.note.text }) : null,
          ]) : null,
          progress(),
        ]),
        el('aside', { className: 'sl-mail-side' }, [
          el('div', { className: 'sl-mail-side-head' }, [el('span', { textContent: 'Preview' }), f ? el('small', { textContent: 'As "Alex" sees it' }) : null]),
          f ? frame : el('div', { className: 'sl-mail-empty', textContent: 'Choose a reason, and the email shows here as it will arrive.' }),
        ]),
      ]),
      el('h2', { className: 'sl-h2 is-list', textContent: 'Sent before' }),
      info.mailings.length ? el('div', { className: 'sl-table is-mailings', role: 'table' }, [headRow(['Started', 'Subject', 'Sent', 'Status']), ...info.mailings.map(mailRow)])
        : el('div', { className: 'sl-empty' }, [el('strong', { textContent: 'Nothing sent yet' }), el('p', { textContent: 'Your mailings show here, with how far each got.' })]),
    ]
  }

  // ---------- drawing ----------
  // shell.js keeps the counts in the navigation and on the Overview from this
  let telling = false
  const tellShell = () => { if (telling) return; telling = true; queueMicrotask(() => { telling = false; dispatchEvent(new Event('ia-sales-change')) }) }
  const draw = () => {
    tellShell()
    if (!root) return
    const scroll = root.scrollTop
    // a search box being typed in, and any list scrolled inside, stay as they are
    const searches = [...root.querySelectorAll('.sl-search')]
    const typing = searches.indexOf(document.activeElement)
    const caret = typing >= 0 ? document.activeElement.selectionStart : null
    const hadModal = Boolean(root.querySelector('.sl-modal-shade')) // drawn again: no fade in
    const inner = Object.fromEntries([...root.querySelectorAll('[data-keep-scroll]')].map((n) => [n.dataset.keepScroll, n.scrollTop]))
    const onCommissions = state.view === 'orders' && state.ordersTab === 'commissions'
    const open = state.view === 'orders' && !onCommissions && state.open && state.orders.find((o) => o.id === state.open)
    const views = { orders: onCommissions ? commissionsView : ordersView, customers: customersView, discounts: discountsView, emails: emailsView }
    const panels = open ? orderPanel(open) : onCommissions && cState.open ? commissionPanel(cState.detail) : []
    // typing in an order's panel: leave it as it is. In a commission's window (its words are kept as
    // they are typed) it is drawn again, so a message arriving shows at once, and the field gets the
    // focus and the caret back
    const active = document.activeElement
    const typingIn = active && root.contains(active) && active.matches('.sl-panel input, .sl-panel textarea') ? active : null
    const draftKey = typingIn && typingIn.closest('.sl-panel.is-commission') ? typingIn.dataset.draft || '' : ''
    if (typingIn && !draftKey) return
    let sel = null
    if (draftKey) { try { sel = [typingIn.selectionStart, typingIn.selectionEnd, typingIn.scrollTop] } catch { sel = null } }
    // a field of the new email being typed in (Emails) keeps the focus and the caret too
    const focusKey = !draftKey && active && root.contains(active) && active.dataset && active.dataset.focus ? active.dataset.focus : ''
    let fsel = null
    if (focusKey) { try { fsel = [active.selectionStart, active.selectionEnd, active.scrollTop] } catch { fsel = null } }
    root.replaceChildren(el('div', { className: 'sl-inner' }, views[state.view]()), ...panels, ...modalLayer())
    root.scrollTop = scroll
    if (hadModal) root.querySelector('.sl-modal-shade')?.classList.add('is-still')
    root.querySelectorAll('[data-keep-scroll]').forEach((n) => { if (inner[n.dataset.keepScroll]) n.scrollTop = inner[n.dataset.keepScroll] })
    if (typing >= 0) { const s = root.querySelectorAll('.sl-search')[typing]; if (s) { s.focus(); try { s.setSelectionRange(caret, caret) } catch { /* not a text box */ } } }
    if (focusKey) {
      const again = root.querySelector(`[data-focus="${focusKey}"]`)
      if (again) { again.focus({ preventScroll: true }); if (fsel) { try { again.setSelectionRange(fsel[0], fsel[1]); again.scrollTop = fsel[2] } catch { /* not a text box */ } } }
    }
    if (draftKey) {
      const again = root.querySelector(`.sl-panel.is-commission [data-draft="${draftKey}"]`)
      if (again) { again.focus({ preventScroll: true }); if (sel) { try { again.setSelectionRange(sel[0], sel[1]); again.scrollTop = sel[2] } catch { /* not a text box */ } } }
    }
  }
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !root || !root.isConnected) return
    if (state.modal) { closeModal(); return }
    if (state.view === 'orders' && state.ordersTab === 'commissions' && cState.open) { closeCommission(); return }
    if (state.open) { state.open = null; draw() }
  })

  /* Called by shell.js whenever the address changes to a Sales screen. */
  const show = (view, params) => {
    const before = state.view
    state.view = ['customers', 'discounts', 'emails'].includes(view) ? view : 'orders'
    if (state.view === 'orders') state.o.customer = params.get('customer') || ''
    // a link from the Overview can open a list already narrowed: ?stage=to-ship, &chip=unread
    if (state.view === 'orders' && ORDER_CHIPS.some((c) => c[0] === params.get('stage'))) { state.o.stage = params.get('stage'); state.o.page = 1 }
    if (state.view === 'orders' && C_CHIPS.some((c) => c[0] === params.get('chip'))) { cState.chip = params.get('chip'); cState.page = 1 }
    // Orders has two tabs: the shop's orders, and the commissions (?tab=commissions, &c=<id> opens one)
    const tabBefore = state.ordersTab
    if (state.view === 'orders') state.ordersTab = params.get('tab') === 'commissions' ? 'commissions' : 'shop'
    if (state.view === 'orders' && state.ordersTab === 'commissions') {
      const id = params.get('c') || ''
      if (id && id !== cState.open) { cState.open = id; cState.detail = null; cState.stick = true; cFails = 0; loadCommission(id); setTimeout(cListen, 0) }
      if (!id && tabBefore === 'commissions' && cState.open) { cState.open = null; cState.detail = null }
    }
    // the commissions are asked for once on Orders too, for the count on their tab
    if (state.view === 'orders' && !cState.loaded && !cState.loading) loadCommissions(true)
    if (before !== state.view) { state.open = null; state.modal = null }
    // Customers shows each one's codes; Discounts offers every customer, account holders too
    if (state.view !== 'orders' && !dState.loaded && !dState.loading) loadDiscounts()
    if (state.view !== 'orders' && !mState.loaded && !mState.loading) loadMembers()
    // Emails: who it can go to and what can go in it, asked afresh each time the screen opens
    if (state.view === 'emails' && before !== 'emails' && !eState.loading) loadMailInfo()
    if (!state.loaded && !state.loading) load()
    else draw()
    if (before !== view || !state.loaded) readSwitch().then(draw)
    if (before !== state.view) root.scrollTop = 0
  }

  /* What the Overview shows at a glance, and the count beside Orders in the navigation. */
  const glance = () => ({
    ready: state.loaded && !state.problem,
    toShip: visible(state.orders, 'orders').filter(ORDER_CHIPS[1][2]).length,
    commissions: cState.loaded && !cState.problem,
    unread: cUnread(),
    toQuote: cState.list.filter((c) => ['requested', 'discussing'].includes(c.status)).length,
    customers: state.loaded && (mState.loaded || mState.problem) ? customers().length : null,
  })
  /* Asked for by shell.js away from these screens (the Overview, every few minutes): the orders
     and commissions again, and the members once, so the counts are up to date. */
  let fetchedAt = 0
  const prefetch = async ({ members = false } = {}) => {
    const jobs = []
    if (Date.now() - fetchedAt > 60 * 1000) {
      fetchedAt = Date.now()
      jobs.push(readSwitch().then(() => (state.loading ? null : load())))
      if (!cState.loading) jobs.push(loadCommissions(true))
    }
    if (members && !mState.loaded && !mState.loading) jobs.push(loadMembers())
    await Promise.all(jobs)
  }

  return {
    mount,
    show,
    glance,
    prefetch,
    links: [
      { view: 'orders', href: '#/sales/orders', label: 'Orders', icon: 'M6 3h12l1 4H5z M5 7h14v13H5z M9 11h6 M9 15h4' },
      { view: 'discounts', href: '#/sales/discounts', label: 'Discount codes', icon: 'M20 12l-8 8-8.5-8.5V4h7.5z M8 8.01h.01 M15 9l-6 6 M10 9.5h.01 M14 14.5h.01' },
      { view: 'customers', href: '#/sales/customers', label: 'Customers', icon: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20v-1a5.5 5.5 0 0 1 5.5-5.5h2A5.5 5.5 0 0 1 15.5 19v1 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18 13.7a5.5 5.5 0 0 1 3.5 5.3v1' },
      { view: 'emails', href: '#/sales/emails', label: 'Emails', icon: 'M3 5.5h18v13H3z M3.5 6l8.5 7 8.5-7' },
    ],
  }
})()
