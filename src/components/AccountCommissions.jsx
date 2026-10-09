import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { money } from '../data/site'
import { Lock, PaypalButton } from './Buy'

/* The customer's commissions, under Orders in their account (api/commissions.js): a list, and
   each one opened with where it is up to, the conversation with the artist, the quote to accept
   and pay, and the payment once made. What is open is in the address (?view=commissions&c=<id>),
   so an emailed link lands on it. Asked again every 20 seconds while a commission is open. */

// one commission action; answers what the server said, or throws with its message
export async function askCommissions(action, data = {}) {
  const answer = await fetch('/api/commissions', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }) })
  const said = await answer.json().catch(() => ({}))
  if (!answer.ok) { const e = new Error(said.message || 'Something went wrong. Try again in a moment.'); e.status = answer.status; e.field = said.field || ''; throw e }
  return said
}

/* The list, for the whole account page (the tab's count of unread messages): asked on arrival,
   on coming back to the page, and every minute. */
export function useCommissionList(on = true) {
  const [list, setList] = useState(null)
  const [unread, setUnread] = useState(0)
  const reload = useCallback(() => askCommissions('list').then((s) => { setList(s.commissions || []); setUnread(s.unread || 0) }).catch(() => setList((l) => l || [])), [])
  useEffect(() => {
    if (!on) return undefined
    reload()
    const back = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', back)
    const every = setInterval(back, 60000)
    return () => { clearInterval(every); document.removeEventListener('visibilitychange', back) }
  }, [on, reload])
  return { list, unread, reload }
}

