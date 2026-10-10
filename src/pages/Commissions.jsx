import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { brand, commissions, quote, redraws, shows, work } from '../data/site'
import Compare from '../components/Compare'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import { QuoteGo, quoteSign } from '../components/QuoteLink'
import PageTitle from '../components/PageTitle'
import Runner from '../components/Runner'
import { useSendForm } from '../data/contact'
import { Elsewhere } from '../components/Buy'
import { useAccount } from '../hooks/useAccount'
import { askCommissions } from '../components/AccountCommissions'

/* The colour of each step's panel, in turn. */
const TONES = ['is-loud', 'is-red']

/* The stage of a pencils-to-colours set a step is about: "Quote and pencils" the pencils, "Inks
   and colours" the inks, "Delivery" (the last step) the finished colours; any other, none. */
const stageOf = (step, i, steps, set) => {
  const words = `${step.title} ${step.text}`.toLowerCase()
  const names = set.stages.map((s) => String(s.year).toLowerCase().replace(/s$/, ''))
  const said = [...names.keys()].map((k) => [k, words.indexOf(names[k])]).filter(([, at]) => at >= 0).sort((a, b) => a[1] - b[1])
  if (said.length) return said[0][0]
  return i === steps.length - 1 ? set.stages.length - 1 : null
}

/* One field of the request: its label always showing, an optional hint, and its problem (if any)
   tied to it, so a screen reader reads them with the field. */
function Field({ id, label, hint, error, textarea = false, required = false, ...rest }) {
  const described = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined
  const Tag = textarea ? 'textarea' : 'input'
  return (
    <div className={`cmr-field ${error ? 'is-bad' : ''}`}>
      <label htmlFor={id}>{label}{required ? <span className="cmr-req" aria-hidden="true"> *</span> : <small> (optional)</small>}</label>
      <Tag id={id} required={required} aria-required={required ? 'true' : undefined} aria-invalid={error ? 'true' : undefined} aria-describedby={described} {...(textarea ? {} : { type: 'text' })} {...rest} />
      {hint && <small id={`${id}-hint`} className="cmr-hint">{hint}</small>}
      {error && <small id={`${id}-err`} className="cmr-err">{error}</small>}
    </div>
  )
}

/* The kind of piece: a card for each offer on this page (its name and price, when set), and
   "Something else". Radio buttons underneath, so arrows and Tab work, and the form sends it. */
