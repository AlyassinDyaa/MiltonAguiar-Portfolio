/* The running head of a page of the comic: what the page is, a rule, and its number. */
export default function Runner({ label, page }) {
  return (
    <div className="runner">
      {label && <span>{label}</span>}
      <i aria-hidden="true" />
      {page != null && <span>Page <b>{String(page).padStart(2, '0')}</b></span>}
    </div>
  )
}
