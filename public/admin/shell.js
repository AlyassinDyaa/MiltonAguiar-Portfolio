/* Milton Aguiar admin shell.
   Decap CMS renders the editing screens; this adds what makes them easy to get around:
   1. a left navigation that never goes away, in groups (see NAV), with an overview screen of
      tiles in the same groups and the same heading on every screen;
   2. edit forms broken into named groups, with short fields side by side;
   3. "Save" where Decap says "Publish", and after saving a return to the list the entry came from;
   4. a friendlier picture picker (the chosen picture is marked; double-click uses it);
   5. a proper "are you sure?" dialog in place of the browser's own;
   6. a slider for the brand colour (a hue). */
(() => {
  const el = (tag, props = {}, kids = []) => {
    const n = Object.assign(document.createElement(tag), props)
    kids.forEach((k) => k != null && n.append(k))
    return n
  }
  const currentSection = () => (location.hash.match(/^#\/collections\/([^/?]+)/) || [])[1]
  const HOME = '#/home'

  /* Small line icons for the navigation and the Home tiles, keyed by section name. */
  const ICONS = {
    home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    work: 'M4 5h16v14H4z M4 15l4-4 4 4 3-3 5 5 M9 9h.01',
    shop: 'M5 8h14l-1 12H6z M9 8V6a3 3 0 0 1 6 0v2',
    comics: 'M12 7v13 M12 7c-2-1.600-5-2-8-1.500v13c3-.500 6-.100 8 1.500 M12 7c2-1.600 5-2 8-1.500v13c-3-.500-6-.100-8 1.500',
    gallery_sections: 'M4 4h7v9H4z M13 4h7v5h-7z M13 11h7v9h-7z M4 15h7v5H4z',
    redraws: 'M4 5h16v14H4z M12 3v18 M8 10l-2 2 2 2 M16 10l2 2-2 2',
    events: 'M5 6h14v14H5z M5 10h14 M9 4v4 M15 4v4',
    settings: 'M4 7h10 M18 7h2 M4 17h4 M12 17h8 M16 5v4 M10 15v4',
    pictures: 'M4 5h16v14H4z M4 15l4-4 4 4 3-3 5 5 M9 9h.01',
    signout: 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4 M10 16l-4-4 4-4 M6 12h10',
    view_list: 'M4 6h16 M4 12h16 M4 18h16',
    view_compact: 'M4 5h16 M4 9.5h16 M4 14h16 M4 18.5h16',
    view_cards: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
    view_gallery: 'M4 4h16v16H4z M4 15l4.5-4.5 4 4 2.5-2.5 5 5',
  }
  const icon = (name) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v)
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', ICONS[name] || ICONS.settings)
    svg.append(path)
    return svg
  }

  /* How each form is laid out. `groups` puts a heading above the named field;
     `half` fields sit two to a row; `inner` fields, which live inside a group of fields,
     sit three to a row. Field names are the ones in config.yml. A form in a collection of
     single pages is looked up as "collection/page". A heading on an on/off switch is drawn
     above the switch's box (admin.css, "10. The shop"). */
  const LAYOUT = {
    work: { groups: { title: 'The piece', src: 'Picture, and where it shows', inShop: 'For sale', sizes: 'Sizes and prices' }, half: ['title', 'category', 'date', 'link', 'featured', 'homeOrder', 'rough', 'hidden', 'type', 'look', 'price', 'salePrice', 'universe', 'shopOnly'] },
    'site/categories': { groups: { categories: 'Categories', subcategories: 'Sub categories', sizes: 'Print sizes' }, half: [] },
    shop: { groups: { title: 'The item', price: 'Price', category: 'Where it shows', sizes: 'Sizes and prices' }, half: ['price', 'salePrice', 'type', 'look', 'category', 'universe', 'shopOnly', 'hidden'] },
    comics: { groups: { title: 'The comic', cover: 'Cover and pages', order: 'Rarely needed' }, half: ['title', 'text', 'order', 'hidden'] },
    gallery_sections: { groups: { title: 'Section', from: 'Pictures' }, half: ['title', 'order'] },
    events: { groups: { name: 'The event', order: 'Rarely needed' }, half: ['name', 'when', 'role', 'place', 'order', 'hidden'] },
    'pages/home': {
      groups: { kicker: 'Top of the page', buttons: 'Buttons', figure: 'Drawing in the title panel', marquee: 'Moving band of words', project: 'Current project', latestLabel: 'Latest pieces', redrawLabel: 'Pencils to colours', commissionsTitle: 'Commissions', eventsLabel: 'Conventions' },
      half: ['latestLabel', 'latestTitle', 'redrawLabel', 'redrawTitle', 'commissionsTitle', 'commissionsButton', 'eventsLabel', 'eventsTitle'],
      inner: ['size', 'x', 'y', 'label', 'title', 'subtitle', 'buttonLabel', 'url', 'secondLabel', 'secondUrl', 'words', 'to', 'address', 'tone', 'off', 'text'],
    },
    'pages/lists': { groups: { workLabel: 'Work page', samplesLabel: 'Comic samples (on the Work page)', galleryLabel: 'Gallery page' }, half: ['workLabel', 'workTitle', 'samplesLabel', 'samplesTitle', 'galleryLabel', 'galleryTitle'] },
    'pages/commissions': {
      groups: { open: 'Open or closed', title: 'Top of the page', tiers: 'What you offer', quoteLabel: 'The quote button', processLabel: 'How it works', requestLabel: 'Request form', notes: 'Good to know' },
      half: ['quoteLabel', 'quoteVia', 'processLabel', 'processTitle', 'requestLabel', 'requestTitle'],
    },
    'pages/about': { groups: { title: 'Top of the page', story: 'Origin story', facts: 'The artist file' }, half: [] },
    'pages/contact': { groups: { label: 'Top of the page', topics: 'Form' }, half: ['label', 'title'] },
    'site/brand': { groups: { name: 'Name', hue: 'Look', email: 'Contact details', social: 'Social links', footerLine: 'Footer' }, half: ['name', 'artist', 'email', 'location'] },
    'site/shop': {
      groups: { enabled: 'Selling online', label: 'The Shop page', currency: 'Prices and the cart', look: 'What you sell', signedChoice: 'Signed pieces', shipping: 'Delivery', thanksTitle: 'After a purchase', emails: 'Emails to you' },
      half: ['label', 'title', 'emptyTitle', 'emptyText', 'currency', 'buttonLabel', 'pricePlace', 'tagPlace', 'signedChoice', 'signedExtra', 'thanksTitle', 'thanksText'],
    },
    'site/account': { groups: { accounts: 'Accounts', cardLabel: 'On their page', icons: 'Free profile pictures' }, half: ['noteTitle', 'signature', 'collectionTitle', 'savedTitle'] },
    'site/rewards': { groups: { rewardText: 'Before they confirm', pictures: 'Profile pictures', cards: 'Membership card designs', discounts: 'Discounts' }, half: [], inner: ['earnedBy', 'count', 'percent', 'days', 'cardLook'] },
    'site/sales': { groups: {}, half: [], inner: ['percent', 'appliesTo', 'category', 'subcategory', 'type', 'starts', 'ends', 'on'] },
    'site/visibility': { groups: {}, half: [], inner: ['work', 'shop', 'gallery', 'category', 'subcategory', 'type', 'testOrders', 'testCustomers', 'testCodes', 'commissions', 'about', 'contact', 'dark', 'light', 'watermark', 'comicsWatermark', 'ticker', 'project', 'latest', 'redraws', 'events'] },
  }

  /* The navigation and the Overview, group by group, in this order. An item is a section of
     config.yml ("work", "site/shop"), a screen of sales.js ("sales:orders") or the picture
     library ("media"). A section missing here still shows, at the end of Site. */
  const NAV = [
    { label: 'Orders & customers', lead: 'Who bought what, commissions, and writing to your customers.', items: ['sales:orders', 'sales:customers', 'sales:emails'] },
    { label: 'Your art', lead: 'What you add to over time.', items: ['work', 'comics', 'gallery_sections', 'events'] },
    { label: 'Shop', lead: 'What you sell, what it costs, and how buyers pay.', items: ['shop', 'site/sales', 'sales:discounts', 'site/categories', 'site/shop'] },
    { label: 'Members', lead: 'Customer accounts, and what members earn.', items: ['site/rewards', 'site/account'] },
    { label: 'Page text', lead: 'Headings, introductions and buttons, one form per page.', items: ['pages/home', 'pages/lists', 'pages/commissions', 'pages/about', 'pages/contact'] },
    { label: 'Site', lead: 'Your name and colour, what is switched on, and every picture.', items: ['site/brand', 'site/visibility', 'media'] },
  ]
  /* Names in the navigation (narrow). Tiles and form headings use the label in config.yml,
     which says the same thing in full ("Home page" for "Home"). */
  const SHORT = { 'pages/home': 'Home', 'pages/lists': 'Work & Gallery', 'pages/commissions': 'Commissions', 'pages/about': 'About', 'pages/contact': 'Contact', 'site/brand': 'Brand & contact', shop: 'Items for sale', 'site/shop': 'Settings & payments', 'site/categories': 'Categories & sizes', 'site/account': 'Member settings', 'site/rewards': 'Rewards', 'site/sales': 'Price cuts', 'site/visibility': 'Show / hide' }
  /* One line about each part: its tile on the Overview, and the line under its heading. */
  const ABOUT = {
    'sales:orders': 'Shop orders and commissions: mark them packed and shipped, answer messages, send quotes.',
    'sales:customers': 'Everyone who has bought or has an account: their orders, codes and rewards.',
    'sales:emails': 'News and notices to many customers at once, from ready-made emails.',
    'sales:discounts': 'Codes buyers type at the checkout: one per chosen customer, or one to share.',
    work: 'Your pieces. A new one shows on the Work page, the home page and the gallery.',
    comics: 'A few pages of a comic, read as a small book on the Work page.',
    gallery_sections: 'The Gallery page, in sections you name. Off until you switch it on in Show / hide.',
    events: 'Conventions, markets and signings where people can meet you.',
    shop: 'Everything you sell: prints, original art, comics, with prices and sizes.',
    media: 'Every picture uploaded to the site. Upload new ones or remove old ones.',
    'pages/home': 'The top of the home page, its drawing, the current project, the pencils-to-colours sets and the heading of each part.',
    'pages/lists': 'The heading and introduction of the Work page, its comic samples and the Gallery page.',
    'pages/commissions': 'Open or closed, what you offer and what it costs, where "Get a quote" goes, how it works.',
    'pages/about': 'Who you are: the heading, your story a panel at a time, and the artist file.',
    'pages/contact': 'The heading, the introduction and what visitors can say their message is about.',
    'site/brand': 'Site name, tagline, brand colour, logo, email, social links and the footer.',
    'site/shop': 'Shop on or off, how buyers pay, currency, what you sell, signed pieces, delivery, emails to you.',
    'site/categories': 'Categories, sub categories and print sizes: add, rename, reorder or hide them.',
    'site/visibility': 'Switch pages, dark or light mode, parts of the home page and test data on or off.',
    'site/account': 'Accounts on or off, the membership card, your note on their page, free profile pictures.',
    'site/rewards': 'Profile pictures, card designs and discounts members earn by confirming their email, ordering or collecting.',
    'site/sales': 'Automatic price cuts with a start and an end: 10% off everything, 25% off a category. No code needed.',
  }
  Object.assign(ICONS, {
    'pages/home': 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    'pages/lists': 'M4 5h16 M4 10h10 M4 15h16 M4 20h8',
    'pages/commissions': 'M5 4h14v16l-3.500-2-3.500 2-3.500-2L5 20z M9 9h6 M9 13h4',
    'pages/about': 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
    'pages/contact': 'M4 6h16v12H4z M4 7l8 6 8-6',
    'site/brand': 'M12 3l2.600 5.600 6.100.700-4.500 4.200 1.200 6-5.400-3-5.400 3 1.200-6L3.300 9.300l6.100-.700z',
    'site/shop': 'M5 8h14l-1 12H6z M9 8V6a3 3 0 0 1 6 0v2',
    'site/categories': 'M4 5h7v7H4z M13 5h7v7h-7z M4 14h7v5H4z M13 14h7v5h-7z',
    'site/account': 'M12 12.200a4.200 4.200 0 1 0 0-8.400 4.200 4.200 0 0 0 0 8.400z M4 20.500c.800-3.600 4-5.800 8-5.800s7.200 2.200 8 5.800',
    'site/rewards': 'M8 4h8v5a4 4 0 0 1-8 0z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M8 20h8 M9.500 17h5v3h-5z',
    'site/sales': 'M20.600 13.400l-7.200 7.200a2 2 0 0 1-2.800 0L3 13V3h10l7.600 7.600a2 2 0 0 1 0 2.800z M7.500 7.500h.010 M9.500 15.500l6-6 M10.500 10.500h.010 M14.500 14.500h.010',
    'site/visibility': 'M2.500 12s3.500-6.500 9.500-6.500 9.500 6.500 9.500 6.500-3.500 6.500-9.500 6.500S2.500 12 2.500 12z M12 9.500a2.500 2.500 0 1 0 0 5 2.500 2.500 0 0 0 0-5z',
  })
  ICONS.adminhome = 'M4 4h7v7H4z M13 4h7v4h-7z M13 10h7v10h-7z M4 13h7v7H4z'
  ICONS.menu = 'M4 7h16 M4 12h16 M4 17h16'
  ICONS.library = 'M4 7h12v12H4z M8 7V4h12v12h-4 M4 16l3.500-3.500 3 3 2-2 3.500 3.500'
  ICONS.external = 'M14 5h5v5 M19 5l-8 8 M11 7H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5'

  const currentFile = () => (location.hash.match(/^#\/collections\/[^/]+\/entries\/([^/?]+)/) || [])[1]
  const layoutNow = () => LAYOUT[`${currentSection()}/${currentFile()}`] || LAYOUT[currentSection()]
  /* Collections that are a fixed set of single pages rather than a list that grows. */
  const singles = new Set()
  let known = [] // every section, once config.yml has been read

  // ---------- read the sections out of config.yml ----------
  // A list that grows is one section. A collection of single pages gives one section per page.
  const readSections = async () => {
    const cfg = (await (await fetch('config.yml')).text()).replace(/\r\n/g, '\n')
    const body = cfg.slice(cfg.indexOf('\ncollections:'))
    const pick = (text, indent, key) => ((text.match(new RegExp(`^ {${indent}}${key}: (.+)$`, 'm')) || [])[1] || '').trim().replace(/^['"]|['"]$/g, '')
    return body.split(/\n {2}- name: /).slice(1).flatMap((block) => {
      const name = block.split('\n')[0].trim()
      if (!/^ {4}files:$/m.test(block)) return [{ name, key: name, label: pick(block, 4, 'label'), singular: pick(block, 4, 'label_singular') || pick(block, 4, 'label'), description: '', canAdd: /^ {4}create: true$/m.test(block) }]
      singles.add(name)
      return block.slice(block.indexOf('\n    files:')).split(/\n {6}- name: /).slice(1).map((entry) => {
        const file = entry.split('\n')[0].trim()
        return { name, file, key: `${name}/${file}`, label: pick(entry, 8, 'label'), description: '', canAdd: false }
      })
    })
  }

  const openMedia = (tries = 0) => {
    const btn = [...document.querySelectorAll('header button')].find((b) => /media/i.test(b.textContent))
    if (btn) return btn.click()
    if (tries === 0) location.hash = '#/collections/work'
    if (tries < 30) setTimeout(() => openMedia(tries + 1), 150)
  }

  const build = async () => {
    const sections = known = await readSections()
    const Sales = window.IASales
    const hrefOf = (s) => (s.file ? `#/collections/${s.name}/entries/${s.file}` : `#/collections/${s.name}`)
    if (Sales) Sales.links.forEach((l) => { ICONS[`sales:${l.view}`] = l.icon })
    ICONS.media = ICONS.library
    // every item of NAV, made into what the navigation and the tiles need
    const part = (id) => {
      if (id === 'media') return { id, kind: 'media', label: 'Pictures', title: 'Pictures', about: ABOUT.media }
      if (id.startsWith('sales:')) {
        const l = Sales && Sales.links.find((x) => `sales:${x.view}` === id)
        return l ? { id, kind: 'sales', view: l.view, href: l.href, label: l.label, title: l.label, about: ABOUT[id] || '' } : null
      }
      const s = sections.find((x) => x.key === id)
      return s ? { id, kind: 'section', s, href: hrefOf(s), label: SHORT[s.key] || s.label, title: s.label, about: ABOUT[s.key] || s.description } : null
    }
    const listed = new Set(NAV.flatMap((g) => g.items))
    const groups = NAV.map((g, i) => {
      const ids = [...g.items]
      // a section added to config.yml but not to NAV: in the last group, before Pictures
      if (i === NAV.length - 1) ids.splice(ids.includes('media') ? ids.indexOf('media') : ids.length, 0, ...sections.map((s) => s.key).filter((k) => !listed.has(k)))
      return { ...g, parts: ids.map(part).filter(Boolean) }
    }).filter((g) => g.parts.length)
    groupOf = (id) => (groups.find((g) => g.parts.some((p) => p.id === id)) || {}).label || ''

    // ---- left navigation
    const search = el('input', { type: 'search', placeholder: 'Search everything', ariaLabel: 'Search everything' })
    const form = el('form', { className: 'ia-search' }, [search])
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const q = search.value.trim()
      if (q) location.hash = `#/search/${encodeURIComponent(q)}`
    })
    const home = el('a', { href: HOME, className: 'ia-home-link' }, [icon('adminhome'), el('span', { textContent: 'Overview' })])
    const links = [] // [link, part]
    const badges = {} // part id -> its count in the navigation
    const linkTo = (p) => {
      if (p.kind === 'media') {
        const b = el('button', { type: 'button', title: p.title }, [icon('library'), el('span', { textContent: p.label })])
        b.addEventListener('click', () => openMedia())
        return b
      }
      const badge = el('b', { className: 'ia-count', hidden: true })
      badges[p.id] = badge
      const a = el('a', { href: p.href, title: p.title }, [icon(p.id), el('span', { textContent: p.label }), badge])
      links.push([a, p])
      return a
    }
    // Sign out: forget this browser's login and show the login page again. (Unsaved changes on
    // an open form still get the browser's "leave this page?" question first.)
    const out = el('button', { type: 'button', className: 'ia-out' }, [icon('signout'), el('span', { textContent: 'Sign out' })])
    out.addEventListener('click', () => {
      try { if (window.netlifyIdentity && window.netlifyIdentity.currentUser()) window.netlifyIdentity.logout() } catch { /* not that kind of login */ }
      try { localStorage.removeItem('decap-cms-user') } catch { /* nothing stored */ }
      location.hash = '#/'
      location.reload()
    })
    const scroller = el('div', { className: 'ia-scroll' }, [
      el('nav', { ariaLabel: 'Admin' }, [home]),
      ...groups.flatMap((g) => [el('div', { className: 'ia-label', textContent: g.label }), el('nav', { ariaLabel: g.label }, g.parts.map(linkTo))]),
    ])
    const side = el('aside', { className: 'ia-side' }, [
      el('a', { className: 'ia-brand', href: HOME }, [el('img', { src: '../favicon.png', alt: '' }), el('span', {}, [el('strong', {}, ['Milton ', el('b', { textContent: 'Aguiar' })]), el('small', { textContent: 'Admin' })])]),
      form,
      // the list scrolls by itself on a short screen; the brand above and the foot below stay put
      scroller,
      el('div', { className: 'ia-foot' }, [
        el('a', { className: 'ia-site', href: '../', target: '_blank', rel: 'noopener' }, [icon('external'), el('span', { textContent: 'View site' })]),
        out,
      ]),
    ])

    // ---- overview: the same groups as tiles, under a strip of what needs doing
    const btn = (text, href, ghost) => el('a', { className: `ia-btn${ghost ? ' ghost' : ''}`, href, textContent: text })
    const actionsOf = (p) => {
      if (p.kind === 'media') { const b = el('button', { type: 'button', className: 'ia-btn', textContent: 'Open the library' }); b.addEventListener('click', () => openMedia()); return [b] }
      if (p.id === 'sales:orders') return [btn('Open', p.href), btn('Commissions', '#/sales/orders?tab=commissions', true)]
      if (p.id === 'sales:emails') return [btn('Write an email', p.href)]
      if (p.kind === 'sales') return [btn('Open', p.href)]
      if (p.s.file) return [btn('Edit', p.href)]
      return [btn('See all', p.href), p.s.canAdd ? btn(`+ New ${p.s.singular.toLowerCase()}`, `#/collections/${p.s.name}/new`, true) : null]
    }
    const tile = (p) => el('div', { className: 'ia-tile' }, [
      el('div', { className: 'ia-tile-icon' }, [icon(p.id)]),
      el('h3', { textContent: p.title }),
      el('p', { textContent: p.about }),
      el('div', { className: 'ia-tile-actions' }, actionsOf(p)),
    ])
    // at a glance (sales.js): filled in once the orders and commissions have been asked for
    const glance = Sales ? el('div', { className: 'ia-glance', ariaLabel: 'At a glance', role: 'group' }) : null
    const fact = (label, n, href, hot, note) => el('a', { className: `ia-fact${hot ? ' is-hot' : ''}`, href }, [el('span', { textContent: label }), el('strong', { textContent: n == null ? '–' : String(n) }), el('small', { textContent: note })])
    const homeScreen = el('main', { className: 'ia-home' }, [
      el('div', { className: 'ia-home-inner' }, [
        el('div', { className: 'ia-kicker', textContent: 'Overview' }),
        el('h1', { textContent: 'What do you want to update?' }),
        el('p', { className: 'ia-lead', textContent: 'Pick a part of the site. Changes go live when you press Save.' }),
        glance,
        ...groups.map((g) => el('section', { className: 'ia-group' }, [
          el('h2', { textContent: g.label }),
          el('p', { textContent: g.lead }),
          el('div', { className: 'ia-tiles' }, g.parts.map(tile)),
        ])),
      ]),
    ])
    // the counts in the navigation and the strip, whenever sales.js has news
    const paintCounts = () => {
      const c = Sales && Sales.glance && Sales.glance()
      if (!c) return
      const orders = (c.ready ? c.toShip : 0) + (c.commissions ? c.unread : 0)
      const b = badges['sales:orders']
      if (b) {
        b.hidden = !orders
        b.textContent = String(orders)
        b.title = [c.toShip ? `${c.toShip} to ship` : '', c.unread ? `${c.unread} unread ${c.unread === 1 ? 'message' : 'messages'}` : ''].filter(Boolean).join(' · ')
      }
      if (glance) glance.replaceChildren(
        fact('To ship', c.ready ? c.toShip : null, '#/sales/orders?stage=to-ship', c.toShip > 0, c.ready ? (c.toShip ? 'paid, waiting to be posted' : 'nothing waiting') : 'loading…'),
        fact('Unread messages', c.commissions ? c.unread : null, '#/sales/orders?tab=commissions&chip=unread', c.unread > 0, c.commissions ? 'on commissions' : 'loading…'),
        fact('To quote', c.commissions ? c.toQuote : null, '#/sales/orders?tab=commissions&chip=to-answer', c.toQuote > 0, c.commissions ? 'commissions asked for' : 'loading…'),
        fact('Customers', c.customers, '#/sales/customers', false, c.customers == null ? 'loading…' : 'buyers and members'),
      )
    }
    addEventListener('ia-sales-change', paintCounts)

    // ---- phones and small tablets: the navigation is a drawer, opened from a bar across the top
    const menu = el('button', { type: 'button', className: 'ia-menu', ariaLabel: 'Menu' }, [icon('menu')])
    menu.setAttribute('aria-expanded', 'false')
    const where = el('span', { className: 'ia-top-where' })
    const top = el('div', { className: 'ia-top' }, [menu, el('a', { className: 'ia-top-brand', href: HOME }, [el('img', { src: '../favicon.png', alt: '' }), el('strong', {}, ['Milton ', el('b', { textContent: 'Aguiar' })])]), where])
    const shade = el('div', { className: 'ia-shade' })
    const drawer = (open) => {
      document.documentElement.toggleAttribute('data-ia-menu', open)
      menu.setAttribute('aria-expanded', String(open))
      // opening: the entry for this screen in view
      if (open) (scroller.querySelector('a.on') || home).scrollIntoView({ block: 'nearest' })
    }
    menu.addEventListener('click', () => drawer(!document.documentElement.hasAttribute('data-ia-menu')))
    shade.addEventListener('click', () => drawer(false))
    side.addEventListener('click', (e) => { if (e.target.closest('a, button')) drawer(false) })
    addEventListener('hashchange', () => drawer(false))
    addEventListener('keydown', (e) => { if (e.key === 'Escape') drawer(false) })
    document.body.append(top, shade, side, homeScreen, ...(Sales ? [Sales.mount()] : []))

    // the counts: asked for on the Overview, and every few minutes elsewhere (the Sales screens keep their own)
    let askedAt = 0
    const refresh = (members) => {
      if (!Sales || !Sales.prefetch || document.hidden || document.documentElement.hasAttribute('data-ia-sales')) return
      askedAt = Date.now()
      Sales.prefetch({ members }).then(paintCounts, () => {})
    }
    setInterval(() => { if (Date.now() - askedAt > 4 * 60 * 1000) refresh(false) }, 30 * 1000)

    const sync = () => {
      // an address left over from an older layout of this panel (a bookmark, a tab left open)
      // names a section that no longer exists: show the overview instead of an empty form
      const section = currentSection()
      if (section && !sections.some((s) => s.name === section)) { location.hash = HOME; return }
      const onHome = location.hash === HOME
      const [, salesView, salesQuery = ''] = location.hash.match(/^#\/sales\/(orders|customers|discounts|emails)\/?(?:\?(.*))?$/) || []
      document.documentElement.toggleAttribute('data-ia-home', onHome)
      document.documentElement.toggleAttribute('data-ia-sales', Boolean(salesView && Sales))
      if (salesView && Sales) Sales.show(salesView, new URLSearchParams(salesQuery))
      home.classList.toggle('on', onHome)
      let here = onHome ? 'Overview' : ''
      for (const [a, p] of links) {
        const on = !onHome && (p.kind === 'sales' ? p.view === salesView : !salesView && p.s.name === section && (!p.s.file || p.s.file === currentFile()))
        a.classList.toggle('on', on)
        if (on) { a.setAttribute('aria-current', 'page'); here = p.label } else a.removeAttribute('aria-current')
      }
      if (onHome) home.setAttribute('aria-current', 'page'); else home.removeAttribute('aria-current')
      where.textContent = here
      if (onHome) refresh(true)
    }
    addEventListener('hashchange', sync)
    sync()
    paintCounts()
  }
  // the group a part of the admin sits in ("Your art" for "work"), once the navigation is built
  let groupOf = () => ''

  // Land on Home rather than on whichever section happens to be first.
  const landing = !location.hash || location.hash === '#/' || location.hash === '#'
  if (landing) {
    const wait = setInterval(() => {
      if (document.querySelector('[class*="AppHeader"]')) { clearInterval(wait); location.hash = HOME }
    }, 200)
    setTimeout(() => clearInterval(wait), 20000)
  }
  build().catch((e) => console.warn('admin navigation unavailable', e))

  // ---------- never jump straight from one open entry to another ----------
  /* Decap only loads an entry when its editor opens. Going directly from one entry to another
     (for instance clicking "Home page" while a piece is open) keeps the editor open and
     would show the first entry's values in the second entry's form. So such a jump goes by way
     of an address Decap has nothing to show for, which closes the editor without loading
     anything, and straight on to the form that was asked for; anything else (back/forward
     buttons) falls back to a clean reload.

     While a form is on its way, Decap blanks the page and writes "Loading entry...". In its
     place the panel shows the outline of the form at once, under the right heading, and the
     real fields replace it as soon as they arrive (see "waiting" below). */
  const BETWEEN = '#/between'
  const isEntry = (hash) => /^#\/collections\/[^/]+\/(new|entries\/)/.test(hash)
  const editorOpen = () => !!document.querySelector('[class*="ToolbarContainer"]')
  let steering = false
  document.addEventListener('click', (e) => {
    const link = e.target.closest?.('a[href^="#/collections/"]')
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return
    const target = link.getAttribute('href')
    if (!isEntry(target) || !isEntry(location.hash) || target === location.hash) return
    e.preventDefault()
    steering = true
    const back = location.hash
    waiting(target)
    location.hash = BETWEEN // Decap asks first if there are unsaved changes
    let tries = 0
    const go = setInterval(() => {
      if (location.hash === back && tries > 2) { clearInterval(go); steering = false; waiting(null) } // the admin chose to stay
      else if (!editorOpen()) { clearInterval(go); location.hash = target; setTimeout(() => { steering = false }, 300) }
      else if (++tries > 60) { clearInterval(go); steering = false; waiting(null) }
    }, 20)
  }, true)

  /* ---------- waiting: the outline of a form, shown until the form itself is there ---------- */
  let outline = null
  const waiting = (hash) => {
    if (outline) { clearInterval(outline.watch); outline.box.remove(); outline = null }
    if (!hash || !isEntry(hash)) return
    const [, name, , file] = hash.match(/^#\/collections\/([^/]+)\/(new|entries\/([^/?]+))/) || []
    const section = known.find((s) => s.name === name && (s.file ? s.file === file : true))
    const title = !section ? '' : section.file ? section.label : /\/new/.test(hash) ? `New ${section.singular.toLowerCase()}` : section.label
    const row = (wide) => el('div', { className: `ia-wait-field ${wide ? 'wide' : ''}` }, [el('i'), el('b')])
    const box = el('div', { className: 'ia-wait', ariaHidden: 'true' }, [
      el('div', { className: 'ia-wait-bar' }, [el('span', { className: 'ia-wait-back' }), el('strong', { textContent: title })]),
      el('div', { className: 'ia-wait-form' }, [row(true), row(), row(), row(true), row(), row()]),
    ])
    document.body.append(box)
    const since = Date.now()
    const watch = setInterval(() => {
      const ready = location.hash === hash && document.querySelector('[class*="ControlPaneContainer"] label')
      if (ready || Date.now() - since > 12000) waiting(null)
    }, 30)
    outline = { box, watch }
  }
  // the same outline when a form is opened from a list, a tile or the navigation
  addEventListener('hashchange', (e) => {
    const to = new URL(e.newURL).hash
    if (isEntry(to) && !outline && !document.querySelector('[class*="ControlPaneContainer"] label')) waiting(to)
    if (!isEntry(to) && to !== BETWEEN) waiting(null)
  })
  addEventListener('hashchange', (e) => {
    const from = new URL(e.oldURL).hash, to = new URL(e.newURL).hash
    const saved = /^#\/collections\/[^/]+\/new/.test(from) && /\/entries\//.test(to) // a new entry getting its address
    // (moving on to a brand-new entry is fine: Decap starts that one empty by itself)
    if (!steering && !saved && isEntry(from) && /\/entries\//.test(to) && from !== to) location.reload()
  })

  // ---------- form layout: tag fields so the stylesheet can group and pair them ----------
  const tagFields = () => {
    const layout = layoutNow()
    const pane = document.querySelector('[class*="ControlPaneContainer"]:not([class*="PreviewPaneContainer"])')
    if (!pane) return
    for (const field of pane.children) {
      const name = ((field.querySelector(':scope > [class*="ControlTopbar"] label[for], :scope > label[for]') || {}).htmlFor || '').replace(/-field-\d+$/, '')
      const group = layout && layout.groups[name]
      const half = layout && layout.half.includes(name)
      // only touch the attribute when it is wrong, so this never loops with the observer below
      if (group && field.dataset.iaGroup !== group) field.dataset.iaGroup = group
      if (!group && 'iaGroup' in field.dataset) delete field.dataset.iaGroup
      if (half && !('iaHalf' in field.dataset)) field.dataset.iaHalf = ''
      if (!half && 'iaHalf' in field.dataset) delete field.dataset.iaHalf
    }
    // short fields inside a group of fields (a picture's size, position, turn...) share rows too
    const inner = (layout && layout.inner) || []
    for (const label of inner.length ? pane.querySelectorAll('[class*="ControlContainer"] [class*="ControlContainer"] label[for]') : []) {
      const field = label.closest('[class*="ControlContainer"]')
      if (!inner.includes(label.htmlFor.replace(/-field-\d+$/, '')) || 'iaInner' in field.dataset) continue
      field.dataset.iaInner = ''
      field.parentElement.dataset.iaGrid = ''
    }
    markRequired(pane)
    nameTheForm()
    tidySales(pane)
    tidyQuote(pane)
    // the kinds of thing sold (Shop and payments) are drawn as slim rows, name and line side by side
    for (const field of pane.querySelectorAll('[class*="ControlContainer"]')) {
      const name = (field.querySelector(':scope > [class*="ControlTopbar"] label[for]') || {}).htmlFor || ''
      const compact = currentSection() === 'site' ? /^(types|categories|subcategories|sizes)-field/.test(name) : /^sizes-field/.test(name)
      if (compact !== field.classList.contains('ia-compact')) field.classList.toggle('ia-compact', compact)
      // the free profile pictures (Member settings): a grid of round tiles
      const pics = currentSection() === 'site' && /^(icons|verifiedIcons)-field/.test(name)
      if (pics !== field.classList.contains('ia-pics')) field.classList.toggle('ia-pics', pics)
    }
    for (const input of pane.querySelectorAll('.ia-compact input:not([placeholder]), .ia-pics input:not([placeholder])')) {
      const label = input.closest('[class*="ControlContainer"]')?.querySelector('label')
      if (label) input.placeholder = label.textContent.replace(/\s*\(optional\)\s*$/i, '')
    }
  }

  /* ---------- a price cut (Shop → Price cuts) ----------
     Each price cut has one "which" field to go with its "On what": the category, sub category or type
     it covers. The other two are hidden (whatever they still hold is ignored by the site). One
     folded shut says what it covers and where it is up to, after its name and cut:
     "Black Friday — 10% off · everything · on now". */
  const SALE_ON = { 'A category': 'category', 'A sub category': 'subcategory', 'A type': 'type' }
  const tidySales = (pane) => {
    if (`${currentSection()}/${currentFile()}` !== 'site/sales') return
    const fieldIn = (item, name) => { const label = item.querySelector(`label[for^="${name}-field"]`); return label && label.closest('[class*="ControlContainer"]') }
    const shown = (field) => ((field && field.querySelector('[class*="singleValue"]')) || {}).textContent || ''
    for (const item of pane.querySelectorAll('[class*="-listControlItem"]')) {
      const kind = SALE_ON[shown(fieldIn(item, 'appliesTo')).trim()] || 'all'
      for (const name of ['category', 'subcategory', 'type']) {
        const field = fieldIn(item, name)
        if (field && field.hasAttribute('data-ia-off') !== (name !== kind)) field.toggleAttribute('data-ia-off', name !== kind)
      }
      // what it covers, and whether it is running
      const what = kind === 'all' ? 'everything' : shown(fieldIn(item, kind)).trim() || `no ${kind === 'subcategory' ? 'sub category' : kind} chosen`
      const at = (name) => { const input = (fieldIn(item, name) || item).querySelector('input[type="datetime-local"], input[type="date"]'); const t = input && input.value ? Date.parse(input.value) : NaN; return Number.isFinite(t) ? t : null }
      const on = (fieldIn(item, 'on') || item).querySelector('[role="switch"]')
      const starts = at('starts'), ends = at('ends'), now = Date.now()
      const date = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      const state = on && on.getAttribute('aria-checked') === 'false' ? 'off' : ends != null && now >= ends ? 'ended' : starts != null && now < starts ? `starts ${date(starts)}` : ends != null ? `on now, until ${date(ends)}` : 'on now'
      const label = item.querySelector('[class*="NestedObjectLabel"]')
      const words = `${what} · ${state}`
      if (label && label.dataset.iaCovers !== words) label.dataset.iaCovers = words
      if (label && label.dataset.iaState !== state.split(' ')[0]) label.dataset.iaState = state.split(' ')[0]
    }
  }
  /* ---------- the quote button (Page text → Commissions) ----------
     Its address field only matters for "Another link": hidden for the other choices. */
  const tidyQuote = (pane) => {
    if (`${currentSection()}/${currentFile()}` !== 'pages/commissions') return
    const fieldOf = (name) => { const label = pane.querySelector(`label[for^="${name}-field"]`); return label && label.closest('[class*="ControlContainer"]') }
    const via = fieldOf('quoteVia')
    const url = fieldOf('quoteUrl')
    if (!via || !url) return
    const shown = ((via.querySelector('[class*="singleValue"]') || {}).textContent || '').trim()
    const off = !/^Another link/i.test(shown) // the address only counts for that choice
    if (url.hasAttribute('data-ia-off') !== off) url.toggleAttribute('data-ia-off', off)
  }
  // the dates and the On switch change no element: look again after them
  document.addEventListener('input', () => { if (currentFile() === 'sales') scheduleTag() }, true)
  document.addEventListener('click', () => { if (currentFile() === 'sales' || currentFile() === 'commissions') setTimeout(scheduleTag, 40) }, true)

  /* Decap heads every form "Writing in X collection". Say what is being edited instead: the
     page's own name for a single page ("Home page"), the section's name for anything else. */
  const nameTheForm = () => {
    const title = document.querySelector('[class*="ToolbarContainer"] [class*="BackCollection"]')
    const here = known.find((s) => s.name === currentSection() && (s.file ? s.file === currentFile() : true))
    if (!title || !here) return
    const want = here.file ? here.label : /\/new/.test(location.hash) ? `New ${here.singular.toLowerCase()}` : here.label
    if (title.textContent !== want) title.textContent = want
  }

  /* Every screen is headed the same way: its group in small red capitals over the title, and a
     line about it (shell.js and sales.js screens draw their own). On Decap's screens the group
     goes on the list's heading panel and on the form's heading bar, the line on top of the form. */
  const headers = () => {
    const name = currentSection()
    const here = known.find((s) => s.name === name && (s.file ? s.file === currentFile() : true))
    const kicker = here ? groupOf(here.key) : ''
    const set = (node, key, value) => { if (node && (node.dataset[key] || '') !== value) { if (value) node.dataset[key] = value; else delete node.dataset[key] } }
    set(document.querySelector('[class*="CollectionTopContainer"]'), 'iaKicker', kicker)
    set(document.querySelector('[class*="ToolbarContainer"] [class*="BackCollection"]'), 'iaKicker', kicker)
    set(document.querySelector('[class*="ControlPaneContainer"]:not([class*="PreviewPaneContainer"])'), 'iaLead', (here && ABOUT[here.key]) || '')
  }

  /* Decap only labels the optional fields ("(optional)"); everything else must be filled in.
     Mark those so the stylesheet can add a red asterisk. On/off switches, sliders and plain
     groups of fields are skipped: none of them is something you can leave "empty". */
  const markRequired = (pane) => {
    for (const label of pane.querySelectorAll('label[class*="FieldLabel"]')) {
      const field = label.closest('[class*="ControlContainer"]')
      if (!field) continue
      const optional = /\(optional\)\s*$/i.test(label.textContent)
      const isSwitch = !!field.querySelector(':scope > div > [class*="ToggleContainer"]')
      const bar = field.querySelector(':scope > div > [class*="TopBarContainer"]')
      const isGroup = !!bar && !bar.querySelector('[class*="AddButton"]')
      const isSlider = !!field.querySelector(':scope > .ia-slider')
      // "(optional)" after an on/off switch says nothing: a switch is always either on or off
      if (isSwitch && optional) for (const node of label.querySelectorAll('*')) if (!node.children.length) node.textContent = node.textContent.replace(/\s*\(optional\)\s*$/i, '')
      const required = !optional && !isSwitch && !isGroup && !isSlider
      if (required !== label.hasAttribute('data-ia-required')) label.toggleAttribute('data-ia-required', required)
    }
  }
  /* ---------- pictures on the cards ----------
     The two card views show a picture for each entry. Which picture belongs to which entry comes
     from thumbs.json (see vite.config.js); it is asked for again whenever a list is opened, since
     a save may have changed it. An entry without a picture says so; a section that never has
     pictures (Conventions) gets plain cards with no empty frame. */
  let thumbs = {}, thumbsAt = 0
  const loadThumbs = () => {
    if (Date.now() - thumbsAt < 10000) return
    thumbsAt = Date.now()
    fetch('thumbs.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).then((found) => { thumbs = found || {}; paintThumbs() }).catch(() => { /* cards simply stay without pictures */ })
  }
  const paintThumbs = () => {
    const section = currentSection() === 'shop' ? 'work' : currentSection() // the Shop lists pieces kept with Work
    const cards = document.querySelectorAll('[class*="GridCardLink"]')
    if (!section || !cards.length) return
    loadThumbs()
    const any = Object.keys(thumbs).some((key) => key.startsWith(`${section}/`))
    for (const link of cards) {
      if (link.querySelector('[class*="CardImage"], [class*="StyledImage"]')) continue // Decap found a picture itself
      const slug = ((link.getAttribute('href') || '').match(/\/entries\/([^/?]+)/) || [])[1]
      const picture = slug && thumbs[`${section}/${decodeURIComponent(slug)}`]
      let frame = link.querySelector(':scope > .ia-thumb')
      if (picture) {
        if (!frame) { frame = el('span', { className: 'ia-thumb' }); link.append(frame) }
        const image = `url("${new URL(`..${picture}`, location.href.split('#')[0]).href}")`
        if (frame.dataset.image !== image) { frame.dataset.image = image; frame.style.backgroundImage = image }
      } else if (frame) frame.remove()
      // only touch the attribute when it is wrong, so this never loops with the observer below
      const state = picture ? 'picture' : any ? 'none' : 'plain'
      if (link.dataset.iaThumb !== state) link.dataset.iaThumb = state
    }
  }

  /* ---------- a comic's pages, numbered as they read ----------
     Under Comic samples every page in the list is headed with its number: "Page 1", or "Pages 3–4
     (spread)" for one wide picture across two pages. Page 1 is the first page after the cover.
     Counted again whenever a page is added, removed, moved or switched to a spread. */
  const numberPages = () => {
    if (currentSection() !== 'comics') return
    const list = [...document.querySelectorAll('[class*="ControlContainer"]')]
      .find((f) => /^pages-field/.test((f.querySelector(':scope > [class*="ControlTopbar"] label[for]') || {}).htmlFor || ''))
    if (!list) return
    let n = 1
    for (const item of list.querySelectorAll('[class*="-listControlItem"]')) {
      const spread = item.querySelector('button[role="switch"][id^="spread-field"]')?.getAttribute('aria-checked') === 'true'
      const words = spread ? `Pages ${n}–${n + 1} (spread)` : `Page ${n}`
      n += spread ? 2 : 1
      // the heading sits in the item's own fields, beside its picture
      for (const box of [item, item.querySelector(':scope > div:last-child > div')]) {
        if (!box) continue
        if (box.dataset.iaPage !== words) box.dataset.iaPage = words
        if (box.hasAttribute('data-ia-spread') !== spread) box.toggleAttribute('data-ia-spread', spread)
      }
    }
  }
  // switching a page to a spread changes no element, only the switch's state: count again after it
  document.addEventListener('click', (e) => { if (e.target.closest?.('button[role="switch"]')) setTimeout(numberPages, 40) })

  let tagTimer
  const scheduleTag = () => { clearTimeout(tagTimer); tagTimer = setTimeout(() => { tagFields(); headers(); syncViews(); paintThumbs(); numberPages() }, 60) }

  /* ---------- list views ----------
     Decap offers rows or cards, one choice for the whole admin. Here every list gets four views
     and remembers its own (saved in this browser, per section; search results count as one
     place). Nothing saved yet means Cards for the sections that are made of pictures (so a
     piece is found by looking, not reading) and List for the rest. Two of the views are restyled rows
     and two are restyled cards, so Decap is switched to whichever the chosen view is built on. */
  const VIEWS = [
    { id: 'list', label: 'List', cards: false },
    { id: 'compact', label: 'Compact list', cards: false },
    { id: 'cards', label: 'Cards', cards: true },
    { id: 'gallery', label: 'Big pictures', cards: true },
  ]
  const PICTURED = new Set(['work', 'shop', 'comics', 'gallery_sections', 'redraws'])
  const viewPlace = () => currentSection() || (/^#\/search/.test(location.hash) ? 'search' : 'other')
  const chosenView = () => {
    let saved = null
    try { saved = localStorage.getItem(`ia.view.${viewPlace()}`) } catch { /* storage switched off: use the default */ }
    return VIEWS.find((v) => v.id === saved) || VIEWS.find((v) => v.id === (PICTURED.has(viewPlace()) ? 'cards' : 'list'))
  }
  let lastSwitch = 0
  const syncViews = () => {
    const section = document.querySelector('[class*="ViewControlsSection"]')
    if (!section) return
    let bar = section.querySelector(':scope > .ia-views')
    if (!bar) {
      bar = el('div', { className: 'ia-views', role: 'group', ariaLabel: 'How to show this list' }, VIEWS.map((v) => {
        const b = el('button', { type: 'button', title: v.label, ariaLabel: v.label }, [icon(`view_${v.id}`)])
        b.dataset.view = v.id
        b.addEventListener('click', () => {
          try { localStorage.setItem(`ia.view.${viewPlace()}`, v.id) } catch { /* not remembered, still applied below */ }
          document.documentElement.dataset.iaView = v.id
          syncViews()
        })
        return b
      }))
      section.append(bar)
    }
    let view = chosenView()
    // with storage switched off the choice lives only on the page, for as long as this list is open
    try { localStorage.getItem('ia.view.test') } catch { view = VIEWS.find((v) => v.id === document.documentElement.dataset.iaView) || view }
    if (document.documentElement.dataset.iaView !== view.id) document.documentElement.dataset.iaView = view.id
    for (const b of bar.children) {
      const on = String(b.dataset.view === view.id)
      if (b.getAttribute('aria-pressed') !== on) b.setAttribute('aria-pressed', on)
    }
    const shown = document.querySelector('[class*="CardsGrid"] > li')
    if (!shown || Date.now() - lastSwitch < 400) return
    if (/GridCard/.test(shown.className) !== view.cards) {
      lastSwitch = Date.now()
      section.querySelectorAll(':scope > [class*="ViewControlsButton"]')[view.cards ? 1 : 0]?.click()
    }
  }

  /* ---------- wording: "Save", not "Publish" ----------
     Decap's own word for putting an entry on the site is "Publish". The admins here call that
     saving, so its English phrases are swapped for these. With the review workflow switched on
     (the live site) Decap has a second button that only stores a draft; that one becomes
     "Save draft" so the two cannot be mixed up. */
  if (window.CMS && window.CMS.getLocale && window.CMS.registerLocale) {
    const over = (base, changes) => {
      const out = { ...base }
      for (const [k, v] of Object.entries(changes)) out[k] = v && typeof v === 'object' ? over(out[k] || {}, v) : v
      return out
    }
    window.CMS.registerLocale('en', over(window.CMS.getLocale('en') || {}, {
      editor: {
        editor: {
          onPublishingNotReady: 'Please set the status to "Ready" before saving it to the site.',
          onPublishingWithUnsavedChanges: 'You have unsaved changes. Press "Save draft" first.',
          onPublishing: 'Save this entry to the site now?',
          onDeleteWithUnsavedChanges: 'Are you sure you want to delete this entry, as well as your unsaved changes from the current session?',
          onDeletePublishedEntry: 'Are you sure you want to delete this entry?',
        },
        editorToolbar: {
          publish: 'Save', publishNow: 'Save now', publishAndCreateNew: 'Save and create new', publishAndDuplicate: 'Save and duplicate',
          publishing: 'Saving...', published: 'Saved', save: 'Save draft', deletePublishedEntry: 'Delete entry',
        },
      },
      // on Vercel the "GitHub" login window is really the admin passcode (see /api/auth.js)
      auth: { login: 'Log in', loggingIn: 'Logging in...', loginWithGitHub: 'Log in', loginWithNetlifyIdentity: 'Log in', errors: { notRecognized: 'That login did not work. Try again.' } },
      ui: { default: { goBackToSite: 'Back to the site' }, toast: { entryPublished: 'Entry saved', onFailToPublishEntry: 'Failed to save: %{details}' } },
      workflow: { workflowCard: { publishChanges: 'Save changes to the site', publishNewEntry: 'Save new entry to the site' } },
    }))
  }

  // ---------- back to the list after saving ----------
  // Decap's success notice is the same for a draft and for the real thing, so the trigger is
  // the admin choosing "Save now" in the Save menu; the notice only confirms it worked.
  let publishAsked = 0
  document.addEventListener('click', (e) => {
    const item = e.target.closest?.('[class*="StyledMenuItem"], [role="menuitem"], button')
    if (item && /^\s*(save|publish) now\s*$/i.test(item.textContent)) publishAsked = Date.now()
  }, true)
  const backToList = () => {
    const section = currentSection()
    // a single page has no list to go back to: return to the overview instead
    if (section && /^#\/collections\/[^/]+\/(new|entries)/.test(location.hash)) location.hash = singles.has(section) ? HOME : `#/collections/${section}`
  }
  new MutationObserver((changes) => {
    scheduleTag()
    if (!publishAsked || Date.now() - publishAsked > 30000) return
    for (const c of changes) {
      for (const n of c.addedNodes) {
        const host = n instanceof HTMLElement ? n : n.parentElement
        const toast = host && (host.closest('.Toastify') ? host : host.querySelector('[class*="Toastify__toast"]'))
        if (toast && /entry (saved|published)/i.test(toast.textContent)) {
          publishAsked = 0
          // on the live site a save is only the start: the site still has to rebuild itself
          if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) tell('Saved', 'Open or refresh the site in this browser to see it straight away. Visitors see it in about a minute, once the site has rebuilt.', 'ok')
          // give Decap a moment to finish its own bookkeeping (a new entry gets its address first)
          setTimeout(backToList, 700)
          return
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true })

  // ---------- grouped fields: the whole heading row opens and closes it, not just the arrow ----------
  document.addEventListener('click', (e) => {
    const bar = e.target.closest?.('[class*="TopBarContainer"]')
    if (bar && !e.target.closest('button')) bar.querySelector('button[class*="ExpandButton"]')?.click()
  })

  // ---------- picture picker ----------
  const cards = () => [...document.querySelectorAll('.ReactModalPortal [class*="-Card "], .ReactModalPortal [class$="-Card"]')]
  const cardOf = (t) => t.closest?.('.ReactModalPortal [class*="-Card "], .ReactModalPortal [class$="-Card"]')
  const modalButton = (re) => [...document.querySelectorAll('.ReactModalPortal button')].find((b) => re.test(b.textContent))

  /* Which picture is selected is Decap's business (it also selects a picture right after an
     upload). Its only outward sign is a blue border set by that card's style rule, so read the
     rule and mirror the answer onto the card for the stylesheet to draw the ring and tick. */
  const selectedByClass = new Map()
  const isSelected = (card) => {
    const cls = (card.className.match(/css-[a-z0-9]+-Card/) || [])[0]
    if (!cls) return false
    if (!selectedByClass.has(cls)) {
      let blue = false
      for (const sheet of document.styleSheets) {
        let rules
        try { rules = sheet.cssRules } catch { continue }
        for (const r of rules) if (r.selectorText === '.' + cls && /58,\s*105,\s*199|#3a69c7/i.test(r.style.borderColor)) blue = true
      }
      selectedByClass.set(cls, blue)
    }
    return selectedByClass.get(cls)
  }
  const syncPicked = () => { for (const c of cards()) if (isSelected(c) !== c.hasAttribute('data-picked')) c.toggleAttribute('data-picked', isSelected(c)) }
  let pickTimer
  const schedulePick = () => { clearTimeout(pickTimer); pickTimer = setTimeout(syncPicked, 50) }
  new MutationObserver(schedulePick).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })

  // double-click = pick it and use it (the two clicks toggle the selection, so make sure it ends up on)
  document.addEventListener('dblclick', (e) => {
    const card = cardOf(e.target)
    if (!card) return
    setTimeout(() => {
      if (!isSelected(card)) card.click()
      setTimeout(() => { const btn = modalButton(/choose selected|insert/i); if (btn && !btn.disabled) btn.click() }, 120)
    }, 120)
  }, true)

  /* ---------- big pictures are made smaller before they are uploaded ----------
     On the live site a save travels through a small function that takes about 4 MB at most, and
     a picture grows by a third on the way. A large cut-out straight from an art program would be
     refused ("Failed to persist entry"). So a picture over about 900 KB is redrawn at up to
     2400 pixels on its long side and saved as WebP (see-through backgrounds are kept), which is
     also what the site wants: visitors download these. Smaller pictures go up untouched. */
  const ROOM = 2.6 * 1024 * 1024
  const heavy = (file) => /^image\/(png|jpeg|webp)$/.test(file.type) && file.size > 900 * 1024
  const lighter = async (file) => {
    if (!heavy(file)) return file
    try {
      const picture = await createImageBitmap(file)
      let side = Math.min(2400, Math.max(picture.width, picture.height))
      for (let attempt = 0; attempt < 6; attempt++) {
        const scale = side / Math.max(picture.width, picture.height)
        const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(picture.width * scale), height: Math.round(picture.height * scale) })
        canvas.getContext('2d').drawImage(picture, 0, 0, canvas.width, canvas.height)
        const made = await new Promise((done) => canvas.toBlob(done, 'image/webp', 0.9))
        if (made && made.size <= ROOM && made.size < file.size) {
          const ending = made.type === 'image/webp' ? 'webp' : made.type === 'image/jpeg' ? 'jpg' : 'png'
          return new File([made], `${file.name.replace(/\.[^.]+$/, '')}.${ending}`, { type: made.type, lastModified: Date.now() })
        }
        side = Math.round(side * 0.8)
      }
    } catch { /* not a picture the browser can redraw: send it as it is */ }
    return file
  }
  document.addEventListener('change', (e) => {
    const input = e.target
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || input.dataset.iaLighter || ![...(input.files || [])].some(heavy)) return
    // hold this announcement back, swap the files, then announce again for Decap to pick up
    e.stopImmediatePropagation()
    Promise.all([...input.files].map(lighter)).then((files) => {
      const bag = new DataTransfer()
      files.forEach((f) => bag.items.add(f))
      input.files = bag.files
      input.dataset.iaLighter = 'done'
      input.dispatchEvent(new Event('change', { bubbles: true }))
      delete input.dataset.iaLighter
    })
  }, true)

  /* ---------- notices: when a save is refused, say why (and when it worked, what happens next) ----------
     Decap reports every refused save as "API_ERROR". The reason is in the answer it got, so
     watch the answers from the site's saving function and put the reason on screen in words. */
  const told = new Map()
  const tell = (title, text, kind = 'problem') => {
    if (Date.now() - (told.get(title) || 0) < 8000) return
    told.set(title, Date.now())
    const close = el('button', { type: 'button', ariaLabel: 'Close', textContent: '×' })
    const note = el('div', { className: `ia-notice ${kind}`, role: kind === 'ok' ? 'status' : 'alert' }, [el('strong', { textContent: title }), el('p', { textContent: text }), close])
    close.addEventListener('click', () => note.remove())
    document.body.append(note)
    setTimeout(() => note.remove(), 20000)
  }
  /* Before it opens a form on the live site, Decap asks GitHub which version of each file in that
     folder is the current one. The answer is the same for every form in the folder until
     something is saved, so it is kept for a minute and thrown away on any save: after the first
     form has opened, its neighbours open without a trip to the server. */
  const kept = new Map() // address -> { at, answer }
  const KEEP = 60 * 1000
  const plainFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const where = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || ''
    const how = String((args[1] && args[1].method) || (args[0] && args[0].method) || 'GET').toUpperCase()
    const reusable = how === 'GET' && where.includes('/api/gh/') && where.includes('/git/trees/')
    if (how !== 'GET' && where.includes('/api/gh/')) kept.clear()
    if (reusable) {
      const had = kept.get(where)
      if (had && Date.now() - had.at < KEEP) return had.answer.clone()
    }
    const answer = await plainFetch(...args)
    if (reusable && answer.ok) kept.set(where, { at: Date.now(), answer: answer.clone() })
    try {
      if (where.includes('/api/gh/') && !answer.ok) {
        const said = await answer.clone().json().then((j) => j && j.message, () => '')
        if (answer.status === 401) tell('You are logged out', 'Your login has run out. Press Sign out, log in again, then save once more.')
        else if (answer.status === 413) tell('That picture is too big', 'It could not be uploaded. Use a picture under about 3 MB, or save it as WebP or JPEG first.')
        else if (how !== 'GET' && (answer.status === 403 || answer.status === 404)) tell('The site is not allowed to save', `GitHub refused the change${said ? ` ("${said}")` : ''}. The token stored on Vercel as GITHUB_TOKEN needs "Contents: Read and write" for this repository. Fix the token, redeploy, then save again.`)
        else if (how !== 'GET' && answer.status >= 400) tell('The change was not saved', said ? `GitHub answered: "${said}". Nothing was lost on this page; try Save again.` : `The save was refused (error ${answer.status}). Nothing was lost on this page; try Save again.`)
      }
    } catch { /* explaining is a courtesy: never let it break the request itself */ }
    return answer
  }

  /* A picture uploaded while editing only reaches the site's folder when the entry is saved,
     so until then its preview address leads nowhere. Keep the uploaded file at hand and show it
     in place of the broken preview. */
  const fresh = new Map() // simplified file name -> local preview address
  const simple = (name) => String(name).split(/[\\/]/).pop().toLowerCase().replace(/[^a-z0-9.]+/g, '')
  document.addEventListener('change', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'file') for (const f of e.target.files || []) fresh.set(simple(f.name), URL.createObjectURL(f))
  }, true)
  document.addEventListener('error', (e) => {
    const img = e.target
    if (!(img instanceof HTMLImageElement) || img.src.startsWith('blob:')) return
    const local = fresh.get(simple(decodeURIComponent(img.getAttribute('src') || '')))
    if (local) img.src = local
  }, true)

  /* ---------- "are you sure?" ----------
     Decap asks with the browser's own confirm box (deleting an entry or a picture, leaving
     unsaved changes). That box cannot be styled and cannot wait for anything else, so: the
     first time it is asked the answer is "no" and our own dialog opens instead; if the admin
     confirms there, the same click is played again and this time the answer is "yes". */
  const browserConfirm = window.confirm.bind(window)
  let lastClick = null
  let agreed = new Set()
  document.addEventListener('click', (e) => { if (e.isTrusted && !e.target.closest('.ia-confirm')) { lastClick = { target: e.target, at: Date.now() }; agreed = new Set() } }, true)
  const ask = (message) => new Promise((resolve) => {
    const deleting = /delete|remove/i.test(message)
    const named = (document.querySelector('[class*="ControlPaneContainer"] input[type="text"]') || {}).value
    const title = deleting ? (named && /entry/i.test(message) ? `Delete “${named}”?` : 'Delete this?') : 'Are you sure?'
    const text = deleting && /entry/i.test(message) ? 'It comes off the site and out of the admin. This cannot be undone. To take it off the site but keep it, use its “Hide from the site” switch instead.' : message
    const no = el('button', { type: 'button', className: 'ia-btn ghost', textContent: 'Cancel' })
    const yes = el('button', { type: 'button', className: `ia-btn ${deleting ? 'danger' : ''}`, textContent: deleting ? 'Yes, delete' : 'Yes' })
    const box = el('div', { className: 'ia-confirm', role: 'dialog', ariaModal: 'true' }, [
      el('div', { className: 'ia-confirm-card' }, [el('h2', { textContent: title }), el('p', { textContent: text }), el('div', { className: 'ia-confirm-actions' }, [no, yes])]),
    ])
    const close = (answer) => { document.removeEventListener('keydown', onKey, true); box.remove(); resolve(answer) }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(false) } }
    no.addEventListener('click', () => close(false))
    yes.addEventListener('click', () => close(true))
    box.addEventListener('click', (e) => { if (e.target === box) close(false) })
    document.addEventListener('keydown', onKey, true)
    document.body.append(box)
    no.focus()
  })
  window.confirm = (message) => {
    if (agreed.has(message)) return true
    const click = lastClick
    // nothing to play again (browser back button, a menu that has closed): fall back to the browser's box
    if (!click || Date.now() - click.at > 2000 || !click.target.isConnected) return browserConfirm(message)
    ask(message).then((yes) => { if (yes) { agreed.add(message); click.target.click() } })
    return false
  }

  /* ---------- slider: a number you drag ----------
     Used for the colour of a piece. The box beside the slider
     takes an exact number; the arrow puts the starting value back. */
  if (window.CMS && window.createClass && window.h) {
    const h = window.h
    window.CMS.registerWidget('slider', window.createClass({
      render() {
        const { value, onChange, forID, field, setActiveStyle, setInactiveStyle } = this.props
        const min = field.get('min', 0), max = field.get('max', 100), step = field.get('step', 1), start = field.get('default', min), unit = field.get('unit', '')
        const now = value === '' || value == null || Number.isNaN(Number(value)) ? start : Number(value)
        const fill = `${((Math.min(max, Math.max(min, now)) - min) / (max - min)) * 100}%`
        const set = (v) => onChange(v === '' ? '' : Math.min(max, Math.max(min, Number(v))))
        return h('div', { className: 'ia-slider' },
          h('input', { type: 'range', id: forID, min, max, step, value: now, style: { '--fill': fill }, onChange: (e) => set(e.target.value), onFocus: setActiveStyle, onBlur: setInactiveStyle }),
          h('label', { className: 'ia-slider-num' },
            h('input', { type: 'number', min, max, step, value: value === '' ? '' : now, 'aria-label': 'Exact value', onChange: (e) => set(e.target.value), onFocus: setActiveStyle, onBlur: setInactiveStyle }),
            unit && h('span', {}, unit)),
          h('button', { type: 'button', className: 'ia-slider-reset', title: `Back to ${start}${unit}`, 'aria-label': `Back to ${start}${unit}`, disabled: now === start, onClick: () => onChange(start) }, '↺'))
      },
    }))
  }

  // ---------- a newer admin has been published ----------
  /* The admin is one page that never reloads itself, so a tab left open keeps running the version
     it was opened with, even after the panel has been updated. Every few minutes (while the tab is
     in view) the panel's own files are compared with the ones it started with; when they differ,
     a notice offers to reload. Content saved in the meantime is not affected. "Later" puts it off
     until the panel changes again, not until the next check. Not on this computer's own copy,
     where the files change as they are worked on. */
  const fingerprint = async () => {
    const texts = await Promise.all(['shell.js', 'config.yml', 'admin.css'].map((f) => fetch(f, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''), () => '')))
    if (texts.some((t) => !t)) return ''
    let h = 0
    for (const t of texts) for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0
    return String(h)
  }
  let firstPrint = ''
  fingerprint().then((f) => { firstPrint = f })
  const offerReload = () => {
    if (document.querySelector('.ia-update')) return
    const reload = el('button', { type: 'button', className: 'ia-btn', textContent: 'Reload' })
    reload.addEventListener('click', () => location.reload())
    const later = el('button', { type: 'button', className: 'ia-btn ghost', textContent: 'Later' })
    const box = el('div', { className: 'ia-notice ia-update', role: 'status' }, [
      el('strong', { textContent: 'The admin has been updated' }),
      el('p', { textContent: 'Reload to get the newest version. Save anything you are editing first.' }),
      el('div', { className: 'ia-update-actions' }, [reload, later]),
    ])
    later.addEventListener('click', () => { box.remove(); fingerprint().then((f) => { if (f) firstPrint = f }) })
    document.body.append(box)
  }
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
  if (!local) setInterval(async () => {
    if (document.hidden || !firstPrint || document.querySelector('.ia-update')) return
    const now = await fingerprint()
    if (now && now !== firstPrint) offerReload()
  }, 3 * 60 * 1000)

  /* ---------- a picture as a profile picture: where the circle sits, and how far in ----------
     The piece's picture in a circle: drag it to put the face in place, zoom with the slider (the
     sliders under it move it too, for the keyboard). Kept as "left,top,zoom" (percent), which the
     site uses wherever a buyer shows this print as their picture. */
  if (window.CMS && window.createClass && window.h) {
    const h = window.h
    const clamp = (n, lo, hi) => Math.round(Math.min(hi, Math.max(lo, n)))
    window.CMS.registerWidget('facecrop', window.createClass({
      getInitialState() { return { src: '' } },
      componentDidMount() { this.look(); this.timer = setInterval(() => this.look(), 400) },
      componentWillUnmount() { clearInterval(this.timer) },
      // the picture is whatever the form's Picture field holds right now
      look() {
        let src = ''
        // inside a list (the free profile pictures): the picture chosen in the same tile
        const tile = this.root && this.root.closest('[class*="-listControlItem"]')
        if (tile) {
          const img = tile.querySelector('[class*="ImageWrapper"] img')
          src = img ? img.getAttribute('src') || '' : ''
        } else {
          // a piece: the form's Picture field
          const entry = this.props.getEntry && this.props.getEntry()
          const data = entry && entry.get('data')
          const path = data && data.get('src')
          src = path ? String(this.props.getAsset(path) || '') : ''
        }
        if (src !== this.state.src) this.setState({ src })
      },
      parts() {
        const [x, y, z] = String(this.props.value || '').split(',').map((n) => (n.trim() === '' ? NaN : Number(n)))
        return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 22, z: Number.isFinite(z) && z >= 100 ? z : 100 }
      },
      put(p) { this.props.onChange(clamp(p.x, 0, 100) + ',' + clamp(p.y, 0, 100) + ',' + clamp(p.z, 100, 400)) },
      drag(e) {
        if (!this.state.src) return
        e.preventDefault()
        const box = e.currentTarget.getBoundingClientRect()
        const from = { mx: e.clientX, my: e.clientY, ...this.parts() }
        const per = 200 / (box.width * (from.z / 100)) // how far one pixel of dragging moves the picture
        const move = (m) => this.put({ x: from.x - (m.clientX - from.mx) * per, y: from.y - (m.clientY - from.my) * per, z: from.z })
        const stop = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', stop) }
        addEventListener('pointermove', move)
        addEventListener('pointerup', stop)
      },
      render() {
        const { x, y, z } = this.parts()
        const src = this.state.src
        const look = { objectPosition: x + '% ' + y + '%', transform: 'scale(' + (z / 100) + ')', transformOrigin: x + '% ' + y + '%' }
        const circle = (size) => h('span', { className: 'ia-face is-' + size }, src ? h('img', { src, alt: '', draggable: false, style: look }) : null)
        const now = { x, y, z }
        const slider = (label, key, min, max) => h('label', { className: 'ia-face-slider' },
          h('span', {}, label),
          h('input', { type: 'range', min, max, step: 1, value: now[key], disabled: !src, onChange: (e) => this.put({ ...now, [key]: Number(e.target.value) }) }),
          h('b', {}, now[key] + '%'))
        return h('div', { className: 'ia-facecrop', ref: (el) => { this.root = el } },
          h('div', { className: 'ia-face-drag' + (src ? '' : ' is-empty'), onPointerDown: (e) => this.drag(e), title: src ? 'Drag to move the picture' : '' },
            circle('big'),
            src ? null : h('span', { className: 'ia-face-none' }, 'Add the picture first')),
          h('div', { className: 'ia-face-side' },
            h('div', { className: 'ia-face-row' }, circle('mid'), circle('small'), h('span', {}, 'As it shows on their profile')),
            slider('Zoom', 'z', 100, 400),
            slider('Left to right', 'x', 0, 100),
            slider('Up and down', 'y', 0, 100),
            h('button', { type: 'button', className: 'ia-face-reset', disabled: !this.props.value, onClick: () => this.props.onChange('') }, 'Start again')))
      },
    }))
  }

  /* ---------- asking before a reward (or a free profile picture) is removed ----------
     The × on an item of these lists removes it at once; here it asks first, in a window. Yes
     removes it (nothing changes on the site until the form is saved); No, Escape or a click
     outside keeps it. */
  const ASK_BEFORE_REMOVING = {
    steps: { what: 'set', text: 'It comes off the home page and the Work page. Its pictures stay in the Media library. To take it off the site for now without losing it, switch on "Hide from the site" instead.' },
    pictures: { what: 'profile picture', text: 'Customers who earned it lose it, and anyone using it as their picture goes back to their initials. To stop offering it for now without losing it, switch on "Hide (not offered for now)" instead.' },
    cards: { what: 'card design', text: 'Customers who earned it lose it, and anyone using it goes back to the usual card. To stop offering it for now without losing it, switch on "Hide (not offered for now)" instead.' },
    discounts: { what: 'discount', text: 'Customers no longer earn it. Codes already made from it keep working until they run out. To stop offering it for now without losing it, switch on "Hide (not offered for now)" instead.' },
    rewards: { what: 'reward', text: 'Customers who earned it lose it: a picture or card design they chose goes back to the usual one, and they no longer see it under Rewards. Discount codes already made from it keep working until they run out. To stop offering it for now without losing it, switch on "Hide (not offered for now)" instead.' },
    sales: { what: 'price cut', text: 'Once you press Save it stops on the site and its prices go back to normal. To pause it without losing it, switch "On" off instead.' },
    icons: { what: 'free picture', text: 'Customers using it as their profile picture go back to their initials.' },
    pages: { what: 'page', text: 'It comes out of the comic and the pages after it move up one. The picture stays in the Media library.' },
  }
  let removing = false // the confirmed click passes straight through
  const askRemove = (kind, name, onYes) => {
    const shade = el('div', { className: 'sl-modal-shade', style: 'z-index: 100000' })
    const close = () => { shade.remove(); removeEventListener('keydown', esc, true) }
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    const no = el('button', { type: 'button', className: 'ia-btn ghost', textContent: 'Keep it' })
    const yes = el('button', { type: 'button', className: 'ia-btn sl-danger-solid', textContent: `Delete ${kind.what}` })
    no.addEventListener('click', close)
    yes.addEventListener('click', () => { close(); onYes() })
    shade.addEventListener('click', (e) => { if (e.target === shade) close() })
    shade.append(el('div', { className: 'sl-modal is-small', role: 'alertdialog', ariaModal: 'true', ariaLabel: `Delete ${kind.what}` }, [
      el('div', { className: 'sl-modal-head is-danger' }, [el('div', { className: 'ia-kicker', textContent: 'Delete' }), el('h2', { textContent: name ? `Delete “${name}”?` : `Delete this ${kind.what}?` })]),
      el('div', { className: 'sl-modal-body' }, [
        el('p', { className: 'sl-modal-what', textContent: `It is taken off the list. Nothing changes on the site until you press Save.` }),
        el('p', { textContent: kind.text }),
      ]),
      el('div', { className: 'sl-modal-foot' }, [no, yes]),
    ]))
    document.body.append(shade)
    addEventListener('keydown', esc, true)
    setTimeout(() => no.focus(), 30)
  }
  document.addEventListener('click', (e) => {
    if (removing) return
    const btn = e.target.closest && e.target.closest('button')
    const bar = btn && btn.parentElement
    if (!bar || !/ListItemTopBar/.test(String(bar.className)) || bar.lastElementChild !== btn) return // the × is the last button of an item's top bar
    let list = null
    for (let f = btn.closest('[class*="ControlContainer"]'); f; f = f.parentElement && f.parentElement.closest('[class*="ControlContainer"]')) {
      const name = ((f.querySelector(':scope > [class*="ControlTopbar"] label[for]') || {}).htmlFor || '').replace(/-field-\d+$/, '')
      if (ASK_BEFORE_REMOVING[name]) { list = name; break }
    }
    if (!list) return // only the lists named above
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation()
    const item = btn.closest('[class*="-listControlItem"]')
    const named = item && [...item.querySelectorAll('input[type="text"], input:not([type])')].find((i) => /^name-field/.test(i.id || ''))
    const label = (named && named.value) || (item && item.dataset.iaPage) || (item && (item.querySelector('[class*="ListItemTopBar"]') || {}).textContent) || ''
    askRemove(ASK_BEFORE_REMOVING[list], String(label).trim(), () => { removing = true; try { btn.click() } finally { removing = false } })
  }, true)

  /* ---------- a membership card design, as customers will see it, and where its picture sits ----------
     Under each card design (Members → Rewards): the card with its look and picture, redrawn as they
     change. With a picture, the card is the control: drag the picture on it, zoom with the slider
     (the sliders move it too, for the keyboard). Kept as "left,top,zoom" (percent), like a profile
     picture's crop; empty means the usual 50,25,100. The look and the picture are read from the same
     design. */
  if (window.CMS && window.createClass && window.h) {
    const h = window.h
    const clamp = (n, lo, hi) => Math.round(Math.min(hi, Math.max(lo, n)))
    const LOOKS = [['ink', /^ink/i], ['gold', /^gold/i], ['chrome', /^chrome/i], ['art', /picture/i]]
    window.CMS.registerWidget('cardcrop', window.createClass({
      getInitialState() { return { look: 'ink', art: '', name: '', size: null } },
      componentDidMount() { this.read(); this.timer = setInterval(() => this.read(), 400) },
      componentWillUnmount() { clearInterval(this.timer) },
      read() {
        const item = this.root && this.root.closest('[class*="-listControlItem"]')
        if (!item) return
        const said = [...item.querySelectorAll('[class*="singleValue"]')].map((n) => n.textContent)
        const found = LOOKS.find(([, re]) => said.some((t) => re.test(t)))
        const img = item.querySelector('[class*="ImageWrapper"] img')
        const name = (item.querySelector('input[id^="name-field"]') || {}).value || ''
        const next = { look: found ? found[0] : 'ink', art: img ? img.getAttribute('src') || '' : '', name }
        if (next.art !== this.state.art) this.measure(next.art)
        if (next.look !== this.state.look || next.art !== this.state.art || next.name !== this.state.name) this.setState(next)
      },
      // the picture's own size, so that dragging moves it exactly with the pointer
      measure(src) {
        this.setState({ size: null })
        if (!src) return
        const pic = new Image()
        pic.onload = () => { if (this.state.art === src) this.setState({ size: { w: pic.naturalWidth, h: pic.naturalHeight } }) }
        pic.src = src
      },
      parts() {
        const [x, y, z] = String(this.props.value || '').split(',').map((n) => (n.trim() === '' ? NaN : Number(n)))
        return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 25, z: Number.isFinite(z) && z >= 100 ? z : 100 }
      },
      put(p) { this.props.onChange(clamp(p.x, 0, 100) + ',' + clamp(p.y, 0, 100) + ',' + clamp(p.z, 100, 400)) },
      drag(e) {
        if (!this.state.art || e.button > 0) return
        e.preventDefault()
        const W = e.currentTarget.clientWidth, H = e.currentTarget.clientHeight
        const from = { mx: e.clientX, my: e.clientY, ...this.parts() }
        const zoom = from.z / 100
        // the picture covers the card: how much of it is left over each way, once zoomed in
        const { size } = this.state
        const fit = size && size.w && size.h ? Math.max(W / size.w, H / size.h) : 0
        const spare = (drawn, side) => drawn * zoom - side
        const perX = fit ? (spare(size.w * fit, W) > 0.5 ? 100 / spare(size.w * fit, W) : 0) : 200 / (W * zoom)
        const perY = fit ? (spare(size.h * fit, H) > 0.5 ? 100 / spare(size.h * fit, H) : 0) : 200 / (W * zoom)
        const move = (m) => this.put({ x: from.x - (m.clientX - from.mx) * perX, y: from.y - (m.clientY - from.my) * perY, z: from.z })
        const stop = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', stop); removeEventListener('pointercancel', stop) }
        addEventListener('pointermove', move)
        addEventListener('pointerup', stop)
        addEventListener('pointercancel', stop)
      },
      render() {
        const { look, art, name } = this.state
        const { x, y, z } = this.parts()
        const now = { x, y, z }
        const style = art ? { '--card-art': `url("${art}")`, '--art-x': x + '%', '--art-y': y + '%', '--art-zoom': z / 100 } : {}
        const slider = (label, key, min, max) => h('label', { className: 'ia-face-slider' },
          h('span', {}, label),
          h('input', { type: 'range', min, max, step: 1, value: now[key], disabled: !art, onChange: (e) => this.put({ ...now, [key]: Number(e.target.value) }) }),
          h('b', {}, now[key] + '%'))
        const note = art ? `“${name || 'This design'}”, as customers will see it. Drag the picture to place it.`
          : look === 'art' ? 'Add a picture above first, to see the card.'
            : `“${name || 'This design'}”, as customers will see it. To put a picture on it, add one above first.`
        return h('div', { className: 'ia-cardcrop', ref: (el) => { this.root = el } },
          h('div', { className: `ia-cardprev is-${look} ${art ? 'has-art is-movable' : ''}`, style, onPointerDown: (e) => this.drag(e), title: art ? 'Drag to move the picture' : '' },
            h('span', { className: 'ia-cardprev-top' }, h('b', {}, 'MILTON ', h('i', {}, 'AGUIAR')), h('em', {}, 'Collector')),
            h('span', { className: 'ia-cardprev-chip' }),
            h('strong', { className: 'ia-cardprev-name' }, 'Your name here'),
            h('span', { className: 'ia-cardprev-foot' }, h('small', {}, 'Member no.'), ' #0001')),
          h('div', { className: 'ia-cardcrop-side' },
            h('p', { className: 'ia-cardprev-note' }, note),
            slider('Zoom', 'z', 100, 400),
            slider('Left to right', 'x', 0, 100),
            slider('Up and down', 'y', 0, 100),
            h('button', { type: 'button', className: 'ia-face-reset', disabled: !this.props.value, onClick: () => this.props.onChange('') }, 'Start again')))
      },
    }))
  }
})()
