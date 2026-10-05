import { Link } from 'react-router-dom'
import { quote } from '../data/site'

/* A button that asks for a commission. It goes where quotes are given: the artist's Instagram
   (or wherever the Commissions form in the admin points). With nowhere set, it goes to the
   Commissions page instead. */
export default function QuoteLink({ className = 'btn', children, onClick }) {
  return quote.url
    ? <a className={className} href={quote.url} target="_blank" rel="noreferrer" onClick={onClick}>{children} <span className="arrow">↗</span></a>
    : <Link className={className} to="/commissions" onClick={onClick}>{children} <span className="arrow">→</span></Link>
}
