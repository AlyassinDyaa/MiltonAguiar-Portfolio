import { useEffect, useState } from 'react'

/* The hidden place screen readers hear status messages from (data/announce.js). Emptied first and
   filled a moment later, so the same words said twice in a row are still read the second time. */
export default function Announcer() {
  const [text, setText] = useState('')
  useEffect(() => {
    let t
    const say = (e) => { setText(''); clearTimeout(t); t = setTimeout(() => setText(e.detail), 60) }
    window.addEventListener('ma:say', say)
    return () => { window.removeEventListener('ma:say', say); clearTimeout(t) }
  }, [])
  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{text}</div>
}
