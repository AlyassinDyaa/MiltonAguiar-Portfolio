import { useState } from 'react'
import { Link } from 'react-router-dom'
import { brand, contact, shows, social } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Magnetic from '../components/Magnetic'
import Picker from '../components/Picker'
import SocialIcon from '../components/SocialIcon'

/* The one page that is not panels: an open page with the heading, the form on the left and
   where else to reach him on the right.
   The form goes to the form service if there is one, or opens the visitor's mail app if there
   is a contact email. With neither set, the message is copied and Instagram is opened, so it
   can be pasted there. */
export default function Contact() {
  const [sent, setSent] = useState('')
  const byMail = Boolean(brand.email), byService = Boolean(brand.contactAction)
  const submit = (e) => {
    if (byService) return
    e.preventDefault()
    const d = new FormData(e.target)
    const topic = d.get('topic') ? `[${d.get('topic')}] ` : ''
    const text = `${d.get('message')}\n\n— ${d.get('name')} (${d.get('email')})`
    if (byMail) {
      window.location.href = `mailto:${brand.email}?subject=${encodeURIComponent(`${topic}Message from ${d.get('name')}`)}&body=${encodeURIComponent(text)}`
      return setSent('Opening your mail app…')
    }
    // no email to send to: the message goes with the visitor to Instagram
    navigator.clipboard?.writeText(`${topic}${text}`).catch(() => { /* not copied: they can still write it there */ })
    if (brand.instagram) window.open(brand.instagram, '_blank', 'noopener')
    setSent('Message copied. Paste it into a message on Instagram.')
  }
  return (
    <Page title="Contact">
      {/* two columns from the top of the page: the heading and the form, and beside them where else to reach him */}
      <section className="open">
        <div className="container request">
          <div>
            <header className="page-head">
              {contact.label && <div className="label accent">{contact.label}</div>}
              <h1 className="display h-xl">{contact.title}</h1>
              <p className="lead">{contact.intro}</p>
            </header>
            <Reveal>
              <form className="lined" onSubmit={submit} action={brand.contactAction || undefined} method={byService ? 'post' : undefined}>
                <div className="field"><input id="name" name="name" type="text" placeholder=" " required autoComplete="name" /><label htmlFor="name">Your name</label><span className="bar" /></div>
                <div className="field"><input id="email" name="email" type="email" placeholder=" " required autoComplete="email" /><label htmlFor="email">Email</label><span className="bar" /></div>
                {contact.topics.length > 0 && <Picker label="About" name="topic" options={contact.topics} />}
                <div className="field"><textarea id="message" name="message" placeholder=" " required rows={5} /><label htmlFor="message">Message</label><span className="bar" /></div>
                <Magnetic><button className="btn" type="submit">{byMail || byService ? 'Send message' : 'Send on Instagram'} <span className="arrow">{byMail || byService ? '→' : '↗'}</span></button></Magnetic>
                {sent && <p className="form-alt" role="status">{sent}</p>}
              </form>
            </Reveal>
          </div>
          <Reveal delay={0.1} className="contact-side">
            {brand.email && (
              <div>
                <div className="label">Email</div>
                <a className="mail" href={`mailto:${brand.email}`}>{brand.email}</a>
              </div>
            )}
            {shows('pages', 'commissions') && (
              <div>
                <div className="label">Want a piece drawn?</div>
                <p className="dim">Commissions have a page of their own, with what I draw and how it works.</p>
                <Link className="btn ghost sm" to="/commissions">Commissions <span className="arrow">→</span></Link>
              </div>
            )}
            {social.length > 0 && (
              <div>
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
              </div>
            )}
          </Reveal>
        </div>
      </section>
    </Page>
  )
}
