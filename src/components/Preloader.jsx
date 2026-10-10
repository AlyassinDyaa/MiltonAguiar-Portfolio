import { useEffect, useRef, useState } from 'react'
import { asset, brand, nameParts } from '../data/site'
import { useReducedMotion } from '../hooks/useMedia'

/* The opening sheet: the name goes through the three stages a comic page does. It is sketched in
   pencil (the outline drawn in from the left), inked (the outline darkens), then coloured (the fill
   painted across the letters with one slanted stroke, the first word then the red one), while
   "Pencils, Inks, Colours" are ticked off under it. Then the sheet is lifted away, with a sheet of
   ink following it. Each letter carries its own text again (data-text) for the painted layer.
   The whole sequence is plain CSS (see .preloader in components.css) and ends with the sheet
   hidden, so it cannot get stuck on screen; the timers here only tell the site when the lift
   starts and take the sheet out of the page once it is over. */
const LIFT_AT = 1350 // ms: the same moment the CSS starts the lift
const OVER_AT = 2300

export default function Preloader({ onDone }) {
  const reduced = useReducedMotion()
  const [over, setOver] = useState(false)
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })
  useEffect(() => {
    const start = setTimeout(() => done.current?.(), reduced ? 0 : LIFT_AT)
    const end = setTimeout(() => setOver(true), reduced ? 0 : OVER_AT)
    return () => { clearTimeout(start); clearTimeout(end) }
  }, [reduced])
  if (over || reduced) return null
  const [a, b] = nameParts(brand.name)
  return (
    <>
      <i className="preloader-slab" aria-hidden="true" />
      <div className="preloader" role="status" aria-label={`${brand.name} is loading`}>
        {brand.logo && <img className="preloader-logo" src={asset(brand.logo)} alt="" width="84" height="84" />}
        <div className="preloader-name" aria-hidden="true">
          <b data-text={a}>{a}</b>
          {b && <b className="is-accent" data-text={b}>{b}</b>}
        </div>
        <ol className="preloader-stages" aria-hidden="true">
          <li>Pencils</li><li>Inks</li><li>Colours</li>
        </ol>
      </div>
    </>
  )
}
