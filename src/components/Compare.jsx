import { useState } from 'react'
import Poster from './Poster'

/* Step by step: two stages of the same piece on top of each other (pencils under colours, or an
   old drawing under its redraw), with a line you drag across to wipe from one to the other. A set
   with more than two stages gets a row of buttons to choose which earlier stage sits on the left;
   the right is always the last one. `year` is what a stage is called: "Pencils", "Inks", "2019".
   The dragging is a real range input laid over the pictures, so it also works with the arrow
   keys and with a screen reader. */
export default function Compare({ set }) {
  const stages = set.stages
  const now = stages[stages.length - 1]
  const older = stages.slice(0, -1)
  const [pick, setPick] = useState(older.length - 1)
  const [pos, setPos] = useState(50)
  const then = older[Math.min(pick, older.length - 1)]
  return (
    <figure className="compare" style={{ '--pos': `${pos}%` }}>
      <div className="compare-stage">
        <Poster title={set.title} src={now.src} />
        <div className="compare-then">
          <Poster title={set.title} src={then.src} rough />
        </div>
        <span className="compare-year then">{then.year}</span>
        <span className="compare-year now">{now.year}</span>
        <span className="compare-line" aria-hidden="true"><i>↔</i></span>
        <input type="range" min="0" max="100" value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label={`${set.title}: wipe between ${then.year} and ${now.year}`} />
      </div>
      <figcaption>
        <div>
          <h3 className="display h-sm">{set.title}</h3>
          {set.text && <p className="dim">{set.text}</p>}
        </div>
        {older.length > 1 && (
          <div className="compare-picks" role="group" aria-label="Compare with">
            {older.map((s, i) => <button key={s.year} type="button" className={`chip ${i === pick ? 'on' : ''}`} aria-pressed={i === pick} onClick={() => setPick(i)}>{s.year}</button>)}
            <span className="chip is-fixed">vs {now.year}</span>
          </div>
        )}
      </figcaption>
    </figure>
  )
}
