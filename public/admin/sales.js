/* Milton Aguiar admin: Sales.
   Two screens under a line at the foot of the navigation, for keeping track of what the shop sells:
   - Orders: every purchase made through the shop's Stripe checkout, newest first, with totals at
     the top, chips to narrow them by where they are up to (to ship, shipped...), a search, a
     period and a sort, and a panel per order with what was bought, who bought it, where it goes,
     and where it is up to (status, tracking number and a note, kept on the order in Stripe);
   - Customers: everyone who has bought, and everyone with an account on the site, with what they
     have spent; one opens everything about them, and the rewards gifted to them;
   - Discounts: a percentage off, for a while, for chosen customers (a code each) or anyone with
     a shared code.
   The orders come from /api/orders, the codes from /api/discounts (both kept in Stripe), the
   accounts from /api/account, each with the admin's own pass.
   shell.js puts the links in the navigation and shows this screen at #/sales/orders,
   #/sales/customers and #/sales/discounts. */
window.IASales = (() => {
  const el = (tag, props = {}, kids = []) => {
    const n = Object.assign(document.createElement(tag), props)
    kids.forEach((k) => k != null && k !== false && n.append(k))
    return n
  }
  const STAGES = [['new', 'New'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']]
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

  // ---------- the Show or hide switch for test data ----------
  /* Read from content/site/visibility.json as it is now: on the live site through the admin's
     own GitHub access (so a change shows before the site is rebuilt), on this computer from the
     file itself. Read again each time the Sales screens open. */
  // test data, screen by screen (Show or hide → Sales screens): orders, customers, discount codes
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
  const hiddenNote = (all, what, kind) => (!showTest[kind] && all.some((x) => x.test) ? el('div', { className: 'sl-notice' }, [el('strong', { textContent: 'Test data is hidden' }), el('p', { textContent: `${all.filter((x) => x.test).length} test ${what} left out. Show them again under Show or hide → Sales screens.` })]) : null)

  // ---------- the screen ----------
  let root = null
  const mount = () => (root = root || el('main', { className: 'ia-sales', ariaLabel: 'Sales' }))

  const load = async () => {
    state.loading = true; draw()
    const r = await api('GET')
    state.loading = false; state.loaded = true
    if (r.ok) { state.orders = (r.json.orders || []).sort((a, b) => b.created - a.created); state.sample = Boolean(r.json.sample); state.mode = r.json.mode || ''; state.problem = null }
    else state.problem = { code: r.json.code || '', status: r.status, message: r.json.message || 'The orders could not be loaded.' }
    draw()
  }

  const head = (title, lead, actions) => el('header', { className: 'sl-head' }, [
    el('div', {}, [el('div', { className: 'ia-kicker', textContent: 'Sales' }), el('h1', { textContent: title }), el('p', { className: 'ia-lead', textContent: lead })]),
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
        stat('Sales', money(income, cur), PERIODS.find((p) => p[0] === f.period)[1]),
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
      })) : el('p', { className: 'sl-dim', textContent: 'There are no rewards to give yet. Add them under Shop → Rewards.' })
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
    })) : el('p', { className: 'sl-dim', textContent: 'There are no rewards to give yet. Add them under Shop → Rewards.' })
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
      head('Discounts', 'Make a discount for chosen customers (each gets a code of their own) or one code for anyone you give it to. Buyers type it in the cart when they pay.', [
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
  /* Sales → Orders → Commissions (#/sales/orders?tab=commissions): every commission asked for on
     the site (api/commissions.js), a conversation with each customer, the quote they accept and
     pay, and the stages of the work. One opens in a panel; asked again every 20 seconds while this
     tab is showing. What is typed in the panel is kept while the screen is drawn again. */
  const C_STATUS = [['requested', 'New'], ['discussing', 'Discussing'], ['quoted', 'Quoted'], ['paid', 'Paid'], ['sketch', 'Sketch'], ['inks', 'Inks'], ['colours', 'Colours'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']]
  const cStatusName = Object.fromEntries(C_STATUS)
  const C_WORK = [['sketch', 'Sketch'], ['inks', 'Inks'], ['colours', 'Colours'], ['delivered', 'Delivered'], ['cancelled', 'Cancel']]
  const C_CHIPS = [
    ['all', 'All', () => true],
    ['unread', 'Unread', (c) => c.unread > 0],
    ['to-answer', 'To quote', (c) => ['requested', 'discussing'].includes(c.status)],
    ...C_STATUS.map(([k, t]) => [k, t, (c) => c.status === k]),
  ]
  const cState = { loaded: false, loading: false, list: [], problem: '', chip: 'all', q: '', page: 1, per: perSaved(), open: null, detail: null, detailProblem: '', drafts: {}, said: '', stick: true }
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
  const loadCommission = async (id) => {
    const r = await cApi({ action: 'adminGet', id })
    if (cState.open !== id) return
    if (r.ok) { cState.detail = r.json.commission; cState.detailProblem = ''; const row = cState.list.find((x) => x.id === id); if (row) row.unread = 0 } else cState.detailProblem = r.json.message || 'It could not be opened.'
    draw()
  }
  const openCommission = (id) => {
    cState.open = id; cState.detail = cState.detail && cState.detail.id === id ? cState.detail : null; cState.detailProblem = ''; cState.said = ''; cState.stick = true
    history.replaceState(null, '', `#/sales/orders?tab=commissions&c=${encodeURIComponent(id)}`)
    draw(); loadCommission(id)
  }
  const closeCommission = () => {
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
  // every 20 seconds while the Commissions tab shows (and this browser tab is in view)
  setInterval(() => {
    if (!root || !root.isConnected || document.visibilityState !== 'visible' || state.view !== 'orders' || state.ordersTab !== 'commissions') return
    if (!document.documentElement.hasAttribute('data-ia-sales')) return
    loadCommissions(true)
    if (cState.open) loadCommission(cState.open)
  }, 20000)

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
          el('span', {}, [badge(`c-${c.status}`, cStatusName[c.status] || c.status)]),
          el('span', { className: 'sl-c-total' }, [el('strong', { textContent: c.price != null ? money(c.price, c.currency) : '—' }), el('small', { textContent: c.paid ? 'Paid' : c.price != null ? 'Not paid yet' : 'No quote yet' })]),
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
  const commissionPanel = (c) => {
    const id = cState.open
    const draft = cState.drafts[id] || (cState.drafts[id] = {})
    const block = (title, kids, cls = '') => el('section', { className: `sl-block ${cls}` }, [el('h3', { textContent: title }), ...kids])
    const said = el('p', { className: 'sl-said', role: 'status', textContent: cState.said })
    const fail = (r) => { said.classList.add('is-bad'); said.textContent = r.json.message || 'That did not work. Try again.' }
    const run = async (btn, body, done) => {
      btn.disabled = true; said.classList.remove('is-bad'); said.textContent = 'Saving…'
      const r = await cApi({ id, ...body })
      btn.disabled = false
      if (!r.ok) return fail(r)
      keepCommission(r.json.commission); done(); cState.stick = true
      draw()
    }
    const input = (key, props, tag = 'input') => {
      const n = el(tag, { className: 'sl-input', ...props })
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
      el('div', { className: 'sl-msg-bubble' }, [
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
    const price = input('price', { type: 'number', min: '1', step: '1', inputMode: 'decimal', value: q ? String(q.price) : '', placeholder: 'For example 250' })
    const includes = input('includes', { rows: 3, maxLength: 1000, value: q ? q.includes : '', placeholder: 'For example: A3 full colour, signed, high-resolution file' }, 'textarea')
    const due = input('due', { type: 'date', value: q ? ymd(q.due) : '' })
    const shipBox = input('ship', { type: 'checkbox', className: 'sl-switch-box', checked: q ? Boolean(q.ship) : false })
    const ship = el('label', { className: 'sl-switch' }, [shipBox, el('span', { className: 'sl-switch-track', ariaHidden: 'true' }), el('span', {}, [el('strong', { textContent: 'Post it to me' }), el('small', { textContent: 'On: the checkout asks for their address. Off: a digital piece.' })])])
    const sendQuote = button(q ? 'Send the new quote' : 'Send quote', () => {
      const p = Number(draft.price ?? price.value)
      if (!(p >= 1)) { said.classList.add('is-bad'); said.textContent = 'Put a price first.'; price.focus(); return }
      if (!String(draft.includes ?? includes.value).trim()) { said.classList.add('is-bad'); said.textContent = 'Say what the price includes.'; includes.focus(); return }
      run(sendQuote, { action: 'adminQuote', price: p, includes: draft.includes ?? includes.value, due: draft.due ?? due.value, ship: draft.ship ?? shipBox.checked }, () => { ['price', 'includes', 'due', 'ship'].forEach((k) => delete draft[k]); cState.said = 'Quote sent ✓ They have an email.' })
    }, 'ia-btn')
    const quoteForm = el('div', { className: 'sl-quote-form' }, [
      el('div', { className: 'sl-quote-row' }, [
        el('label', { className: 'sl-label' }, [el('span', { textContent: 'Price (€)' }), price]),
        el('label', { className: 'sl-label' }, [el('span', { textContent: 'Ready by' }), due]),
      ]),
      el('label', { className: 'sl-label' }, [el('span', { textContent: 'What is included' }), includes]),
      ship,
      el('div', { className: 'sl-save' }, [sendQuote, el('small', { className: 'sl-hint', textContent: 'Full price, paid up front. They accept and pay it in their account.' })]),
    ])
    const quoteNow = q ? el('div', { className: 'sl-quote-now' }, [
      el('strong', { textContent: money(q.price, q.currency) }),
      el('span', {}, linked(q.includes)),
      el('small', { textContent: [q.due ? `Ready by ${date(new Date(q.due).getTime())}` : '', q.ship ? 'Posted to them' : 'Digital', `sent ${date(new Date(q.at).getTime(), true)}`].filter(Boolean).join(' · ') }),
    ]) : null

    // the stages of the work: once it is paid (cancel any time)
    const note = input('note', { placeholder: 'A note for them with the step (optional)', maxLength: 2000 })
    const stages = el('div', { className: 'sl-stages', role: 'group', ariaLabel: 'Stage' }, C_WORK.map(([k, t]) => {
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
          el('div', { className: 'sl-badges' }, [badge(`c-${c.status}`, cStatusName[c.status] || c.status), paid ? badge('paid', p.refunded ? 'Refunded' : 'Paid') : null, c.test ? badge('test', 'Test') : null]),
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
        block('Conversation', [thread, el('div', { className: 'sl-reply' }, [reply, links, el('div', { className: 'sl-save' }, [send, el('small', { className: 'sl-hint', textContent: 'They see it in their account and get an email.' })])])]),
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
        block('Stage', [stages, note, el('small', { className: 'sl-hint', textContent: paid ? 'Each step is saved at once, with a note in the conversation and an email to them.' : 'The work stages open once it is paid.' })]),
        block('Payment', p && p.paidAt ? [
          el('div', { className: 'sl-sum' }, [el('span', { textContent: 'Paid' }), el('strong', { textContent: money(p.amount, p.currency) })]),
          el('div', { className: 'sl-sum is-method' }, [el('span', { textContent: 'With' }), el('strong', { textContent: p.paidWith || p.provider })]),
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

  // ---------- drawing ----------
  const draw = () => {
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
    const views = { orders: onCommissions ? commissionsView : ordersView, customers: customersView, discounts: discountsView }
    const panels = open ? orderPanel(open) : onCommissions && cState.open ? commissionPanel(cState.detail) : []
    const keep = document.activeElement && root.contains(document.activeElement) && document.activeElement.matches('.sl-panel input, .sl-panel textarea') // typing in a panel: leave it as it is
    if (keep) return
    root.replaceChildren(el('div', { className: 'sl-inner' }, views[state.view]()), ...panels, ...modalLayer())
    root.scrollTop = scroll
    if (hadModal) root.querySelector('.sl-modal-shade')?.classList.add('is-still')
    root.querySelectorAll('[data-keep-scroll]').forEach((n) => { if (inner[n.dataset.keepScroll]) n.scrollTop = inner[n.dataset.keepScroll] })
    if (typing >= 0) { const s = root.querySelectorAll('.sl-search')[typing]; if (s) { s.focus(); try { s.setSelectionRange(caret, caret) } catch { /* not a text box */ } } }
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
    state.view = ['customers', 'discounts'].includes(view) ? view : 'orders'
    if (state.view === 'orders') state.o.customer = params.get('customer') || ''
    // Orders has two tabs: the shop's orders, and the commissions (?tab=commissions, &c=<id> opens one)
    const tabBefore = state.ordersTab
    if (state.view === 'orders') state.ordersTab = params.get('tab') === 'commissions' ? 'commissions' : 'shop'
    if (state.view === 'orders' && state.ordersTab === 'commissions') {
      const id = params.get('c') || ''
      if (id && id !== cState.open) { cState.open = id; cState.detail = null; cState.stick = true; loadCommission(id) }
      if (!id && tabBefore === 'commissions' && cState.open) { cState.open = null; cState.detail = null }
    }
    // the commissions are asked for once on Orders too, for the count on their tab
    if (state.view === 'orders' && !cState.loaded && !cState.loading) loadCommissions(true)
    if (before !== state.view) { state.open = null; state.modal = null }
    // Customers shows each one's codes; Discounts offers every customer, account holders too
    if (state.view !== 'orders' && !dState.loaded && !dState.loading) loadDiscounts()
    if (state.view !== 'orders' && !mState.loaded && !mState.loading) loadMembers()
    if (!state.loaded && !state.loading) load()
    else draw()
    if (before !== view || !state.loaded) readSwitch().then(draw)
    if (before !== state.view) root.scrollTop = 0
  }

  return {
    mount,
    show,
    links: [
      { view: 'orders', href: '#/sales/orders', label: 'Orders', icon: 'M6 3h12l1 4H5z M5 7h14v13H5z M9 11h6 M9 15h4' },
      { view: 'discounts', href: '#/sales/discounts', label: 'Discounts', icon: 'M20 12l-8 8-8.5-8.5V4h7.5z M8 8.01h.01 M15 9l-6 6 M10 9.5h.01 M14 14.5h.01' },
      { view: 'customers', href: '#/sales/customers', label: 'Customers', icon: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20v-1a5.5 5.5 0 0 1 5.5-5.5h2A5.5 5.5 0 0 1 15.5 19v1 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18 13.7a5.5 5.5 0 0 1 3.5 5.3v1' },
    ],
  }
})()
