import { useState } from 'react'
import { brand, commissions, quote, work } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Magnetic from '../components/Magnetic'
import Picker from '../components/Picker'
import PageTitle from '../components/PageTitle'
import Runner from '../components/Runner'

/* The colour of each step's panel, in turn. */
const TONES = ['is-loud', 'is-red']

export default function Commissions() {
  const [sent, setSent] = useState(false)
  const { open, title, intro, tiers, steps, notes, processLabel, processTitle, requestLabel, requestTitle, closedTitle, closedText } = commissions
  const kinds = [...tiers.map((t) => t.name), 'Something else']
  // with no email and no form service to send to, the request goes to Instagram instead of a form
  const form = Boolean(brand.email || brand.contactAction)
  const submit = (e) => {
    if (brand.contactAction) return
    e.preventDefault()
    const d = new FormData(e.target)
    const body = encodeURIComponent(`${d.get('idea')}\n\nReference pictures: ${d.get('refs') || 'none yet'}\nNeeded by: ${d.get('due') || 'no deadline'}\n\n— ${d.get('name')} (${d.get('email')})`)
    window.location.href = `mailto:${brand.email}?subject=${encodeURIComponent(`Commission: ${d.get('kind')} for ${d.get('name')}`)}&body=${body}`
    setSent(true)
  }
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
            {/* a strip, read left to right: one panel a step, the gutters between them leaning the way it reads */}
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
                    <form onSubmit={submit} action={brand.contactAction || undefined} method={brand.contactAction ? 'post' : undefined}>
                      <div className="field"><input id="c-name" name="name" type="text" placeholder=" " required autoComplete="name" /><label htmlFor="c-name">Your name</label><span className="bar" /></div>
                      <div className="field"><input id="c-email" name="email" type="email" placeholder=" " required autoComplete="email" /><label htmlFor="c-email">Email</label><span className="bar" /></div>
                      <Picker label="What kind of piece" name="kind" options={kinds} />
                      <div className="field"><textarea id="c-idea" name="idea" placeholder=" " required rows={5} /><label htmlFor="c-idea">The idea: who or what, the mood, the pose</label><span className="bar" /></div>
                      <div className="field"><input id="c-refs" name="refs" type="text" placeholder=" " /><label htmlFor="c-refs">Link to reference pictures (optional)</label><span className="bar" /></div>
                      <div className="field"><input id="c-due" name="due" type="text" placeholder=" " /><label htmlFor="c-due">Needed by (optional)</label><span className="bar" /></div>
                      <Magnetic><button className="btn" type="submit">{sent ? 'Opening your mail app…' : 'Send the request'} <span className="arrow">→</span></button></Magnetic>
                      <p className="form-alt">
                        {brand.email && <>Or write to <a href={`mailto:${brand.email}`}>{brand.email}</a>. </>}
                        {quote.url && <>For a quick quote, <a href={quote.url} target="_blank" rel="noreferrer">message me on Instagram</a>.</>}
                      </p>
                    </form>
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