function KindPicker({ options, value, onChange }) {
  return (
    <fieldset className="cmr-group">
      <legend id="cmr-kind-legend">What kind of piece <span className="cmr-req" aria-hidden="true">*</span><span className="sr-only"> (required)</span></legend>
      <div className="cmr-kinds" role="radiogroup" aria-labelledby="cmr-kind-legend" aria-required="true">
        {options.map((o) => (
          <label key={o.name} className={`cmr-kind ${value === o.name ? 'on' : ''}`}>
            <input type="radio" name="kind" value={o.name} checked={value === o.name} onChange={() => onChange(o.name)} />
            <strong>{o.name}</strong>
            <small>{o.price || (o.other ? 'Tell me below' : 'Priced by quote')}</small>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

// other ways to reach the artist, under every form
function Elsewise() {
  if (!brand.email && !brand.instagram) return null
  return (
    <p className="form-alt">
      {brand.email && <>Or write to <a href={`mailto:${brand.email}`}>{brand.email}</a>. </>}
      {brand.instagram && <>For a quick question, <a href={brand.instagram} target="_blank" rel="noreferrer">message me on Instagram</a>.</>}
    </p>
  )
}

/* Commissions closed (Page text → Commissions → Commissions are open): no request form, only the
   admin's words and the way to write. Commissions already asked for carry on in the account. */
function Closed({ text }) {
  const { user } = useAccount()
  return (
    <div className="cmr-closed">
      {text && <p className="cmr-closed-text">{text}</p>}
      <p>{brand.email ? <>Questions, or want to hear when they open? Write to <a href={`mailto:${brand.email}`}>{brand.email}</a>.</> : 'Check back soon: new requests open here again.'}</p>
      {user && <Link className="btn ghost sm" to="/account?tab=orders&view=commissions">Your commissions <span className="arrow">→</span></Link>}
    </div>
  )
}

/* A request made from the customer's account (api/commissions.js): it opens a commission they
   follow there, the conversation, the quote and each stage. Without a login, the way in. The kind
   of piece is held by the page, so an offer's quote button can pick it. */
function AccountRequest({ options, kind, setKind, picked = false }) {
  const { user } = useAccount()
  const opened = useRef(Date.now())
  const [state, setState] = useState('')
  const [problem, setProblem] = useState('')
  const [errors, setErrors] = useState({})
  const [made, setMade] = useState(null)
  const next = encodeURIComponent(`/commissions${picked ? `?kind=${encodeURIComponent(kind)}` : ''}#request`)
  const send = async (e) => {
    e.preventDefault()
    if (state === 'sending') return
    const form = e.target
    const data = Object.fromEntries(new FormData(form).entries())
    if (data.website || Date.now() - opened.current < 2500) return // a bot: the hidden field, or too quick
    // checked here first, so the problem shows by its field
    if (String(data.idea || '').trim().length < 2) { setErrors({ idea: 'Tell me the idea: a sentence or two is enough.' }); setProblem(''); form.elements.idea?.focus(); return }
    setState('sending'); setProblem(''); setErrors({})
    try {
      const s = await askCommissions('request', { kind, idea: data.idea, refs: data.refs, size: data.size, budget: data.budget, due: data.due })
      setMade(s.commission); setState('sent'); form.reset()
    } catch (err) {
      if (err.field) { setErrors({ [err.field]: err.message }); form.elements[err.field]?.focus() } else setProblem(err.message)
      setState('failed')
    }
  }
  if (!user) return (
    <div className="cm-login">
      <strong>Log in or make an account to request a commission</strong>
      <p>Your request, our conversation, the quote and every stage of the piece stay together in your account.{picked && kind !== 'Something else' ? <> You picked <b>{kind}</b>: it is kept for when you are back.</> : null}</p>
      <div className="cm-login-go">
        <Link className="btn sm" to={`/account/login?next=${next}`}>Log in <span className="arrow">→</span></Link>
        <Link className="btn ghost sm" to={`/account/signup?next=${next}`}>Make an account</Link>
      </div>
      <Elsewise />
    </div>
  )
  if (state === 'sent' && made) return (
    <div className="form-sent" role="status">
      <i aria-hidden="true">✓</i>
      <div><strong>Request sent</strong><span>Follow it in your account: commission {made.number}. I will write back there (and by email) with questions and a quote.</span></div>
      <div className="cm-sent-go">
        <Link className="btn sm" to={`/account?tab=orders&view=commissions&c=${made.id}`}>Follow it in your account <span className="arrow">→</span></Link>
        <button type="button" className="btn ghost sm" onClick={() => { setState(''); setMade(null) }}>Send another</button>
      </div>
    </div>
  )
  return (
    <form className="cmr-form" onSubmit={send} noValidate aria-describedby={problem ? 'cmr-problem' : undefined}>
      <KindPicker options={options} value={kind} onChange={setKind} />
      <fieldset className="cmr-group">
        <legend>The idea</legend>
        <Field id="c-idea" name="idea" label="What should I draw?" hint="Who or what, the mood, the pose." textarea rows={4} maxLength={5000} required error={errors.idea} />
        <Field id="c-refs" name="refs" label="Links to reference pictures" hint="Paste one or more links, separated by spaces." maxLength={2000} error={errors.refs} />
      </fieldset>
      <fieldset className="cmr-group">
        <legend>Details</legend>
        <div className="cmr-row">
          <Field id="c-size" name="size" label="Size" placeholder="A4, A3…" maxLength={120} error={errors.size} />
          <Field id="c-budget" name="budget" label="Budget" placeholder="€…" maxLength={120} error={errors.budget} />
          <Field id="c-due" name="due" label="Needed by" placeholder="A date, or no rush" maxLength={120} error={errors.due} />
        </div>
      </fieldset>
      <input className="hp-trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="cmr-actions">
        <button className="btn cmr-send" type="submit" disabled={state === 'sending'} aria-busy={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send request'} <span className="arrow">→</span></button>
        <small className="cmr-after">I answer in your account, with a quote. Nothing is paid until you accept it.</small>
      </div>
      {problem && <p id="cmr-problem" className="form-alt is-bad" role="alert">{problem}</p>}
      <Elsewise />
    </form>
  )
}

/* Without customer accounts: the request is emailed to the artist (api/contact.js), as before. */
function EmailRequest({ options, kind, setKind }) {
  const { send, state, problem, fallback, again } = useSendForm('commission')
  const byService = Boolean(brand.contactAction) // a form service set in the admin takes it instead
  if (state === 'sent') return (
    <div className="form-sent" role="status">
      <i aria-hidden="true">✓</i>
      <div><strong>Request sent</strong><span>Thank you. I will write back by email with a quote.</span></div>
      <button type="button" className="btn ghost sm" onClick={again}>Send another</button>
    </div>
  )
  return (
    <form className="cmr-form" onSubmit={byService ? undefined : send} action={brand.contactAction || undefined} method={byService ? 'post' : undefined} aria-describedby={problem ? 'cmr-problem' : undefined}>
      <fieldset className="cmr-group">
        <legend>You</legend>
        <div className="cmr-row is-two">
          <Field id="c-name" name="name" label="Your name" required autoComplete="name" maxLength={80} />
          <Field id="c-email" name="email" label="Email" type="email" required autoComplete="email" maxLength={254} />
        </div>
      </fieldset>
      <KindPicker options={options} value={kind} onChange={setKind} />
      <fieldset className="cmr-group">
        <legend>The idea</legend>
        <Field id="c-idea" name="idea" label="What should I draw?" hint="Who or what, the mood, the pose." textarea rows={4} maxLength={5000} required />
        <div className="cmr-row is-two">
          <Field id="c-refs" name="refs" label="Link to reference pictures" maxLength={2000} />
          <Field id="c-due" name="due" label="Needed by" maxLength={120} />
        </div>
      </fieldset>
      <input className="hp-trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="cmr-actions">
        <button className="btn cmr-send" type="submit" disabled={state === 'sending'} aria-busy={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send request'} <span className="arrow">→</span></button>
      </div>
      {problem && <p id="cmr-problem" className="form-alt is-bad" role="alert">{problem}{fallback && <> <Elsewhere subject="A commission request" /></>}</p>}
      <Elsewise />
    </form>
  )
}

export default function Commissions() {
  const { open, title, intro, tiers, steps, notes, processLabel, processTitle, requestLabel, requestTitle, closedTitle, closedText } = commissions
  // the kinds of piece to pick from in the request: each offer (with its price), and anything else
  const kindOptions = [...tiers.map((t) => ({ name: t.name, price: t.price || '' })), { name: 'Something else', price: '', other: true }]
  const location = useLocation()
  const asked = new URLSearchParams(location.search).get('kind') || ''
  const [kind, setKind] = useState(() => (kindOptions.some((o) => o.name === asked) ? asked : kindOptions[0].name))
  const [picked, setPicked] = useState(() => kindOptions.some((o) => o.name === asked)) // chosen on an offer (or in the address)
  const requestRef = useRef(null)
  // to the request card: an offer's quote button here, or a link from elsewhere (…/commissions?kind=Sketch#request)
  const toRequest = () => {
    const el = requestRef.current
    if (!el) return
    if (window.__lenis) window.__lenis.scrollTo(el, { offset: -80, duration: 0.9 }); else el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const choose = (name) => { setKind(name); setPicked(true); toRequest() }
  useEffect(() => {
    if (asked && kindOptions.some((o) => o.name === asked)) { setKind(asked); setPicked(true) }
    if (location.hash !== '#request') return undefined
    const t = setTimeout(toRequest, 450) // after the page's own scroll to the top
    return () => clearTimeout(t)
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps
  // with customer accounts on, a request is made from the account (and needs a login); without, it is emailed as before
  const account = useAccount()
  // the set shown beside How it works: the one switched on for it under Home → The sets (the first
  // of those), or else the first set
  const wanted = String(commissions.processSet || '').trim().toLowerCase() // an older way: a set's title, or "none"
  const set = wanted === 'none' ? null : (wanted && redraws.find((r) => r.title.toLowerCase() === wanted)) || redraws.find((r) => r.commissions) || redraws[0] || null
  const [focus, setFocus] = useState(null) // the stage the step being pointed at is about
  const art = useRef(null)
  // on a phone the picture is above the steps: a tapped step brings it back into view
  const pick = (k) => { setFocus(k); if (k !== null && art.current && matchMedia('(max-width: 799px)').matches) art.current.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  let n = 1
  return (
    <Page title="Commissions">
      <PageTitle tone="red" label="Commissions" title={title} lead={intro} slides={work}>
        <div className={`status ${open ? 'on' : ''}`}><i />{open ? 'Commissions are open' : 'Commissions are closed right now'}</div>
      </PageTitle>

      {shows('commissions', 'process') && steps.length > 0 && (
        <section className="spread">
          <div className="container">
            <Runner label={processLabel} page={++n} />
            <div className="spread-head"><h2 className="display h-lg">{processTitle}</h2></div>
            {set ? (
              /* the piece at each stage on the left, the steps two by two on its right; picking a step shows its stage */
              <div className="cm-process">
                <div className="cm-process-art" ref={art}>
                  <Compare set={set} show={focus} />
                  <p className="cm-process-tip">Pick a step to see that stage, or drag the lines yourself.</p>
                </div>
                <ol className={`steps cm-steps ${steps.length > 4 ? 'is-long' : ''}`} style={{ '--n': steps.length }} onMouseLeave={() => setFocus(null)}>
                  {steps.map((s, i) => {
                    const k = stageOf(s, i, steps, set)
                    return (
                      <Reveal as="li" key={s.title} delay={i * 0.08} y={24}>
                        <button type="button" className={`hp cm-step ${TONES[i % TONES.length]} ${focus !== null && focus === k ? 'on' : ''}`} onMouseEnter={() => setFocus(k)} onFocus={() => setFocus(k)} onClick={() => pick(k)} aria-label={`${s.title}${k !== null ? `: show the ${set.stages[k].year.toLowerCase()}` : ''}`}>
                          <span className="hp-in">
                            <span className="words">
                              <span className="step-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                              <strong className="display h-md">{s.title}</strong>
                              <span className="cm-step-text">{s.text}</span>
                              {k !== null && <em className="cm-step-stage" aria-hidden="true">{set.stages[k].year}</em>}
                            </span>
                          </span>
                        </button>
                      </Reveal>
                    )
                  })}
                </ol>
              </div>
            ) : (
            /* a strip, read left to right: one panel a step, the gutters between them leaning the way it reads */
            <ol className={`steps ${steps.length > 4 ? 'is-long' : ''}`} style={{ '--n': steps.length }}>
              {steps.map((s, i) => (
                <Reveal as="li" key={s.title} delay={i * 0.09} y={24}>
                  <div className={`hp ${TONES[i % TONES.length]}`}>
                    <div className="hp-in">
                      <div className="words">
                        <span className="step-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                        <h3 className="display h-md">{s.title}</h3>
                        <p>{s.text}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ol>
            )}
          </div>
        </section>
      )}

      {shows('commissions', 'offers') && tiers.length > 0 && (
        <section className="spread">
          <div className="container">
            <Runner label="What I draw" page={++n} />
            <div className="tiers">
              {tiers.map((t, i) => (
                <Reveal key={t.name} delay={i * 0.08} className="cell">
                  <article className="hp tier">
                    <div className="hp-in">
                      {/* the head of the card: its number and what it is, in red */}
                      <header className="tier-head">
                        <span className="tier-no" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                        <h2 className="display">{t.name}</h2>
                      </header>
                      <div className="tier-body">
                        <p>{t.text}</p>
                        {t.includes?.length > 0 && <ul>{t.includes.map((x) => <li key={x}>{x}</li>)}</ul>}
                      </div>
                      {/* the foot: the price if there is one, and the way to a quote */}
                      {quote.hidden
                        ? (t.price ? <div className="tier-go is-closed"><span>{t.price}</span></div> : null)
                        : quote.via !== 'site'
                        ? <QuoteGo className="tier-go" tier={t.name}><span>{t.price || quote.label}</span><i aria-hidden="true">{quoteSign()}</i></QuoteGo>
                        : quote.closed
                          ? <div className="tier-go is-closed"><span>{t.price || quote.label}</span><small>Closed for now</small></div>
                          : <button type="button" className="tier-go" onClick={() => choose(t.name)} aria-label={`${quote.label}: ${t.name}${t.price ? `, ${t.price}` : ''}`}><span>{t.price || quote.label}</span><i aria-hidden="true">→</i></button>}
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* the request: one dark card, its red strip saying whether commissions are open (and who is
          asking); the points to know beside the form (above it on a phone). Closed: no form.
          Switched off under Show / hide: not here at all. */}
      {shows('commissions', 'request') && (
      <section className="spread" id="request" ref={requestRef}>
        <div className="container">
          <Runner label={requestLabel} page={++n} />
          <Reveal className={`cmr ${open ? '' : 'is-closed'}`} y={20}>
            <header className="cmr-head">
              <div className="cmr-head-top">
                <div className={`status ${open ? 'on' : ''}`}><i />{open ? 'Commissions are open' : 'Commissions are closed right now'}</div>
                {open && account.user && <p className="cm-as">Asking as <b>{account.user.name || account.user.email}</b></p>}
              </div>
              <h2 className="cmr-title">{open ? requestTitle : closedTitle}</h2>
            </header>
            <div className="cmr-body">
              {notes.length > 0 && (
                <aside className="cmr-notes" aria-labelledby="cmr-notes-title">
                  <h3 id="cmr-notes-title">Good to know</h3>
                  <ul>{notes.map((x) => <li key={x}>{x}</li>)}</ul>
                </aside>
              )}
              <div className="cmr-main">
                {!open ? <Closed text={closedText} />
                  : !account.ready ? <p className="form-alt">One moment…</p>
                    : account.on ? <AccountRequest options={kindOptions} kind={kind} setKind={(k) => { setKind(k); setPicked(true) }} picked={picked} />
                      : <EmailRequest options={kindOptions} kind={kind} setKind={setKind} />}
              </div>
            </div>
          </Reveal>
        </div>
      </section>
      )}
    </Page>
  )
}
