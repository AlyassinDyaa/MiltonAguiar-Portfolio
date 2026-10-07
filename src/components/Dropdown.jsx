import { useEffect, useId, useRef, useState } from 'react'

/* A drop-down drawn by the site itself: a box showing the current choice, and a list that opens
   directly under it. Each choice is { value, label } and can carry a count (the shop's filters)
   or a note on the right (a print size's measurements, its price). A choice with a count of 0 is
   dimmed but can still be picked. Works with the mouse, a finger and the keyboard (arrows, Enter,
   Escape). */
export default function Dropdown({ label, value, options, onChange, className = '' }) {
  const id = useId()
  const box = useRef(null)
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(0)
  const current = options.find((o) => o.value === value) || options[0]

  useEffect(() => {
    if (!open) return
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  if (!current) return null
  const show = () => { setAt(Math.max(0, options.indexOf(current))); setOpen(true) }
  const choose = (o) => { onChange(o.value); setOpen(false) }
  const keys = (e) => {
    if (e.key === 'Escape' || e.key === 'Tab') return setOpen(false)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return show()
      setAt((at + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
    }
    if (open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(options[at]) }
  }

  return (
    <div ref={box} className={`dd ${open ? 'is-open' : ''} ${current.value !== options[0].value ? 'is-set' : ''} ${className}`}>
      {label && <span className="dd-label" id={`${id}-l`}>{label}</span>}
      <button type="button" className="dd-button" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${label ? `${id}-l ` : ''}${id}-v`} aria-activedescendant={open ? `${id}-${at}` : undefined} onClick={() => (open ? setOpen(false) : show())} onKeyDown={keys}>
        <span id={`${id}-v`} className="dd-value">{current.label}</span>
        {current.count != null && <small>{current.count}</small>}
        {current.aside && <em>{current.aside}</em>}
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6" /></svg>
      </button>
      {open && (
        <ul className="dd-list" role="listbox" aria-labelledby={label ? `${id}-l` : undefined} data-lenis-prevent>
          {options.map((o, i) => (
            <li key={o.value} id={`${id}-${i}`} role="option" aria-selected={o.value === current.value} className={`${i === at ? 'on' : ''} ${o.count === 0 ? 'is-empty' : ''}`} onPointerEnter={() => setAt(i)} onClick={() => choose(o)}>
              <span>{o.label}{o.note && <i>{o.note}</i>}</span>
              {o.count != null && <small>{o.count}</small>}
              {o.aside && <em>{o.aside}</em>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
