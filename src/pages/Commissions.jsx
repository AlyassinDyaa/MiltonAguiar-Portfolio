import { useState } from 'react'
import { asset, brand, commissions, quote, work } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Magnetic from '../components/Magnetic'
import Picker from '../components/Picker'
import PageTitle from '../components/PageTitle'
import Runner from '../components/Runner'

/* The four states a page goes through on the board. The steps of "How it works" are spread
   across them, first to last, whatever number of steps there is. */
const STAGES = ['The idea', 'Pencils', 'Inks', 'Colours']

export default function Commissions() {
  const [sent, setSent] = useState(false)
  const { open, title, intro, tiers, steps, notes, processLabel, processTitle, processImage, requestLabel, requestTitle, closedTitle, closedText } = commissions
  const kinds = [...tiers.map((t) => t.name), 'Something else']
  // the one picture the process strip develops, panel by panel: the one chosen in the admin, or the newest piece that is not a sketch
  const art = processImage || (work.find((p) => p.src && !/sketch|page/i.test(p.category || '')) || work.find((p) => p.src))?.src
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
      <PageTitle label="Commissions" title={title} lead={intro} art={art}>
        <div className={`status ${open ? 'on' : ''}`}><i />{open ? 'Commissions are open' : 'Commissions are closed right now'}</div>
      </PageTitle>

      {tiers.length > 0 && (
        <section className="spread">
          <div className="container">
            <Runner label="What I draw" page={++n} />
            <div className="tiers">
              {tiers.map((t, i) => (
                <Reveal key={t.name} delay={i * 0.08} className="hp tier">
                  <div className="hp-in">
                    <div className="words">
                      <span className="tier-no" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                      <h2 className="display h-md">{t.name}</h2>
                      <p className="dim">{t.text}</p>
                      {t.includes?.length > 0 && <ul>{t.includes.map((x) => <li key={x}>{x}</li>)}</ul>}
                      {quote.url
                        ? <a className="btn sm" href={quote.url} target="_blank" rel="noreferrer">{t.price ? `${t.price} · ` : ''}{quote.label} <span className="arrow">↗</span></a>
                        : <div className="tier-price">{t.price || 'Ask for a quote'}</div>}
                    </div>
                  </div>
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
            {/* a strip of panels: the same picture in each, a stage further on every time */}
            <ol className="process">
              {steps.map((s, i) => {
                const stage = steps.length === 1 ? 3 : Math.round((i / (steps.length - 1)) * 3)
                return (
                  <Reveal as="li" key={s.title} delay={i * 0.1} className="process-step">
                    <div className="process-panel" data-stage={stage}>
                      {art && stage > 0 && <span className="process-art" style={{ backgroundImage: `url("${asset(art)}")` }} aria-hidden="true" />}
                      <span className="pg-no" aria-hidden="true">{i + 1}</span>
                      <span className="process-stage" aria-hidden="true">{STAGES[stage]}</span>
                    </div>
                    <h3 className="display h-sm">{s.title}</h3>
                    <p className="dim">{s.text}</p>
                  </Reveal>
                )
              })}
            </ol>
          </div>
        </section>
      )}

      <section className="spread" id="request">
        <div className="container">
          <Runner label={requestLabel} page={++n} />
          <div className="cm">
            <Reveal className="hp">
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