export const STEPS = [['requested', 'Requested'], ['discussing', 'Discussing'], ['quoted', 'Quoted'], ['paid', 'Paid'], ['sketch', 'Sketch'], ['inks', 'Inks'], ['colours', 'Colours'], ['delivered', 'Delivered']]
const WORDS = { ...Object.fromEntries(STEPS), cancelled: 'Cancelled' }
const priced = (n, code) => { try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: code || 'EUR', currencyDisplay: 'narrowSymbol', minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 }).format(n) } catch { return money(n) } }
const longDay = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const dueDay = (d) => { const t = new Date(d); return Number.isNaN(+t) ? String(d) : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) }
const when = (d) => {
  const t = new Date(d)
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 60 * 24 && t.toDateString() === new Date().toDateString()) return t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + `, ${t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

// words with their web addresses as links
const URL_RE = /(https?:\/\/[^\s<>"]+)/g
export function Linked({ text }) {
  return String(text || '').split(URL_RE).map((part, i) => (i % 2 ? <a key={i} href={part} target="_blank" rel="noreferrer nofollow">{part.replace(/^https?:\/\//, '').slice(0, 60)}{part.length > 68 ? '…' : ''}</a> : part))
}

/* ---------- the list ---------- */
function CommissionList({ list, open }) {
  if (!list) return <p className="acc-wait">Fetching your commissions…</p>
  if (!list.length) return (
    <div className="acc-empty">
      <strong>No commissions yet</strong>
      <p>Ask for a piece of your own on the Commissions page: you talk it over with Milton here, get a quote, and follow it from sketch to delivery.</p>
      <Link className="btn sm" to="/commissions#request">Request a commission <span className="arrow">→</span></Link>
    </div>
  )
  return (
    <div className="acc-olist">
      {list.map((c) => (
        <button key={c.id} type="button" className={`acc-orow acc-crow ${c.unread ? 'is-unread' : ''}`} onClick={() => open(c.id)}>
          <span className="acc-crow-no" aria-hidden="true">{c.number.replace(/^C-/, '')}</span>
          <span className="acc-orow-what">
            <strong>{c.title}</strong>
            <small>{c.number} · {c.kind}{c.lastAt ? ` · ${when(c.lastAt)}` : ''}</small>
          </span>
          <span className={`acc-pill is-${c.status}`}>{WORDS[c.status] || c.status}</span>
          <b className="acc-orow-total">{c.price != null ? priced(c.price, c.currency) : '—'}</b>
          {c.unread > 0 ? <small className="acc-cbadge" aria-label={`${c.unread} new`}>{c.unread}</small> : <svg className="acc-orow-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>}
        </button>
      ))}
    </div>
  )
}

/* ---------- one commission ---------- */
function Tracker({ status }) {
  if (status === 'cancelled') return <p className="acc-refund">This commission was cancelled.</p>
  const at = STEPS.findIndex(([k]) => k === status)
  return (
    <ol className="acc-steps acc-csteps" aria-label="Where it is">
      {STEPS.map(([k, label], i) => <li key={k} className={i <= at ? 'done' : ''} aria-current={i === at ? 'step' : undefined}><i aria-hidden="true" /><span>{label}</span></li>)}
    </ol>
  )
}

function Thread({ messages }) {
  const end = useRef(null)
  const count = messages.length
  useEffect(() => { const box = end.current && end.current.parentElement; if (box) box.scrollTop = box.scrollHeight }, [count])
  return (
    <div className="acc-thread" aria-live="polite">
      {messages.map((m, i) => (
        <div key={i} className={`acc-msg is-${m.from === 'customer' ? 'mine' : m.from === 'artist' ? 'theirs' : 'note'}`}>
          {m.from !== 'system' && <span className="acc-msg-who">{m.from === 'customer' ? 'You' : 'Milton'}</span>}
          <div className="acc-msg-bubble">
            {m.text && <p><Linked text={m.text} /></p>}
            {m.links && m.links.length > 0 && <ul className="acc-msg-links">{m.links.map((l) => <li key={l}><a href={l} target="_blank" rel="noreferrer nofollow">{l.replace(/^https?:\/\//, '')}</a></li>)}</ul>}
          </div>
          <time dateTime={new Date(m.at).toISOString()}>{when(m.at)}</time>
        </div>
      ))}
      <span ref={end} />
    </div>
  )
}

function Reply({ id, onSent }) {
  const [text, setText] = useState('')
  const [links, setLinks] = useState('')
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const send = async (e) => {
    e.preventDefault()
    if (busy || (!text.trim() && !links.trim())) return
    setBusy(true); setProblem('')
    try { const s = await askCommissions('message', { id, text, links: links.split(/[\s,]+/).filter(Boolean) }); setText(''); setLinks(''); setMore(false); onSent(s.commission) } catch (err) { setProblem(err.message) }
    setBusy(false)
  }
  return (
    <form className="acc-reply" onSubmit={send}>
      <label className="sr-only" htmlFor={`reply-${id}`}>Your message</label>
      <textarea id={`reply-${id}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write to Milton…" maxLength={4000} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e) }} />
      {more ? (
        <input type="text" value={links} onChange={(e) => setLinks(e.target.value)} placeholder="Links to pictures (paste one or more)" aria-label="Links to pictures" />
      ) : <button type="button" className="acc-link" onClick={() => setMore(true)}>+ Add links to pictures</button>}
      <div className="acc-reply-foot">
        {problem && <span className="acc-reply-bad" role="alert">{problem}</span>}
        <button type="submit" className="btn sm" disabled={busy || (!text.trim() && !links.trim())}>{busy ? 'Sending…' : 'Send'} <span className="arrow">→</span></button>
      </div>
    </form>
  )
}

function QuoteCard({ c, ways }) {
  const q = c.quote
  const [paying, setPaying] = useState(false)
  const [busy, setBusy] = useState('')
  const [problem, setProblem] = useState('')
  const pay = async (provider) => {
    setBusy(provider); setProblem('')
    try { const s = await askCommissions('pay', { id: c.id, provider }); window.location.href = s.url; return } catch (e) { setProblem(e.message) }
    setBusy('')
  }
  const open = c.status === 'quoted'
  return (
    <section className={`acc-quote ${open ? 'is-open' : ''}`}>
      <div className="label">{open ? 'Your quote' : 'The quote'}</div>
      <div className="acc-quote-price">{priced(q.price, q.currency)}</div>
      <p className="acc-quote-what"><Linked text={q.includes} /></p>
      <p className="acc-quote-meta">
        {q.due && <span>Ready by {dueDay(q.due)}</span>}
        <span>{q.ship ? 'Posted to you' : 'Digital'}</span>
      </p>
      {open && !paying && <button type="button" className="btn" onClick={() => setPaying(true)}>Accept and pay <span className="arrow">→</span></button>}
      {open && paying && (
        <div className="acc-quote-pay">
          {ways.card && (
            <button type="button" className={`btn buy-btn ${busy === 'card' ? 'is-busy' : ''}`} onClick={() => pay('card')} disabled={Boolean(busy)} aria-busy={busy === 'card'}>
              <span>{busy === 'card' ? 'Opening secure checkout' : ways.paypal ? 'Pay by card' : 'Checkout'}</span>
              <span className="buy-btn-icon" aria-hidden="true">{busy === 'card' ? <i className="buy-spin" /> : '→'}</span>
            </button>
          )}
          {ways.paypal && <PaypalButton busy={busy === 'paypal'} onClick={() => pay('paypal')} />}
          {!ways.card && !ways.paypal && <p className="acc-reply-bad">Paying online is not set up right now. Write to Milton below and he will tell you how to pay.</p>}
          <p className="buy-secure"><Lock /><span>{q.ship ? 'You enter your delivery address on the next page. ' : ''}Full price, paid up front.</span></p>
          <button type="button" className="acc-link" onClick={() => setPaying(false)} disabled={Boolean(busy)}>Not yet</button>
        </div>
      )}
      {problem && <p className="acc-reply-bad" role="alert">{problem}</p>}
      {open && c.paying && !paying && <p className="acc-quote-note">A payment page was opened for this quote. If you paid, it shows here in a moment.</p>}
    </section>
  )
}

