import { useRef, useState } from 'react'
import { brand, commissions, quote, redraws, work } from '../data/site'
import Compare from '../components/Compare'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Magnetic from '../components/Magnetic'
import Picker from '../components/Picker'
import PageTitle from '../components/PageTitle'
import Runner from '../components/Runner'
import { useSendForm } from '../data/contact'
import { Elsewhere } from '../components/Buy'

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

export default function Commissions() {
  const { open, title, intro, tiers, steps, notes, processLabel, processTitle, requestLabel, requestTitle, closedTitle, closedText } = commissions
  const kinds = [...tiers.map((t) => t.name), 'Something else']
  // the request is sent by the site itself, straight to the artist's inbox (api/contact.js); with a
  // form service set in the admin it goes there instead
  const form = true
  const byService = Boolean(brand.contactAction)
  const { send, state, problem, fallback, again } = useSendForm('commission')
  // the set shown beside How it works: the one named in the admin, or the first; "none" for none
  const wanted = String(commissions.processSet || '').trim().toLowerCase()
  const set = wanted === 'none' ? null : redraws.find((r) => !wanted || r.title.toLowerCase() === wanted) || redraws[0] || null
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

      {tiers.length > 0 && (
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
                      {quote.url
                        ? <a className="tier-go" href={quote.url} target="_blank" rel="noreferrer"><span>{t.price || quote.label}</span><i aria-hidden="true">↗</i></a>
                        : <div className="tier-go"><span>{t.price || 'Ask for a quote'}</span></div>}
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {steps.length > 0 && (
        <section className="spread">
          <div className="container">
            <Runner label={processLabel} page={++n} />
            <div className="spread-head"><h2 className="display h-lg">{processTitle}</h2></div>
            {set ? (
              /* the piece at each stage beside the steps, staying in view; pointing at a step shows its stage */
              <div className="cm-process">
                <div className="cm-process-art" ref={art}>
                  <Compare set={set} show={focus} />
                  <p className="cm-process-tip">Pick a step to see that stage, or drag the lines yourself.</p>
                </div>
                <ol className="cm-steps" onMouseLeave={() => setFocus(null)}>
                  {steps.map((s, i) => {
                    const k = stageOf(s, i, steps, set)
                    return (
                      <Reveal as="li" key={s.title} delay={i * 0.08} y={20}>
                        <button type="button" className={`hp cm-step ${TONES[i % TONES.length]} ${focus !== null && focus === k ? 'on' : ''}`} onMouseEnter={() => setFocus(k)} onFocus={() => setFocus(k)} onClick={() => pick(k)} aria-label={`${s.title}${k !== null ? `: show the ${set.stages[k].year.toLowerCase()}` : ''}`}>
                          <span className="hp-in">
                            <span className="step-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                            <span className="cm-step-words">
                              <strong className="display h-sm">{s.title}</strong>
                              <span>{s.text}</span>
                              {k !== null && <em aria-hidden="true">{set.stages[k].year}</em>}
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

      <section className="spread" id="request">
        <div className="container">
          <Runner label={requestLabel} page={++n} />
          <div className="cm">
            <Reveal className="hp is-loud">
              <div className="hp-in">
                <div className="words">
                  <h2 className="display h-lg">{open ? requestTitle : closedTitle}</h2>
                  {!open && closedText && <p className="lead">{closedText}</p>}
                  {notes.length > 0 && <ul className="notes">{notes.map((x) => <li key={x}>{x}</li>)}</ul>}
                </div>
              </div>
            </Reveal>
            {form ? (
              <Reveal className="hp form-panel" delay={0.1}>
                <div className="hp-in">
                  <div className="words">
                    {state === 'sent' ? (
                      <div className="form-sent" role="status">
                        <i aria-hidden="true">✓</i>
                        <div><strong>Request sent</strong><span>Thank you. I will write back by email with a quote.</span></div>
                        <button type="button" className="btn ghost sm" onClick={again}>Send another</button>
                      </div>
                    ) : (
                    <form onSubmit={byService ? undefined : send} action={brand.contactAction || undefined} method={byService ? 'post' : undefined}>
                      <div className="field"><input id="c-name" name="name" type="text" placeholder=" " required autoComplete="name" /><label htmlFor="c-name">Your name</label><span className="bar" /></div>
                      <div className="field"><input id="c-email" name="email" type="email" placeholder=" " required autoComplete="email" /><label htmlFor="c-email">Email</label><span className="bar" /></div>
                      <Picker label="What kind of piece" name="kind" options={kinds} />
                      <div className="field"><textarea id="c-idea" name="idea" placeholder=" " required rows={5} /><label htmlFor="c-idea">The idea: who or what, the mood, the pose</label><span className="bar" /></div>
                      <div className="field"><input id="c-refs" name="refs" type="text" placeholder=" " /><label htmlFor="c-refs">Link to reference pictures (optional)</label><span className="bar" /></div>
                      <div className="field"><input id="c-due" name="due" type="text" placeholder=" " /><label htmlFor="c-due">Needed by (optional)</label><span className="bar" /></div>
                      <input className="hp-trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                      <Magnetic><button className="btn" type="submit" disabled={state === 'sending'} aria-busy={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send the request'} <span className="arrow">→</span></button></Magnetic>
                      {problem && <p className="form-alt is-bad" role="alert">{problem}{fallback && <> <Elsewhere subject="A commission request" /></>}</p>}
                      <p className="form-alt">
                        {brand.email && <>Or write to <a href={`mailto:${brand.email}`}>{brand.email}</a>. </>}
                        {quote.url && <>For a quick quote, <a href={quote.url} target="_blank" rel="noreferrer">message me on Instagram</a>.</>}
                      </p>
                    </form>
                    )}
                  </div>
                </div>
              </Reveal>
            ) : (
              <Reveal className="hp is-red dm" delay={0.1}>
                <div className="hp-in">
                  <div className="words">
                    <p className="dm-say">Send me the idea. I answer every message, with a quote.</p>
                    {quote.url && <Magnetic><a className="btn" href={quote.url} target="_blank" rel="noreferrer">{quote.label} on Instagram <span className="arrow">↗</span></a></Magnetic>}
                    {brand.handle && <p className="dm-handle">{brand.handle}</p>}
                  </div>
                </div>
              </Reveal>
            )}
          </div>
        </div>
      </section>
    </Page>
  )
}
