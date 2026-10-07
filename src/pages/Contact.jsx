import { Link } from 'react-router-dom'
import { brand, contact, shows, social } from '../data/site'
import Page from '../components/Page'
import Reveal from '../components/Reveal'
import Magnetic from '../components/Magnetic'
import Picker from '../components/Picker'
import SocialIcon from '../components/SocialIcon'
import { useSendForm } from '../data/contact'
import { Elsewhere } from '../components/Buy'

/* The one page that is not panels: an open page with the heading, the form on the left and
   where else to reach him on the right.
   The form is sent by the site itself (api/contact.js) straight to the artist's inbox: no mail
   app. With a form service set in the admin it goes there instead. If the site cannot send email,
   it says so and offers the email address or Instagram. */
export default function Contact() {
  const byService = Boolean(brand.contactAction)
  const { send, state, problem, fallback, again } = useSendForm('contact')
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
              {state === 'sent' ? (
                <div className="form-sent" role="status">
                  <i aria-hidden="true">✓</i>
                  <div><strong>Message sent</strong><span>Thank you. I will write back to you by email.</span></div>
                  <button type="button" className="btn ghost sm" onClick={again}>Send another</button>
                </div>
              ) : (
                <form className="lined" onSubmit={byService ? undefined : send} action={brand.contactAction || undefined} method={byService ? 'post' : undefined}>
                  <div className="field"><input id="name" name="name" type="text" placeholder=" " required autoComplete="name" maxLength={80} /><label htmlFor="name">Your name</label><span className="bar" /></div>
                  <div className="field"><input id="email" name="email" type="email" placeholder=" " required autoComplete="email" /><label htmlFor="email">Email</label><span className="bar" /></div>
                  {contact.topics.length > 0 && <Picker label="About" name="topic" options={contact.topics} />}
                  <div className="field"><textarea id="message" name="message" placeholder=" " required rows={5} maxLength={5000} /><label htmlFor="message">Message</label><span className="bar" /></div>
                  {/* left empty by people, filled in by bots */}
                  <input className="hp-trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                  <Magnetic><button className="btn" type="submit" disabled={state === 'sending'} aria-busy={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send message'} <span className="arrow">→</span></button></Magnetic>
                  {problem && <p className="form-alt is-bad" role="alert">{problem}{fallback && <> <Elsewhere subject="A message from the website" /></>}</p>}
                </form>
              )}
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
