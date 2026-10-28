import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import Page from '../components/Page'
import PageTitle from '../components/PageTitle'
import { accessibility, brand, shows } from '../data/site'

/* The accessibility statement (Page text → Accessibility statement in the admin), linked from the
   foot of every page. Each part's text is paragraphs (a blank line between them); lines that
   start with "- " are a list. Under the last part, how to reach the artist. */
const blocks = (text) => String(text || '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
function Words({ text }) {
  return blocks(text).map((b, i) => {
    const lines = b.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.every((l) => l.startsWith('- '))) return <ul key={i} className="a11y-list">{lines.map((l, k) => <li key={k}>{l.slice(2)}</li>)}</ul>
    return <p key={i}>{lines.map((l, k) => <Fragment key={k}>{k > 0 && <br />}{l}</Fragment>)}</p>
  })
}
const longDate = (iso) => { const d = new Date(`${iso}T12:00:00`); return Number.isNaN(+d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) }

export default function Accessibility() {
  const a = accessibility
  const updated = a.updated ? longDate(a.updated) : ''
  const contactPage = shows('pages', 'contact')
  return (
    <Page title={a.title} className="a11y-page">
      <PageTitle label={a.label} title={a.title} lead={a.intro} />
      <section className="container a11y">
        <div className="hp a11y-panel">
          <div className="hp-in">
            {a.sections.map((s, i) => (
              <section key={i} className="a11y-part" aria-labelledby={`a11y-h-${i}`}>
                <h2 id={`a11y-h-${i}`} className="a11y-h">{s.heading}</h2>
                <Words text={s.text} />
              </section>
            ))}
            {(brand.email || contactPage) && (
              <p className="a11y-reach">
                {brand.email && <>Email <a href={`mailto:${brand.email}`}>{brand.email}</a></>}
                {brand.email && contactPage && ', or use the '}
                {contactPage && <><Link to="/contact">contact form</Link></>}.
              </p>
            )}
            {updated && <p className="a11y-updated">Last updated {updated}.</p>}
          </div>
        </div>
      </section>
    </Page>
  )
}
