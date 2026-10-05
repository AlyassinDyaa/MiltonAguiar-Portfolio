import { useState } from 'react'
import { brand, gallery, gallerySections, pages } from '../data/site'
import Page from '../components/Page'
import GalleryGrid from '../components/GalleryGrid'
import ViewSwitch from '../components/ViewSwitch'
import PageTitle from '../components/PageTitle'
import Runner from '../components/Runner'
import { useGalleryView } from '../hooks/useGalleryView'

/* Every picture, in the sections made in the admin panel, each section a page of its own.
   A section with nothing in it stays hidden. */
export default function Gallery() {
  const [on, setOn] = useState('all')
  const [view, setView] = useGalleryView()
  const shown = on === 'all' ? gallerySections : gallerySections.filter((s) => s.slug === on)
  const { label, title, intro } = pages.gallery
  return (
    <Page title="Gallery">
      <PageTitle label={label} title={title} lead={intro} art={gallery[2]?.src || gallery[0]?.src}>
        <div className="filters-row">
          {gallerySections.length > 1 && (
            <div className="filters" role="group" aria-label="Show">
              <button type="button" className={`chip ${on === 'all' ? 'on' : ''}`} aria-pressed={on === 'all'} onClick={() => setOn('all')}>All</button>
              {gallerySections.map((s) => (
                <button key={s.slug} type="button" className={`chip ${on === s.slug ? 'on' : ''}`} aria-pressed={on === s.slug} onClick={() => setOn(s.slug)}>
                  {s.title}<small>{s.items.length}</small>
                </button>
              ))}
            </div>
          )}
          <div className="section-tools">
            <ViewSwitch view={view} onChange={setView} />
            {brand.instagram && <a className="btn ghost sm" href={brand.instagram} target="_blank" rel="noreferrer">More on Instagram <span className="arrow">↗</span></a>}
          </div>
        </div>
      </PageTitle>

      <section className="spread">
        <div className="container">
          {shown.map((s, i) => (
            <div className="gallery-group" key={s.slug}>
              <Runner label={`${s.items.length} ${s.items.length === 1 ? 'picture' : 'pictures'}`} page={i + 2} />
              <div className="gallery-group-head">
                <h2 className="display h-md">{s.title}</h2>
                {s.description && <p className="dim">{s.description}</p>}
              </div>
              <GalleryGrid items={s.items} view={view} />
            </div>
          ))}
          {gallerySections.length === 0 && <p className="dim">Pictures are on their way.</p>}
        </div>
      </section>
    </Page>
  )
}
