/* Milton Aguiar admin: Sales.
   Two screens under a line at the foot of the navigation, for keeping track of what the shop sells:
   - Orders: every purchase made through the shop's Stripe checkout, newest first, with totals at
     the top, chips to narrow them by where they are up to (to ship, shipped...), a search, a
     period and a sort, and a panel per order with what was bought, who bought it, where it goes,
     and where it is up to (status, tracking number and a note, kept on the order in Stripe);
   - Customers: everyone who has bought, with what they have spent; one opens their orders.
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
  const stageName = Object.fromEntries(STAGES)
  const PAYMENT = { paid: 'Paid', 'part-refunded': 'Part refunded', refunded: 'Refunded', unpaid: 'Not paid', expired: 'Abandoned' }
  const PERIODS = [['all', 'All time'], ['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['year', 'This year']]
  const PAGE = 30

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
    o: { q: '', stage: 'all', period: 'all', sort: 'new', shown: PAGE, customer: '' },
    c: { q: '', kind: 'all', sort: 'spent', shown: PAGE },
    open: null, // the order whose panel is open
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

  // ---------- the screen ----------
  let root = null
  const mount = () => (root = root || el('main', { className: 'ia-sales', ariaLabel: 'Sales' }))

  const load = async () => {
    state.loading = true; draw()
    const r = await api('GET')
    state.loading = false; state.loaded = true
    if (r.ok) { state.orders = (r.json.orders || []).sort((a, b) => b.created - a.created); state.sample = Boolean(r.json.sample); state.problem = null }
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
    if (state.sample) return el('div', { className: 'sl-notice' }, [el('strong', { textContent: 'Sample orders' }), el('p', { textContent: 'This is the local preview without a Stripe key, so these orders are made up to show how the screen works. On the live site this shows the real orders from Stripe.' })])
    return null
  }
  const stat = (label, value, note) => el('div', { className: 'sl-stat' }, [el('span', { textContent: label }), el('strong', { textContent: value }), note ? el('small', { textContent: note }) : null])

  // ---------- Orders ----------
  const filteredOrders = () => {
    const f = state.o
    const chip = ORDER_CHIPS.find((c) => c[0] === f.stage) || ORDER_CHIPS[0]
    const q = f.q.trim().toLowerCase()
    const list = state.orders.filter((o) => chip[2](o) && inPeriod(o.created, f.period)
      && (!f.customer || (o.email || o.name).toLowerCase() === f.customer.toLowerCase())
      && (!q || [o.number, o.name, o.email, o.country, country(o.country), o.tracking, o.note, ...o.items.map((i) => i.name)].join(' ').toLowerCase().includes(q)))
    const by = { new: (a, b) => b.created - a.created, old: (a, b) => a.created - b.created, high: (a, b) => b.total - a.total, low: (a, b) => a.total - b.total, name: (a, b) => (a.name || a.email).localeCompare(b.name || b.email) }
    return list.sort(by[f.sort] || by.new)
  }
  const ordersView = () => {
    const f = state.o
    const inRange = state.orders.filter((o) => inPeriod(o.created, f.period))
    const sold = inRange.filter(done)
    const cur = currency()
    const income = sold.reduce((t, o) => t + kept(o), 0)
    const toShip = sold.filter(ORDER_CHIPS[1][2]).length
    const list = filteredOrders()
    const set = (k, v) => { state.o[k] = v; if (k !== 'shown') state.o.shown = PAGE; draw() }
    const exportCsv = () => csv([
      ['Order', 'Date', 'Customer', 'Email', 'Phone', 'Country', 'Ship to', 'Items', 'Total', 'Refunded', 'Currency', 'Payment', 'Status', 'Tracking', 'Note'],
      ...list.map((o) => [o.number, date(o.created, true), o.name, o.email, o.phone, country(o.country), o.shipTo.join(', '), o.items.map((i) => `${i.name} x${i.qty}`).join('; '), o.total, o.refunded, o.currency, PAYMENT[o.payment] || o.payment, stageName[o.fulfilment], o.tracking, o.note]),
    ], `orders-${new Date().toISOString().slice(0, 10)}.csv`)
    return [
      head('Orders', 'Every purchase made through the shop. Open one to see what was bought, where it goes, and to mark it packed, shipped or delivered.', [
        button(state.loading ? 'Loading…' : 'Refresh', load),
        button('Export CSV', exportCsv),
        el('a', { className: 'ia-btn ghost', href: 'https://dashboard.stripe.com/payments', target: '_blank', rel: 'noopener', textContent: 'Stripe ↗' }),
      ]),
      notices(),
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
        search(f.q, 'Order no., name, email, piece, tracking…', (v) => set('q', v)),
        select(f.period, PERIODS, (v) => set('period', v), 'Period'),
        select(f.sort, [['new', 'Newest first'], ['old', 'Oldest first'], ['high', 'Total: high to low'], ['low', 'Total: low to high'], ['name', 'Customer A–Z']], (v) => set('sort', v), 'Sort'),
      ]),
      f.customer ? el('div', { className: 'sl-filtering' }, [el('span', { textContent: `Orders from ${f.customer}` }), button('Show everyone', () => { state.o.customer = ''; history.replaceState(null, '', '#/sales/orders'); draw() }, 'sl-clear')]) : null,
      el('p', { className: 'sl-count', textContent: state.loading && !state.loaded ? 'Loading the orders…' : `${list.length} ${list.length === 1 ? 'order' : 'orders'}` }),
      list.length ? el('div', { className: 'sl-table is-orders', role: 'table' }, [
        el('div', { className: 'sl-row sl-th', role: 'row' }, ['Order', 'Customer', 'Pieces', 'Total', 'Payment', 'Status'].map((t) => el('span', { role: 'columnheader', textContent: t }))),
        ...list.slice(0, f.shown).map((o) => {
          const row = el('button', { type: 'button', className: `sl-row ${state.open === o.id ? 'on' : ''}`, role: 'row' }, [
            el('span', { className: 'sl-c-order' }, [el('strong', { textContent: `#${o.number}` }), el('small', { textContent: date(o.created, true) })]),
            el('span', { className: 'sl-c-who' }, [el('strong', { textContent: o.name || '—' }), el('small', { textContent: [o.email, country(o.country)].filter(Boolean).join(' · ') })]),
            el('span', { className: 'sl-c-items' }, [el('strong', { textContent: o.items[0] ? `${o.items[0].name}${o.items[0].qty > 1 ? ` ×${o.items[0].qty}` : ''}` : '—' }), o.items.length > 1 ? el('small', { textContent: `+ ${o.items.length - 1} more` }) : null]),
            el('span', { className: 'sl-c-total' }, [el('strong', { textContent: money(o.total, o.currency) }), o.refunded ? el('small', { textContent: `${money(o.refunded, o.currency)} refunded` }) : null]),
            el('span', {}, [badge(o.payment, PAYMENT[o.payment] || o.payment)]),
            el('span', {}, [done(o) ? badge(o.fulfilment, stageName[o.fulfilment]) : el('small', { className: 'sl-dim', textContent: '—' })]),
          ])
          row.addEventListener('click', () => { state.open = o.id; draw() })
          return row
        }),
      ]) : (state.loaded && !state.problem ? el('div', { className: 'sl-empty' }, [el('strong', { textContent: state.orders.length ? 'No orders match' : 'No orders yet' }), el('p', { textContent: state.orders.length ? 'Try another chip, period or search.' : 'Purchases made through the shop show up here.' })]) : null),
      list.length > f.shown ? button(`Show ${Math.min(PAGE, list.length - f.shown)} more`, () => set('shown', f.shown + PAGE), 'ia-btn ghost sl-more') : null,
    ]
  }

  // the panel of one order
  const orderPanel = (o) => {
    const close = () => { state.open = null; state.saved = null; draw() }
    let stage = o.fulfilment
    const stages = el('div', { className: 'sl-stages', role: 'radiogroup', ariaLabel: 'Status' }, STAGES.map(([k, t]) => {
      const b = el('button', { type: 'button', className: `sl-stage is-${k} ${k === stage ? 'on' : ''}`, role: 'radio', ariaChecked: String(k === stage), textContent: t })
      b.addEventListener('click', () => { stage = k; stages.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)) }); dirty() })
      return b
    }))
    const tracking = el('input', { className: 'sl-input', value: o.tracking, placeholder: 'For example CTT RR123456789PT', maxLength: 200 })
    const note = el('textarea', { className: 'sl-input', value: o.note, placeholder: 'Only you see this', maxLength: 480, rows: 3 })
    const save = el('button', { type: 'button', className: 'ia-btn', textContent: 'Save', disabled: true })
    const said = el('span', { className: 'sl-said', textContent: state.saved === o.id ? 'Saved ✓' : '' })
    state.saved = null
    const dirty = () => { save.disabled = stage === o.fulfilment && tracking.value === o.tracking && note.value === o.note; said.textContent = '' }
    tracking.addEventListener('input', dirty); note.addEventListener('input', dirty)
    save.addEventListener('click', async () => {
      save.disabled = true; said.textContent = 'Saving…'
      const r = await api('POST', { paymentIntent: o.paymentIntent, fulfilment: stage, tracking: tracking.value.trim(), note: note.value.trim() })
      if (r.ok) { Object.assign(o, { fulfilment: stage, tracking: tracking.value.trim(), note: note.value.trim() }); state.saved = o.id; draw() }
      else { said.textContent = r.json.message || 'Not saved. Try again.'; save.disabled = false }
    })
    const block = (title, kids) => el('section', { className: 'sl-block' }, [el('h3', { textContent: title }), ...kids])
    const panel = el('aside', { className: 'sl-panel', role: 'dialog', ariaModal: 'true', ariaLabel: `Order #${o.number}` }, [
      el('header', { className: 'sl-panel-head' }, [
        el('div', {}, [el('div', { className: 'ia-kicker', textContent: date(o.created, true) }), el('h2', { textContent: `Order #${o.number}` }), el('div', { className: 'sl-badges' }, [badge(o.payment, PAYMENT[o.payment] || o.payment), done(o) ? badge(o.fulfilment, stageName[o.fulfilment]) : null])]),
        button('×', close, 'sl-x'),
      ]),
      el('div', { className: 'sl-panel-body' }, [
        done(o) && o.paymentIntent ? block('Where it is up to', [stages, el('label', { className: 'sl-label' }, [el('span', { textContent: 'Tracking number' }), tracking]), el('label', { className: 'sl-label' }, [el('span', { textContent: 'Note' }), note]), el('div', { className: 'sl-save' }, [save, said])]) : null,
        block('Pieces', [
          el('ul', { className: 'sl-items' }, o.items.map((i) => el('li', {}, [el('span', { textContent: i.name }), el('small', { textContent: `× ${i.qty}` }), el('strong', { textContent: money(i.total, o.currency) })]))),
          el('div', { className: 'sl-sum' }, [el('span', { textContent: 'Total' }), el('strong', { textContent: money(o.total, o.currency) })]),
          o.refunded ? el('div', { className: 'sl-sum is-refund' }, [el('span', { textContent: 'Refunded' }), el('strong', { textContent: `− ${money(o.refunded, o.currency)}` })]) : null,
        ]),
        block('Customer', [
          el('p', { className: 'sl-who' }, [el('strong', { textContent: o.name || '—' }), o.email ? el('a', { href: `mailto:${o.email}?subject=${encodeURIComponent(`Your order #${o.number}`)}`, textContent: o.email }) : null, o.phone ? el('span', { textContent: o.phone }) : null]),
          o.email ? button('All orders from this customer', () => { state.open = null; location.hash = `#/sales/orders?customer=${encodeURIComponent(o.email)}` }, 'sl-link') : null,
        ]),
        o.shipTo.length ? block('Ship to', [el('p', { className: 'sl-address' }, [o.name, ...o.shipTo.slice(0, -1), country(o.shipTo[o.shipTo.length - 1])].filter(Boolean).flatMap((line, i) => (i ? [el('br'), line] : [line])))]) : null,
        block('Payment', [el('a', { className: 'ia-btn ghost', href: o.stripe, target: '_blank', rel: 'noopener', textContent: 'Open in Stripe ↗' }), el('p', { className: 'sl-dim', textContent: 'Refunds and receipts are done in Stripe.' })]),
      ]),
    ])
    const shade = el('div', { className: 'sl-shade' })
    shade.addEventListener('click', close)
    return [shade, panel]
  }

  // ---------- Customers ----------
  const customers = () => {
    const by = new Map()
    for (const o of state.orders.filter(done)) {
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
    const set = (k, v) => { state.c[k] = v; if (k !== 'shown') state.c.shown = PAGE; draw() }
    const cur = currency()
    const total = all.reduce((t, c) => t + c.spent, 0)
    return [
      head('Customers', 'Everyone who has bought from the shop, worked out from the orders. Open one to see their orders.', [
        button(state.loading ? 'Loading…' : 'Refresh', load),
        button('Export CSV', () => csv([['Name', 'Email', 'Country', 'Orders', 'Spent', 'Currency', 'First order', 'Last order'], ...list.map((c) => [c.name, c.email, country(c.country), c.orders, c.spent, c.currency, date(c.first), date(c.last)])], `customers-${new Date().toISOString().slice(0, 10)}.csv`)),
      ]),
      notices(),
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
        el('div', { className: 'sl-row sl-th', role: 'row' }, ['Customer', 'Country', 'Orders', 'Spent', 'Last order'].map((t) => el('span', { role: 'columnheader', textContent: t }))),
        ...list.slice(0, f.shown).map((c) => {
          const row = el('button', { type: 'button', className: 'sl-row', role: 'row' }, [
            el('span', { className: 'sl-c-who' }, [el('strong', { textContent: c.name || '—' }), el('small', { textContent: c.email })]),
            el('span', {}, [el('small', { textContent: country(c.country) || '—' })]),
            el('span', {}, [el('strong', { textContent: String(c.orders) }), c.waiting ? el('small', { className: 'sl-hot', textContent: `${c.waiting} to ship` }) : null]),
            el('span', { className: 'sl-c-total' }, [el('strong', { textContent: money(c.spent, c.currency) })]),
            el('span', {}, [el('small', { textContent: date(c.last) })]),
          ])
          row.addEventListener('click', () => { location.hash = `#/sales/orders?customer=${encodeURIComponent(c.email || c.name)}` })
          return row
        }),
      ]) : (state.loaded && !state.problem ? el('div', { className: 'sl-empty' }, [el('strong', { textContent: all.length ? 'Nobody matches' : 'No customers yet' }), el('p', { textContent: all.length ? 'Try another chip or search.' : 'Everyone who buys from the shop shows up here.' })]) : null),
      list.length > f.shown ? button(`Show ${Math.min(PAGE, list.length - f.shown)} more`, () => set('shown', f.shown + PAGE), 'ia-btn ghost sl-more') : null,
    ]
  }

  // ---------- drawing ----------
  const draw = () => {
    if (!root) return
    const scroll = root.scrollTop
    const focusedSearch = document.activeElement && document.activeElement.classList.contains('sl-search')
    const caret = focusedSearch ? document.activeElement.selectionStart : null
    const open = state.view === 'orders' && state.open && state.orders.find((o) => o.id === state.open)
    root.replaceChildren(el('div', { className: 'sl-inner' }, state.view === 'customers' ? customersView() : ordersView()), ...(open ? orderPanel(open) : []))
    root.scrollTop = scroll
    if (focusedSearch) { const s = root.querySelector('.sl-search'); if (s) { s.focus(); s.setSelectionRange(caret, caret) } }
  }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.open) { state.open = null; draw() } })

  /* Called by shell.js whenever the address changes to a Sales screen. */
  const show = (view, params) => {
    const before = state.view
    state.view = view === 'customers' ? 'customers' : 'orders'
    if (state.view === 'orders') state.o.customer = params.get('customer') || ''
    if (before !== state.view) state.open = null
    if (!state.loaded && !state.loading) load()
    else draw()
    if (before !== state.view) root.scrollTop = 0
  }

  return {
    mount,
    show,
    links: [
      { view: 'orders', href: '#/sales/orders', label: 'Orders', icon: 'M6 3h12l1 4H5z M5 7h14v13H5z M9 11h6 M9 15h4' },
      { view: 'customers', href: '#/sales/customers', label: 'Customers', icon: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20v-1a5.5 5.5 0 0 1 5.5-5.5h2A5.5 5.5 0 0 1 15.5 19v1 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18 13.7a5.5 5.5 0 0 1 3.5 5.3v1' },
    ],
  }
})()
