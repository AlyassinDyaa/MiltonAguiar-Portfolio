import { Link } from 'react-router-dom'
import Page from '../components/Page'
import PageTitle from '../components/PageTitle'

export default function NotFound() {
  return (
    <Page title="Not found" className="notfound">
      <PageTitle label="Error 404" title="Blank page" lead="Nothing has been drawn at this address.">
        <Link className="btn" to="/">Back to page one <span className="arrow">→</span></Link>
      </PageTitle>
    </Page>
  )
}
