/* Milton Aguiar admin: Sales.
   Two screens under a line at the foot of the navigation, for keeping track of what the shop sells:
   - Orders: every purchase made through the shop's Stripe checkout, newest first, with totals at
     the top, chips to narrow them by where they are up to (to ship, shipped...), a search, a
     period and a sort, and a panel per order with what was bought, who bought it, where it goes,
     and where it is up to (status, tracking number and a note, kept on the order in Stripe);
   - Customers: everyone who has bought, with what they have spent; one opens their orders;
   - Discounts: codes for money off, for everyone or chosen customers, for as long as the admin says.
   The orders come from /api/orders (api/orders.js), with the admin's own pass. There is no
   database and no customer accounts on the site: Stripe holds the orders.
   shell.js puts the two links in the navigation and shows this screen at #/sales/orders and
   #/sales/customers. */
window.IASales = (() => {
  const el = (tag, props = {}, kids = []) => {
    const n = Object.assign(document.createElement(tag), props)
    kids.forEach((k) => k != null && k !== false && n.append(k))
    return n
  }
  const STAGES = [['new', 'New'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled']]
  /* The carriers to pick from, and where each one's parcels are followed (the same list as api/_orders.js). */
  const CARRIERS = {
    ctt: ['CTT', (n) => `https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=${n}`],
    dpd: ['DPD', (n) => `https://tracking.dpd.de/status/en_US/parcel/${n}`],
    dhl: ['DHL', (n) => `https://www.dhl.com/pt-en/home/tracking.html?tracking-id=${n}`],
    ups: ['UPS', (n) => `https://www.ups.com/track?tracknum=${n}`],
    gls: ['GLS', (n) => `https://gls-group.com/PT/en/parcel-tracking?match=${n}`],
    fedex: ['FedEx', (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}`],
    correos: ['Correos', (n) => `https://www.correos.es/es/en/tools/tracker/items/details?tracking-number=${n}`],
    royalmail: ['Royal Mail', (n) => `https://www.royalmail.com/track-your-item#/tracking-results/${n}`],
    usps: ['USPS', (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`],
    other: ['Another carrier', null],
  }
  const POSTING = [['new', 'To post'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['delivered', 'Delivered']]
  const trackLink = (carrier, number) => { if (/^https?:\/\//i.test(number || '')) return number; const c = CARRIERS[carrier]; return c && c[1] && number ? c[1](encodeURIComponent(number)) : '' }
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
    view: 'orders', loaded: false, loading: false, orders: [], sample: false, problem: null,
    o: { q: '', stage: 'all', period: 'all', sort: 'new', page: 1, per: perSaved(), customer: '' },
    c: { q: '', kind: 'all', sort: 'spent', page: 1, per: perSaved() },
    open: null, // the order whose panel is open
    pieces: new Set(), // the orders whose pieces are shown under their row
    opened: new Set(), // the orders open in place
    drafts: {}, // posting details being edited, by order
    saving: {}, saved: {}, // an order being saved; what its last save said
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
      for (const x of [state.o, state.c, dState]) x.per = n // one choice for every list
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
  const headRow = (titles) => el('div', { className: 'sl-row sl-th', role: 'row' }, [...titles.map((t) => el('span', { role: 'columnheader', textContent: t })), el('span', { role: 'columnheader' })])

  // the open modal, if any: { kind: 'confirm', title, text, more, yes, run } or { kind: 'customer', key }
  state.modal = null
  const ask = (m) => { state.modal = { kind: 'confirm', ...m }; draw() }
  const closeModal = () => { state.modal = null; draw() }
  const keyOf = (o) => (o.email || o.name || o.id).toLowerCase()

  const hideOrders = async (list) => {
    const r = await api('POST', { action: 'hide', orders: list.map((o) => ({ id: o.id, paymentIntent: o.paymentIntent })) })
    if (!r.ok) return r.json.message || 'Not deleted. Try again.'
    const gone = new Set(list.map((o) => o.id))
    state.orders = state.orders.filter((o) => !gone.has(o.id))
    return ''
  }
  const askOrder = (o) => ask({
    title: `Delete order #${o.number}?`,
    text: `${o.name || o.email || 'This order'} · ${money(o.total, o.currency)} · ${date(o.created)}`,
    more: 'It is erased: it leaves Orders and Customers, and the buyer\'s account too. Stripe never deletes a payment, so Stripe keeps its own record of it (and any refund is still done there).',
    yes: 'Delete order',
    run: () => hideOrders([o]),
  })
  const askCustomer = (c) => {
    const theirs = state.orders.filter((o) => keyOf(o) === c.key)
    ask({
      title: `Delete ${c.name || c.email}?`,
      text: `${c.email ? `${c.email} · ` : ''}${theirs.length} ${theirs.length === 1 ? 'order' : 'orders'} · ${money(c.spent, c.currency)}`,
      more: 'Their orders are taken off Orders and Customers for good. Stripe keeps its own record of the payments.',
      yes: 'Delete customer',
      run: () => hideOrders(theirs),
    })
  }
  const askDiscount = (d) => ask({
    title: `Delete ${d.code}?`,
    text: `${d.percent}% off · ${who(d)} · used ${d.used} ${d.used === 1 ? 'time' : 'times'}`,
    more: 'It stops working at once. Orders that already used it keep their discount.',
    yes: 'Delete code',
    run: async () => {
      const r = await dApi('DELETE', { code: d.code })
      if (!r.ok) return r.json.message || 'Not deleted. Try again.'
      dState.list = dState.list.filter((x) => x.code !== d.code)
      if (dState.editing === d.code) dState.editing = null
      return ''
    },
  })
  const confirmModal = (m) => {
    const said = el('p', { className: 'sl-said is-bad' })
    const yes = button(m.yes, async () => {
      yes.disabled = true; no.disabled = true; said.textContent = ''
      yes.textContent = 'Working…'
      const problem = await m.run()
      if (problem) { said.textContent = problem; yes.disabled = false; no.disabled = false; yes.textContent = m.yes; return }
      closeModal()
    }, 'ia-btn sl-danger-solid')
    const no = button('Cancel', closeModal, 'ia-btn ghost')
    return [
      el('div', { className: 'sl-modal-head is-danger' }, [el('div', { className: 'ia-kicker', textContent: 'Are you sure?' }), el('h2', { textContent: m.title })]),
      el('div', { className: 'sl-modal-body' }, [el('p', { className: 'sl-modal-what', textContent: m.text }), el('p', { textContent: m.more }), said]),
      el('div', { className: 'sl-modal-foot' }, [no, yes]),
    ]
  }

  /* Everything about one customer: contact, every address they have had things sent to, what
     they have bought, and the discount codes made for them. */
  const customerModal = (key) => {
    const c = customers().find((x) => x.key === key)
    const theirs = state.orders.filter((o) => keyOf(o) === key).sort((a, b) => b.created - a.created)
    if (!c && !theirs.length) return null
    const first = theirs[0] || {}
    const phone = (theirs.find((o) => o.phone) || {}).phone || ''
    const places = new Map()
    for (const o of theirs) if (o.shipTo.length) { const k = o.shipTo.join('|'); places.set(k, { lines: [o.name, ...o.shipTo.slice(0, -1), country(o.shipTo[o.shipTo.length - 1])].filter(Boolean), n: (places.get(k)?.n || 0) + 1, last: Math.max(places.get(k)?.last || 0, o.created) }) }
    const codes = c && c.email ? dState.list.filter((d) => d.emails.includes(c.email.toLowerCase())) : []
    const block = (title, kids) => el('section', { className: 'sl-block' }, [el('h3', { textContent: title }), ...kids])
    return [
      el('div', { className: 'sl-modal-head' }, [el('div', { className: 'ia-kicker', textContent: 'Customer' }), el('h2', { textContent: (c && c.name) || first.name || (c && c.email) || '—' })]),
      el('div', { className: 'sl-modal-body' }, [
        el('div', { className: 'sl-mini-stats' }, [
          stat('Orders', String(c ? c.orders : theirs.length)),
          stat('Spent', money(c ? c.spent : 0, (c && c.currency) || first.currency)),
          stat('First order', c ? date(c.first) : '—'),
          stat('Last order', c ? date(c.last) : '—'),
        ]),
        block('Contact', [el('p', { className: 'sl-who' }, [
          c && c.email ? el('a', { href: `mailto:${c.email}`, textContent: c.email }) : el('span', { textContent: 'No email' }),
          phone ? el('a', { href: `tel:${phone.replace(/[^+\d]/g, '')}`, textContent: phone }) : el('span', { className: 'sl-dim', textContent: 'No phone number given' }),
          c && c.country ? el('span', { textContent: country(c.country) }) : null,
        ])]),
        block(places.size === 1 ? 'Address' : 'Addresses', places.size ? [el('div', { className: 'sl-addresses' }, [...places.values()].sort((a, b) => b.last - a.last).map((p) => el('p', { className: 'sl-address' }, [...p.lines.flatMap((line, i) => (i ? [el('br'), line] : [line])), el('small', { className: 'sl-hint', textContent: `Used on ${p.n} ${p.n === 1 ? 'order' : 'orders'}, last ${date(p.last)}` })])))] : [el('p', { className: 'sl-dim', textContent: 'No delivery address on their orders.' })]),
        block('Orders', [el('ul', { className: 'sl-items sl-their-orders' }, theirs.map((o) => {
          const li = el('li', {}, [el('span', { textContent: `#${o.number} · ${date(o.created)}` }), done(o) ? badge(o.fulfilment, stageName[o.fulfilment]) : badge(o.payment, PAYMENT[o.payment]), el('strong', { textContent: money(o.total, o.currency) })])
          li.addEventListener('click', () => { state.modal = null; state.opened.add(o.id); if (state.view !== 'orders') location.hash = '#/sales/orders'; else draw() })
          return li
        }))]),
        codes.length ? block('Discount codes for them', [el('ul', { className: 'sl-items' }, codes.map((d) => el('li', {}, [el('span', { textContent: d.code }), badge(`d-${d.status}`, D_STATUS[d.status]), el('strong', { textContent: `${d.percent}% off` })])))]) : null,
      ]),
      el('div', { className: 'sl-modal-foot' }, [
        c && c.email ? el('a', { className: 'ia-btn ghost', href: `mailto:${c.email}`, textContent: 'Email them' }) : null,
        button('See their orders', () => { state.modal = null; location.hash = `#/sales/orders?customer=${encodeURIComponent((c && c.email) || first.email || first.name)}`; draw() }, 'ia-btn ghost'),
        button('Close', closeModal, 'ia-btn'),
      ]),
    ]
  }
  const modalLayer = () => {
    const m = state.modal
    if (!m) return []
    const inside = m.kind === 'customer' ? customerModal(m.key) : confirmModal(m)
    if (!inside) { state.modal = null; return [] }
    const shade = el('div', { className: 'sl-modal-shade' }, [el('div', { className: `sl-modal ${m.kind === 'confirm' ? 'is-small' : ''}`, role: m.kind === 'confirm' ? 'alertdialog' : 'dialog', ariaModal: 'true' }, inside)])
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
      list.length ? el('div', { className: 'sl-orders' }, pageOf(list, f).map(orderCard))
        : (state.loaded && !state.problem ? el('div', { className: 'sl-empty' }, [el('strong', { textContent: state.orders.length ? 'No orders match' : 'No orders yet' }), el('p', { textContent: state.orders.length ? 'Try another chip, period or search.' : 'Purchases made through the shop show up here.' })]) : null),
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
        i.slug ? el('a', { className: 'sl-link', href: `#/collections/shop/entries/${i.slug}`, textContent: 'Open the piece' }) : el('small', { className: 'sl-dim', textContent: 'Not a piece on the site any more' }),
      ]),
    ]),
  ])))

  /* One order: a row that opens in place. The row: when, who, what and how it was paid, the
     total, where it is up to, and its icons (the pieces bought, the customer, delete). Open: on the
     left what was ordered, the buyer and where it goes; on the right where it is up to (a new step
     saves at once), the carrier, the tracking number and a note of the admin's own. */
  const waitingDays = (o) => (done(o) && o.payment !== 'refunded' && ['new', 'packed'].includes(o.fulfilment) ? Math.floor((Date.now() - o.created) / 864e5) : 0)
  const orderCard = (o) => {
    const open = state.opened.has(o.id)
    const first = o.items[0] ? o.items[0].name : 'Payment'
    const what = o.items.length > 1 ? `${first} + ${o.items.length - 1} more` : first
    const wait = waitingDays(o)
    const pill = !done(o) ? badge(o.payment, PAYMENT[o.payment] || o.payment) : o.payment === 'refunded' ? badge('refunded', 'Refunded') : badge(o.fulfilment, o.fulfilment === 'new' ? 'To post' : stageName[o.fulfilment])
    const chev = el('span', { className: 'sl-chev', ariaHidden: 'true' })
    chev.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>'
    const headBtn = el('button', { type: 'button', className: 'sl-order-head', ariaExpanded: String(open) }, [
      el('span', { className: 'sl-order-date' }, [el('strong', { textContent: new Date(o.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }), el('small', { textContent: `#${o.number}` })]),
      el('span', { className: 'sl-order-who' }, [el('strong', { textContent: o.name || o.email || 'No name given' }), el('small', {}, [o.paidWith ? `${what} · ${o.paidWith}` : what, wait >= 2 ? el('em', { textContent: `waiting ${wait} days` }) : null])]),
      el('span', { className: 'sl-order-total', textContent: money(o.total, o.currency) }),
      pill,
      chev,
    ])
    headBtn.addEventListener('click', () => { if (open) state.opened.delete(o.id); else state.opened.add(o.id); draw() })
    const showing = state.pieces.has(o.id)
    const look = o.items.length ? iconBtn('pieces', showing ? 'Hide the pieces' : 'See the pieces bought', () => { if (showing) state.pieces.delete(o.id); else state.pieces.add(o.id); draw() }) : null
    if (look && showing) look.classList.add('on')
    return el('article', { className: `sl-order ${open ? 'is-open' : ''}` }, [
      el('div', { className: 'sl-order-line' }, [headBtn, el('span', { className: 'sl-acts' }, [look, iconBtn('info', 'Customer details', () => { state.modal = { kind: 'customer', key: keyOf(o) }; draw() }), iconBtn('trash', `Delete order #${o.number}`, () => askOrder(o))])]),
      showing ? piecesPanel(o) : null,
      open ? orderBody(o) : null,
    ])
  }
  const copyBtn = (text, what) => {
    const b = el('button', { type: 'button', className: 'sl-link', textContent: `Copy ${what}` })
    b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(text); b.textContent = 'Copied' } catch { b.textContent = 'Could not copy' } setTimeout(() => { b.textContent = `Copy ${what}` }, 1600) })
    return b
  }
  const orderBody = (o) => {
    const h = (t) => el('h4', { className: 'sl-h4', textContent: t })
    const address = o.shipTo.length ? [o.name, ...o.shipTo.slice(0, -1), country(o.shipTo[o.shipTo.length - 1])].filter(Boolean) : []
    const theirs = state.orders.filter((x) => keyOf(x) === keyOf(o)).length
    const left = el('div', { className: 'sl-order-col' }, [
      h('Ordered'),
      el('ul', { className: 'sl-items' }, o.items.map((i) => el('li', {}, [el('span', { textContent: `${i.qty} × ${i.name}` }), el('strong', { textContent: money(i.total, o.currency) })]))),
      o.discount ? el('div', { className: 'sl-sum is-refund' }, [el('span', { textContent: `Discount${o.discountCode ? ` · ${o.discountCode}` : ''}` }), el('strong', { textContent: `− ${money(o.discount, o.currency)}` })]) : null,
      el('div', { className: 'sl-sum' }, [el('span', { textContent: 'Paid' }), el('strong', { textContent: money(o.total, o.currency) })]),
      o.paidWith ? el('div', { className: 'sl-sum is-method' }, [el('span', { textContent: 'Paid with' }), el('strong', { textContent: o.paidWith })]) : null,
      o.refunded ? el('div', { className: 'sl-sum is-refund' }, [el('span', { textContent: o.payment === 'refunded' ? 'Refunded in full' : 'Refunded' }), el('strong', { textContent: `− ${money(o.refunded, o.currency)}` })]) : null,
      el('p', { className: 'sl-dim sl-when', textContent: date(o.created, true) }),
      h('Buyer'),
      el('p', { className: 'sl-who' }, [el('strong', { textContent: o.name || '—' }), o.email ? el('a', { href: `mailto:${o.email}?subject=${encodeURIComponent(`Your order #${o.number}`)}`, textContent: o.email }) : null, o.phone ? el('span', { textContent: o.phone }) : null]),
      o.email ? button(theirs > 1 ? `See all ${theirs} of their orders` : 'See them in Customers', () => { if (theirs > 1) { state.o.customer = o.email; state.o.page = 1; history.replaceState(null, '', `#/sales/orders?customer=${encodeURIComponent(o.email)}`); draw() } else { state.modal = { kind: 'customer', key: keyOf(o) }; draw() } }, 'sl-link') : null,
      address.length ? h('Post to') : null,
      address.length ? el('p', { className: 'sl-address' }, address.flatMap((line, i) => (i ? [el('br'), line] : [line]))) : null,
      address.length ? copyBtn(address.join('\n'), 'address') : null,
      o.stripe ? el('a', { className: 'sl-link', href: o.stripe, target: '_blank', rel: 'noopener', textContent: o.provider === 'paypal' ? 'Open in PayPal ↗' : 'Open in Stripe ↗' }) : null,
    ])
    return el('div', { className: 'sl-order-body' }, [left, done(o) && o.payment !== 'refunded' ? postingCol(o) : el('div', { className: 'sl-order-col sl-quiet' }, [el('p', { textContent: o.payment === 'refunded' ? 'Refunded: nothing to post.' : 'Not paid: nothing to post.' })])])
  }
  const postingCol = (o) => {
    const d = state.drafts[o.id] || (state.drafts[o.id] = { fulfilment: o.fulfilment, carrier: o.carrier || '', tracking: o.tracking || '', note: o.note || '' })
    const saving = state.saving[o.id]
    const steps = el('div', { className: 'sl-steps', role: 'radiogroup', ariaLabel: 'Where it is up to' }, [...POSTING, ...(o.fulfilment === 'cancelled' ? [['cancelled', 'Cancelled']] : [])].map(([k, t]) => {
      const b = el('button', { type: 'button', role: 'radio', ariaChecked: String(d.fulfilment === k), className: `sl-step ${d.fulfilment === k ? 'on' : ''}`, textContent: t })
      // a new step is saved at once (with the carrier, number and note as they are), so the buyer sees it
      b.addEventListener('click', () => { if (saving || (d.fulfilment === k && o.fulfilment === k)) return; d.fulfilment = k; storeOrder(o) })
      return b
    }))
    const field = (label, control) => el('label', { className: 'sl-label' }, [el('span', { textContent: label }), control])
    const carrier = el('select', { className: 'sl-input' }, [el('option', { value: '', textContent: 'Choose…' }), ...Object.entries(CARRIERS).map(([v, [t]]) => el('option', { value: v, textContent: t, selected: d.carrier === v }))])
    carrier.addEventListener('change', () => { d.carrier = carrier.value; draw() })
    const number = el('input', { className: 'sl-input', value: d.tracking, placeholder: 'For example RR123456789PT', maxLength: 200 })
    number.addEventListener('input', () => { d.tracking = number.value })
    const note = el('textarea', { className: 'sl-input', value: d.note, rows: 2, placeholder: 'Only you see this', maxLength: 480 })
    note.addEventListener('input', () => { d.note = note.value })
    const save = button(saving ? 'Saving…' : 'Save', () => storeOrder(o), 'ia-btn')
    save.disabled = Boolean(saving)
    const said = state.saved[o.id]
    const url = trackLink(o.carrier, o.tracking)
    const carrierName = CARRIERS[o.carrier] ? CARRIERS[o.carrier][0] : ''
    const mail = o.email && o.tracking ? `mailto:${o.email}?subject=${encodeURIComponent('Your order is on its way')}&body=${encodeURIComponent(`Hi ${(o.name || '').split(' ')[0] || 'there'},\n\nYour order #${o.number} has been posted${carrierName && o.carrier !== 'other' ? ` with ${carrierName}` : ''}. The tracking number is ${o.tracking}.${url ? `\nFollow it here: ${url}` : ''}\n\nThank you!`)}` : ''
    return el('div', { className: 'sl-order-col sl-posting' }, [
      el('h4', { className: 'sl-h4', textContent: 'Posting' }),
      steps,
      el('div', { className: 'sl-pair' }, [field('Carrier', carrier), field('Tracking number', number)]),
      field('Note', note),
      el('div', { className: 'sl-save' }, [save, said ? el('span', { className: `sl-said ${said.ok ? '' : 'is-bad'}`, textContent: said.text }) : null]),
      url || mail ? el('div', { className: 'sl-links' }, [
        url ? el('a', { className: 'sl-link', href: url, target: '_blank', rel: 'noopener', textContent: 'Track the parcel ↗' }) : null,
        mail ? el('a', { className: 'sl-link', href: mail, textContent: 'Email the tracking to the buyer' }) : null,
      ]) : null,
    ])
  }
  const storeOrder = async (o) => {
    const d = state.drafts[o.id]
    state.saving[o.id] = true; delete state.saved[o.id]; draw()
    const r = await api('POST', { id: o.id, paymentIntent: o.paymentIntent, fulfilment: d.fulfilment, carrier: d.carrier, tracking: d.tracking.trim(), note: d.note.trim() })
    state.saving[o.id] = false
    if (r.ok) { Object.assign(o, { fulfilment: d.fulfilment, carrier: d.carrier, tracking: d.tracking.trim(), note: d.note.trim() }); state.saved[o.id] = { ok: true, text: 'Saved ✓' } }
    else state.saved[o.id] = { ok: false, text: (r.json && r.json.message) || 'Not saved. Try again.' }
    draw()
    if (r.ok) setTimeout(() => { if (state.saved[o.id] && state.saved[o.id].ok) { delete state.saved[o.id]; draw() } }, 2500)
  }

  // ---------- Customers ----------
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
    return [...by.values()]
  }
  const customersView = () => {
    const f = state.c
    const all = customers()
    const kinds = [['all', 'Everyone', () => true], ['repeat', 'Bought more than once', (c) => c.orders > 1], ['waiting', 'Waiting for an order', (c) => c.waiting > 0]]
    const kind = kinds.find((k) => k[0] === f.kind) || kinds[0]
    const q = f.q.trim().toLowerCase()
    const sorts = { spent: (a, b) => b.spent - a.spent, orders: (a, b) => b.orders - a.orders || b.spent - a.spent, last: (a, b) => b.last - a.last, name: (a, b) => (a.name || a.email).localeCompare(b.name || b.email) }
    const list = all.filter((c) => kind[2](c) && (!q || [c.name, c.email, country(c.country)].join(' ').toLowerCase().includes(q))).sort(sorts[f.sort] || sorts.spent)
    const set = (k, v) => { state.c[k] = v; state.c.page = 1; draw() }
    const cur = currency()
    const total = all.reduce((t, c) => t + c.spent, 0)
    return [
      head('Customers', 'Everyone who has bought from the shop, worked out from the orders. Open one to see their orders.', [
        button(state.loading ? 'Loading…' : 'Refresh', load),
        button('Export CSV', () => csv([['Name', 'Email', 'Country', 'Orders', 'Spent', 'Currency', 'First order', 'Last order'], ...list.map((c) => [c.name, c.email, country(c.country), c.orders, c.spent, c.currency, date(c.first), date(c.last)])], `customers-${new Date().toISOString().slice(0, 10)}.csv`)),
      ]),
      notices(),
      hiddenNote(state.orders, 'customers\' orders', 'customers'),
      el('div', { className: 'sl-stats' }, [
        stat('Customers', String(all.length)),
        stat('Came back', String(all.filter((c) => c.orders > 1).length), 'bought more than once'),
        stat('Spent on average', money(all.length ? total / all.length : 0, cur)),
        stat('Waiting for an order', String(all.filter((c) => c.waiting).length)),
      ]),
      el('div', { className: 'sl-chips', role: 'group', ariaLabel: 'Show' }, kinds.map(([k, label, test]) => {
        const b = el('button', { type: 'button', className: `sl-chip ${f.kind === k ? 'on' : ''}`, ariaPressed: String(f.kind === k) }, [label, el('small', { textContent: String(all.filter(test).length) })])
        b.addEventListener('click', () => set('kind', k))
        return b
      })),
      el('div', { className: 'sl-tools' }, [
        search(f.q, 'Name, email, country…', (v) => set('q', v)),
        select(f.sort, [['spent', 'Most spent'], ['orders', 'Most orders'], ['last', 'Latest order'], ['name', 'Name A–Z']], (v) => set('sort', v), 'Sort'),
      ]),
      el('p', { className: 'sl-count', textContent: `${list.length} ${list.length === 1 ? 'customer' : 'customers'}` }),
      list.length ? el('div', { className: 'sl-table is-customers', role: 'table' }, [
        headRow(['Customer', 'Country', 'Orders', 'Spent', 'Last order']),
        ...pageOf(list, f).map((c) => {
          return rowEl(false, [
            el('span', { className: 'sl-c-who' }, [el('strong', { textContent: c.name || '—' }), el('small', { textContent: c.email })]),
            el('span', {}, [el('small', { textContent: country(c.country) || '—' })]),
            el('span', {}, [el('strong', { textContent: String(c.orders) }), c.waiting ? el('small', { className: 'sl-hot', textContent: `${c.waiting} to ship` }) : null]),
            el('span', { className: 'sl-c-total' }, [el('strong', { textContent: money(c.spent, c.currency) })]),
            el('span', {}, [el('small', { textContent: date(c.last) })]),
          ], () => { state.modal = { kind: 'customer', key: c.key }; draw() }, [iconBtn('info', 'Customer details', () => { state.modal = { kind: 'customer', key: c.key }; draw() }), iconBtn('trash', `Delete ${c.name || c.email}`, () => askCustomer(c))])
        }),
      ]) : (state.loaded && !state.problem ? el('div', { className: 'sl-empty' }, [el('strong', { textContent: all.length ? 'Nobody matches' : 'No customers yet' }), el('p', { textContent: all.length ? 'Try another chip or search.' : 'Everyone who buys from the shop shows up here.' })]) : null),
      pager(list, f, ['customer', 'customers']),
    ]
  }

  // ---------- Discounts ----------
  /* Discount codes, kept in Stripe (api/discounts.js): a percentage, for everyone or for chosen
     customers, from a start to an end, as many times as allowed. Buyers type the code in the cart. */
  const DAY = 24 * 60 * 60 * 1000
  const D_STATUS = { active: 'Active', scheduled: 'Starts later', expired: 'Ended', 'used-up': 'Used up' }
  const dState = { loaded: false, loading: false, list: [], sample: false, problem: null, q: '', kind: 'all', sort: 'new', editing: null, said: '', page: 1, per: perSaved() }
  const dApi = async (method, body) => {
    try {
      const r = await fetch('/api/discounts', { method, cache: 'no-store', headers: { Authorization: `token ${pass()}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) }
    } catch { return { ok: false, status: 0, json: { message: 'Could not reach the site. Check the connection and try again.' } } }
  }
  const loadDiscounts = async () => {
    dState.loading = true; draw()
    const r = await dApi('GET')
    dState.loading = false; dState.loaded = true
    if (r.ok) { dState.list = r.json.discounts || []; dState.sample = Boolean(r.json.sample); dState.mode = r.json.mode || ''; dState.problem = null }
    else dState.problem = { code: r.json.code || '', status: r.status, message: r.json.message || 'The discount codes could not be loaded.' }
    draw()
  }
  const dayInput = (t) => { if (!t) return ''; const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const fromDayInput = (v, endOfDay) => { if (!v) return 0; const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0).getTime() }
  const newCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)]; return `MA-${s}` }
  const who = (d) => (d.emails.length ? `${d.emails.length === 1 ? d.emails[0] : `${d.emails.length} people`}` : 'Everyone')
  const when = (d) => `${date(d.starts)} – ${d.ends ? date(d.ends) : 'no end'}`

  const discountsView = () => {
    const f = dState
    const kinds = [['all', 'All codes', () => true], ['active', 'Active', (d) => d.status === 'active'], ['scheduled', 'Starts later', (d) => d.status === 'scheduled'], ['ended', 'Ended', (d) => d.status === 'expired' || d.status === 'used-up']]
    const kind = kinds.find((k) => k[0] === f.kind) || kinds[0]
    const q = f.q.trim().toLowerCase()
    const sorts = { new: (a, b) => b.created - a.created, ending: (a, b) => (a.ends || Infinity) - (b.ends || Infinity), big: (a, b) => b.percent - a.percent, used: (a, b) => b.used - a.used }
    const all = visible(f.list, 'codes')
    const list = all.filter((d) => kind[2](d) && (!q || [d.code, ...d.emails].join(' ').toLowerCase().includes(q))).sort(sorts[f.sort] || sorts.new)
    const set = (k, v) => { dState[k] = v; dState.page = 1; draw() }
    const problem = f.problem && el('div', { className: `sl-notice ${f.problem.code === 'no-stripe' ? '' : 'is-bad'}` }, [
      el('strong', { textContent: f.problem.code === 'no-stripe' ? 'Stripe is not connected yet' : f.problem.status === 401 ? 'Your login has run out' : 'The discount codes could not be loaded' }),
      el('p', { textContent: f.problem.message }),
    ])
    return [
      head('Discounts', 'Codes buyers type in the cart for money off: for everyone, or only for the customers you choose, for as long as you say.', [
        button(f.loading ? 'Loading…' : 'Refresh', loadDiscounts),
        button('+ New discount', () => { dState.editing = 'new'; dState.said = ''; draw() }, 'ia-btn'),
      ]),
      problem || (f.sample && showTest.codes ? el('div', { className: 'sl-notice' }, [el('strong', { textContent: 'Sample codes' }), el('p', { textContent: 'This is the local preview without a Stripe key, so these codes are made up. On the live site the codes are kept in Stripe.' })]) : null),
      hiddenNote(f.list, 'discount codes', 'codes'),
      el('div', { className: 'sl-stats' }, [
        stat('Active now', String(all.filter((d) => d.status === 'active').length)),
        stat('Start later', String(all.filter((d) => d.status === 'scheduled').length)),
        stat('Times used', String(all.reduce((n, d) => n + d.used, 0)), 'across every code'),
        stat('Ended', String(all.filter((d) => d.status === 'expired' || d.status === 'used-up').length)),
      ]),
      el('div', { className: 'sl-chips', role: 'group', ariaLabel: 'Show' }, kinds.map(([k, label, test]) => {
        const b = el('button', { type: 'button', className: `sl-chip ${f.kind === k ? 'on' : ''}`, ariaPressed: String(f.kind === k) }, [label, el('small', { textContent: String(all.filter(test).length) })])
        b.addEventListener('click', () => set('kind', k))
        return b
      })),
      el('div', { className: 'sl-tools' }, [
        search(f.q, 'Code or email…', (v) => set('q', v)),
        select(f.sort, [['new', 'Newest first'], ['ending', 'Ending soonest'], ['big', 'Biggest discount'], ['used', 'Most used']], (v) => set('sort', v), 'Sort'),
      ]),
      el('p', { className: 'sl-count', textContent: f.loading && !f.loaded ? 'Loading the codes…' : `${list.length} ${list.length === 1 ? 'code' : 'codes'}` }),
      list.length ? el('div', { className: 'sl-table is-discounts', role: 'table' }, [
        headRow(['Code', 'Discount', 'For', 'Active', 'Used', 'Status']),
        ...pageOf(list, f).map((d) => {
          return rowEl(dState.editing === d.code, [
            el('span', { className: 'sl-c-order' }, [el('strong', { textContent: d.code }), el('small', { textContent: `Made ${date(d.created)}` })]),
            el('span', { className: 'sl-c-total' }, [el('strong', { textContent: `${d.percent}% off` })]),
            el('span', {}, [el('strong', { textContent: who(d) }), d.emails.length > 1 ? el('small', { textContent: d.emails.slice(0, 2).join(', ') + (d.emails.length > 2 ? '…' : '') }) : null]),
            el('span', {}, [el('small', { textContent: when(d) })]),
            el('span', {}, [el('strong', { textContent: d.limit ? `${d.used} / ${d.limit}` : String(d.used) }), el('small', { textContent: d.limit ? 'times' : 'times, no limit' })]),
            el('span', {}, [badge(`d-${d.status}`, D_STATUS[d.status] || d.status)]),
          ], () => { dState.editing = d.code; dState.said = ''; draw() }, [iconBtn('trash', `Delete ${d.code}`, () => askDiscount(d))])
        }),
      ]) : (f.loaded && !f.problem ? el('div', { className: 'sl-empty' }, [el('strong', { textContent: f.list.length ? 'No codes match' : 'No discount codes yet' }), el('p', { textContent: f.list.length ? 'Try another chip or search.' : 'Press New discount to make the first.' })]) : null),
      pager(list, f, ['code', 'codes']),
    ]
  }

  // the panel that makes a code, or changes one
  const discountPanel = (d) => {
    const fresh = d === 'new'
    const was = fresh ? null : dState.list.find((x) => x.code === d)
    if (!fresh && !was) return []
    const close = () => { dState.editing = null; draw() }
    const v = { code: fresh ? newCode() : was.code, percent: fresh ? 10 : was.percent, emails: fresh ? [] : [...was.emails], everyone: fresh ? true : !was.emails.length, starts: fresh ? 0 : was.starts, lasts: '7', ends: 0, limit: '' }
    const field = (label, kids, hint) => el('div', { className: 'sl-label' }, [el('span', { textContent: label }), ...kids, hint ? el('small', { className: 'sl-hint', textContent: hint }) : null])
    const seg = (options, value, onPick) => {
      const box = el('div', { className: 'sl-seg', role: 'radiogroup' })
      const paint = (val) => box.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.v === String(val)); b.setAttribute('aria-checked', String(b.dataset.v === String(val))) })
      options.forEach(([val, text]) => { const b = el('button', { type: 'button', className: 'sl-stage', role: 'radio', textContent: text }); b.dataset.v = String(val); b.addEventListener('click', () => { paint(val); onPick(val) }); box.append(b) })
      paint(value)
      return box
    }

    // the code
    const codeIn = el('input', { className: 'sl-input', value: v.code, maxLength: 32, readOnly: !fresh, spellcheck: false })
    codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })
    const another = fresh ? button('New code', () => { codeIn.value = newCode() }, 'ia-btn ghost') : null

    // how much
    const pctIn = el('input', { className: 'sl-input sl-pct', type: 'number', min: 1, max: 100, step: 1, value: v.percent, readOnly: !fresh })
    const presets = fresh ? seg([5, 10, 15, 20, 25, 30, 40, 50].map((n) => [n, `${n}%`]), v.percent, (n) => { pctIn.value = n }) : null
    pctIn.addEventListener('input', () => presets && presets.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === pctIn.value)))

    // who: everyone, or chosen customers (picked from the list of customers, or typed)
    const chips = el('div', { className: 'sl-people' })
    const paintPeople = () => chips.replaceChildren(...(v.emails.length ? v.emails.map((e) => {
      const c = el('span', { className: 'sl-person' }, [el('span', { textContent: e }), el('button', { type: 'button', ariaLabel: `Remove ${e}`, textContent: '×' })])
      c.querySelector('button').addEventListener('click', () => { v.emails = v.emails.filter((x) => x !== e); paintPeople() })
      return c
    }) : [el('small', { className: 'sl-hint', textContent: 'Nobody chosen yet.' })]))
    const listId = 'sl-customers-list'
    const pick = el('input', { className: 'sl-input', placeholder: 'Choose a customer, or type an email', type: 'email' })
    pick.setAttribute('list', listId)
    const known = customers().filter((c) => c.email)
    const datalist = el('datalist', { id: listId }, known.map((c) => el('option', { value: c.email, label: `${c.name || c.email} · ${c.orders} ${c.orders === 1 ? 'order' : 'orders'}` })))
    const add = () => {
      const e = pick.value.trim().toLowerCase()
      if (!e) return
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { panelSaid.textContent = `"${e}" is not an email address.`; return }
      if (!v.emails.includes(e)) v.emails.push(e)
      pick.value = ''; panelSaid.textContent = ''; paintPeople()
    }
    pick.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add() } })
    pick.addEventListener('change', () => { if (known.some((c) => c.email === pick.value)) add() })
    const whoBox = el('div', { className: 'sl-who-box' }, [el('div', { className: 'sl-pick' }, [pick, datalist, button('Add', add, 'ia-btn ghost')]), chips])
    whoBox.hidden = v.everyone
    const whoSeg = seg([['all', 'Everyone'], ['some', 'Chosen customers']], v.everyone ? 'all' : 'some', (val) => { v.everyone = val === 'all'; whoBox.hidden = v.everyone })
    paintPeople()

    // when
    const startIn = el('input', { className: 'sl-input', type: 'date', value: dayInput(v.starts) })
    const endIn = el('input', { className: 'sl-input', type: 'date', value: '' })
    const endBox = el('div', {}, [endIn])
    endBox.hidden = true
    const lastsSeg = fresh ? seg([['1', '24 hours'], ['7', '7 days'], ['30', '30 days'], ['0', 'No end'], ['date', 'Until a date']], v.lasts, (val) => { v.lasts = val; endBox.hidden = val !== 'date' }) : null
    const limitIn = el('input', { className: 'sl-input', type: 'number', min: 1, step: 1, placeholder: 'No limit', value: v.limit })

    const panelSaid = el('span', { className: 'sl-said is-bad' })
    const save = button(fresh ? 'Make the code' : 'Save changes', async () => {
      const starts = fromDayInput(startIn.value, false) || (fresh ? Date.now() : was.starts)
      const startAt = Math.max(starts, fresh && !startIn.value ? Date.now() : starts)
      const ends = !fresh ? undefined : v.lasts === 'date' ? fromDayInput(endIn.value, true) : v.lasts === '0' ? 0 : Math.max(Date.now(), startAt) + Number(v.lasts) * DAY
      if (fresh && v.lasts === 'date' && !endIn.value) { panelSaid.textContent = 'Pick the day it ends.'; return }
      if (!v.everyone && !v.emails.length) { panelSaid.textContent = 'Choose at least one customer, or pick Everyone.'; return }
      save.disabled = true; panelSaid.textContent = 'Saving…'
      const body = fresh
        ? { code: codeIn.value, percent: Number(pctIn.value), emails: v.everyone ? [] : v.emails, starts: startAt, ends, limit: Number(limitIn.value) || 0 }
        : { code: was.code, emails: v.everyone ? [] : v.emails, starts: startAt }
      const r = await dApi(fresh ? 'POST' : 'PATCH', body)
      if (!r.ok) { panelSaid.textContent = r.json.message || 'Not saved. Try again.'; save.disabled = false; return }
      const got = r.json.discount
      dState.list = [got, ...dState.list.filter((x) => x.code !== got.code)]
      dState.editing = got.code; dState.said = fresh ? 'Made ✓ Buyers can use it now.' : 'Saved ✓'
      draw()
    }, 'ia-btn')
    const remove = fresh ? null : button('Delete code', () => askDiscount(was), 'sl-link sl-danger')

    const block = (title, kids) => el('section', { className: 'sl-block' }, [el('h3', { textContent: title }), ...kids])
    const panel = el('aside', { className: 'sl-panel', role: 'dialog', ariaModal: 'true', ariaLabel: fresh ? 'New discount' : `Discount ${was.code}` }, [
      el('header', { className: 'sl-panel-head' }, [
        el('div', {}, [el('div', { className: 'ia-kicker', textContent: fresh ? 'New discount' : `${was.percent}% off · used ${was.used} ${was.used === 1 ? 'time' : 'times'}` }), el('h2', { textContent: fresh ? 'Make a code' : was.code }), !fresh ? el('div', { className: 'sl-badges' }, [badge(`d-${was.status}`, D_STATUS[was.status])]) : null]),
        button('×', close, 'sl-x'),
      ]),
      el('div', { className: 'sl-panel-body' }, [
        block('The code', [field('Code buyers type', [el('div', { className: 'sl-pick' }, [codeIn, another])], fresh ? 'Letters, numbers, - and _. Make your own (MILTON10) or press New code.' : 'A code cannot be renamed: make a new one instead.')]),
        block('How much', [presets, field('Percentage off', [pctIn], fresh ? 'Pick one above, or type any percentage from 1 to 100.' : 'Set when the code was made. For another percentage, make a new code.')]),
        block('Who can use it', [whoSeg, whoBox, el('small', { className: 'sl-hint', textContent: 'Chosen customers type their email in the cart with the code, and pay with that email.' })]),
        block('When', [
          field('Starts', [startIn], 'Empty: straight away.'),
          fresh ? field('Lasts', [lastsSeg, endBox]) : field('Ends', [el('strong', { className: 'sl-plain', textContent: was.ends ? date(was.ends) : 'No end' })], 'Set when the code was made.'),
          fresh ? field('How many times it can be used', [limitIn], 'In total, by everyone. Empty: no limit.') : field('Used', [el('strong', { className: 'sl-plain', textContent: was.limit ? `${was.used} of ${was.limit}` : `${was.used}, no limit` })]),
        ]),
        el('div', { className: 'sl-save' }, [save, el('span', { className: 'sl-said', textContent: dState.said }), panelSaid]),
        remove ? el('div', { className: 'sl-save' }, [remove]) : null,
      ]),
    ])
    dState.said = ''
    const shade = el('div', { className: 'sl-shade' })
    shade.addEventListener('click', close)
    return [shade, panel]
  }

  // ---------- drawing ----------
  const draw = () => {
    if (!root) return
    const scroll = root.scrollTop
    const focusedSearch = document.activeElement && document.activeElement.classList.contains('sl-search')
    const caret = focusedSearch ? document.activeElement.selectionStart : null
    const views = { orders: ordersView, customers: customersView, discounts: discountsView }
    const panels = state.view === 'discounts' && dState.editing ? discountPanel(dState.editing) : []
    const keep = document.activeElement && root.contains(document.activeElement) && document.activeElement.matches('.sl-panel input, .sl-panel textarea, .sl-posting input, .sl-posting textarea') // typing: leave it as it is
    if (keep) return
    root.replaceChildren(el('div', { className: 'sl-inner' }, views[state.view]()), ...panels, ...modalLayer())
    root.scrollTop = scroll
    if (focusedSearch) { const s = root.querySelector('.sl-search'); if (s) { s.focus(); s.setSelectionRange(caret, caret) } }
  }
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (state.modal) { state.modal = null; draw(); return }
    if (dState.editing) { dState.editing = null; draw() }
  })

  /* Called by shell.js whenever the address changes to a Sales screen. */
  const show = (view, params) => {
    const before = state.view
    state.view = ['customers', 'discounts'].includes(view) ? view : 'orders'
    if (state.view === 'orders') state.o.customer = params.get('customer') || ''
    if (before !== state.view) { dState.editing = null; state.modal = null }
    // the discounts screen also wants the customers, to offer them in its drop-down
    if (state.view !== 'orders' && !dState.loaded && !dState.loading) loadDiscounts()
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