function Commission({ id, close, onChange, paid, paypalToken, clearReturn, clearPaid }) {
  const [c, setC] = useState(null)
  const [ways, setWays] = useState({ card: false, paypal: false })
  const [problem, setProblem] = useState('')
  const [capture, setCapture] = useState(paypalToken ? 'taking' : '')
  const [cancelling, setCancelling] = useState(false)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => askCommissions('get', { id }).then((s) => { setC(s.commission); setWays(s.payWays || {}); setProblem(''); onChange() }).catch((e) => setProblem(e.message)), [id, onChange])
  useEffect(() => {
    load()
    // just back from paying: Stripe tells the site a moment later, so asked again a few times
    const soon = paid ? [2500, 6000, 12000, 20000].map((ms) => setTimeout(load, ms)) : []
    const every = setInterval(() => { if (document.visibilityState === 'visible') load() }, 20000)
    return () => { soon.forEach(clearTimeout); clearInterval(every) }
  }, [load, paid])
  // back from PayPal: the payment is taken now (only the order opened for this quote)
  useEffect(() => {
    if (!paypalToken) return undefined
    let gone = false
    askCommissions('capture', { id, order: paypalToken })
      .then((s) => { if (!gone) { setC(s.commission); setCapture('paid'); onChange(); clearReturn() } })
      .catch((e) => { if (!gone) { setCapture(e.message); clearReturn() } })
    return () => { gone = true }
  }, [paypalToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // the thank-you stays a little while once the payment shows, then leaves the address
  const shownPaid = Boolean(c && c.payment)
  useEffect(() => {
    if (!paid || !shownPaid) return undefined
    const t = setTimeout(clearPaid, 12000)
    return () => clearTimeout(t)
  }, [paid, shownPaid, clearPaid])

  if (problem && !c) return <><button type="button" className="acc-link" onClick={close}>← All commissions</button><p className="acc-problem">{problem}</p></>
  if (!c) return <p className="acc-wait">Opening it…</p>
  const isPaid = Boolean(c.payment)
  const d = c.details || {}
  const cancel = async () => { setBusy(true); try { const s = await askCommissions('cancel', { id }); setC(s.commission); onChange() } catch (e) { setProblem(e.message) } setBusy(false); setCancelling(false) }
  return (
    <div className="acc-com">
      <button type="button" className="acc-link acc-com-back" onClick={close}>← All commissions</button>
      {capture === 'taking' && <p className="acc-wait" role="status">Taking the PayPal payment…</p>}
      {capture && capture !== 'taking' && capture !== 'paid' && <p className="acc-problem" role="alert">{capture}</p>}
      {(paid || capture === 'paid') && (
        <div className="acc-welcome" role="status">{isPaid ? <><b>Paid, thank you!</b> The work starts now: follow each stage here, and Milton will write as it goes.</> : <>Thank you! Confirming your payment… it shows here in a moment.</>}</div>
      )}
      <article className="acc-order acc-com-card">
        <header className="acc-order-head">
          <div>
            <strong>{c.title}</strong>
            <small>{c.number} · {d.kind} · asked {longDay(c.createdAt)}</small>
          </div>
          <span className={`acc-pill is-${c.status}`}>{WORDS[c.status] || c.status}</span>
        </header>
        <Tracker status={c.status} />

        {c.quote && !isPaid && c.status !== 'cancelled' && <QuoteCard c={c} ways={ways} />}

        {isPaid && (
          <section className="acc-order-foot acc-com-paid">
            <div>
              <div className="label">Paid</div>
              <p><b>{priced(c.payment.amount, c.payment.currency)}</b>{c.payment.paidWith ? ` · ${c.payment.paidWith}` : ''} · {longDay(c.payment.paidAt)}{c.payment.refunded ? ' · refunded' : ''}</p>
              {c.quote && <p className="acc-com-dim"><Linked text={c.quote.includes} />{c.quote.due ? ` · ready by ${dueDay(c.quote.due)}` : ''}</p>}
            </div>
            <div>
              <div className="label">{c.quote && c.quote.ship ? 'Posting to' : 'Delivery'}</div>
              {c.address ? <p>{[c.address.name, c.address.line1, c.address.line2, [c.address.postal_code, c.address.city].filter(Boolean).join(' '), c.address.country].filter(Boolean).map((l, i) => <span key={i}>{l}<br /></span>)}</p> : <p>{c.quote && c.quote.ship ? 'The address you gave at the checkout.' : 'Digital: the finished file comes here and by email.'}</p>}
            </div>
          </section>
        )}

        <section className="acc-com-talk">
          <div className="label">The conversation</div>
          <Thread messages={c.messages || []} />
          {c.status !== 'cancelled' ? <Reply id={c.id} onSent={(next) => { setC(next); onChange() }} /> : <p className="acc-com-dim">This commission is closed.</p>}
          {problem && <p className="acc-problem">{problem}</p>}
        </section>

        <details className="acc-com-ask">
          <summary>What you asked for</summary>
          <dl>
            <dt>Kind</dt><dd>{d.kind || '—'}</dd>
            {d.size && <><dt>Size</dt><dd>{d.size}</dd></>}
            {d.budget && <><dt>Budget</dt><dd>{d.budget}</dd></>}
            <dt>Needed by</dt><dd>{d.due || 'No deadline'}</dd>
            <dt>The idea</dt><dd><Linked text={d.idea} /></dd>
            {d.refs && d.refs.length > 0 && <><dt>References</dt><dd>{d.refs.map((l) => <a key={l} href={l} target="_blank" rel="noreferrer nofollow">{l.replace(/^https?:\/\//, '')}</a>)}</dd></>}
          </dl>
        </details>

        {['requested', 'discussing', 'quoted'].includes(c.status) && (
          <div className="acc-com-cancel">
            {cancelling ? (
              <><span>Cancel this commission? Milton is told.</span><button type="button" className="btn ghost sm" onClick={() => setCancelling(false)} disabled={busy}>Keep it</button><button type="button" className="btn sm acc-modal-yes" onClick={cancel} disabled={busy}>{busy ? 'Cancelling…' : 'Yes, cancel it'}</button></>
            ) : <button type="button" className="acc-link" onClick={() => setCancelling(true)}>Cancel this commission</button>}
          </div>
        )}
      </article>
    </div>
  )
}

/* The Commissions part of the Orders tab. `params`/`setParams` are the page's address. */
export default function AccountCommissions({ list, reload, params, setParams }) {
  const id = params.get('c') || ''
  const paid = params.get('paid') === '1'
  const paypalToken = params.get('paypal') === 'return' ? params.get('token') || '' : ''
  const to = (next) => setParams(next, { replace: true })
  const open = (cid) => { to({ tab: 'orders', view: 'commissions', c: cid }); window.scrollTo?.({ top: Math.min(window.scrollY, 420), behavior: 'smooth' }) }
  const close = () => to({ tab: 'orders', view: 'commissions' })
  const clearReturn = useCallback(() => setParams(id ? { tab: 'orders', view: 'commissions', c: id, ...(paid ? { paid: '1' } : {}) } : { tab: 'orders', view: 'commissions' }, { replace: true }), [id, paid, setParams])
  const clearPaid = useCallback(() => setParams({ tab: 'orders', view: 'commissions', c: id }, { replace: true }), [id, setParams])
  if (id) return <Commission key={id} id={id} close={close} onChange={reload} paid={paid} paypalToken={paypalToken} clearReturn={clearReturn} clearPaid={clearPaid} />
  return <CommissionList list={list} open={open} />
}
