import { useState } from 'react'
import { Link } from 'react-router-dom'
import { brand, contact, heroPanels, shows, social, work } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Magnetic from '../components/Magnetic'
import Picker from '../components/Picker'
import SocialIcon from '../components/SocialIcon'
import PageTitle from '../components/PageTitle'
import Runner from '../components/Runner'

export default function Contact() {
  const [sent, setSent] = useState(false)
  // with no email and no form service to send to, the message goes to Instagram instead of a form
  const form = Boolean(brand.email || brand.contactAction)
  const submit = (e) => {
    if (brand.contactAction) return
    e.preventDefault()
    const d = new FormData(e.target)
    const body = encodeURIComponent(`${d.get('message')}\n\n— ${d.get('name')} (${d.get('email')})`)
    window.location.href = `mailto:${brand.email}?subject=${encodeURIComponent(`${d.get('topic') ? `[${d.get('topic')}] ` : ''}Message from ${d.get('name')}`)}&body=${body}`
    setSent(true)
  }
  return (
    <Page title="Contact">
      <PageTitle label={contact.label} title={contact.title} lead={contact.intro} art={(heroPanels[3] || work[0])?.src} />

      <section className="spread">
        <div className="container">
          <Runner label="Write" page={2} />
          <div className="ct">
            {form ? (
              <Reveal className="hp form-panel">
                <div className="hp-in">
                  <div className="words">
                    <form onSubmit={submit} action={brand.contactAction || undefined} method={brand.contactAction ? 'post' : undefined}>
                      <div className="field"><input id="name" name="name" type="text" placeholder=" " required autoComplete="name" /><label htmlFor="name">Your name</label><span className="bar" /></div>
                      <div className="field"><input id="email" name="email" type="email" placeholder=" " required autoComplete="email" /><label htmlFor="email">Email</label><span className="bar" /></div>
                      {contact.topics.length > 0 && <Picker label="About" name="topic" options={contact.topics} />}
                      <div className="field"><textarea id="message" name="message" placeholder=" " required rows={5} /><label htmlFor="message">Message</label><span className="bar" /></div>
                      <Magnetic><button className="btn" type="submit">{sent ? 'Opening your mail app…' : 'Send message'} <span className="arrow">→</span></button></Magnetic>
                    </form>
                  </div>
                </div>
              </Reveal>
            ) : (
              <Reveal className="hp is-red dm">
                <div className="hp-in">
                  <div className="words">
                    <p className="dm-say">The quickest way to reach me is a message on Instagram.</p>
                    {brand.instagram && <Magnetic><a className="btn" href={brand.instagram} target="_blank" rel="noreferrer">Message me on Instagram <span className="arrow">↗</span></a></Magnetic>}
                    {brand.handle && <p className="dm-handle">{brand.handle}</p>}
                  </div>
                </div>
              </Reveal>
            )}
            <div className="ct-side">
              {brand.email && (
                <Reveal className="hp" delay={0.06}>
                  <div className="hp-in"><div className="words">
                    <div className="label">Email</div>
                    <a className="mail" href={`mailto:${brand.email}`}>{brand.email}</a>
                  </div></div>
                </Reveal>
              )}
              {shows('pages', 'commissions') && (
                <Reveal className="hp is-loud" delay={0.1}>
                  <div className="hp-in"><div className="words">
                    <div className="label">Want a piece drawn?</div>
                    <p className="dim">Commissions have a page of their own, with what I draw and how it works.</p>
                    <Link className="btn sm" to="/commissions">Commissions <span className="arrow">→</span></Link>
                  </div></div>
                </Reveal>
              )}
              {social.length > 0 && (
                <Reveal className="hp" delay={0.14}>
                  <div className="hp-in"><div className="words">
                    <div className="label">Follow</div>
                    <ul className="social">
                      {social.map((s) => (
                        <li key={s.label + s.url}>
                          <a href={s.url} target="_blank" rel="noreferrer">
                            <SocialIcon name={s.label} />
                            <span><strong>{s.label}</strong>{s.handle && <small>{s.handle}</small>}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div></div>
                </Reveal>
              )}
            </div>
          </div>
        </div>
      </section>
    </Page>
  )
}
