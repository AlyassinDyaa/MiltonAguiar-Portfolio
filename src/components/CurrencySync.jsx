import { useEffect } from 'react'
import { shop } from '../data/site'
import { CURRENCIES } from '../data/currency'
import { useAccount } from '../hooks/useAccount'

/* The currency prices are shown in (src/data/currency.js): the visitor's pick, kept in this browser
   (the cart's picker, or Account → Details, which also keeps it on the account and brings it to any
   device they log in on), at the day's rate (api/_rates.js, through /api/account?rates). It tells
   the app (onChange), which draws the whole site again in it. Draws nothing itself. */
const KEY = 'ma.currency'
let rates = null // fetched once per visit
const fetchRates = () => rates || (rates = fetch('/api/account?rates=1').then((r) => (r.ok ? r.json() : null)).then((r) => (r && r.rates) || {}).catch(() => ({})))

export const keptCurrency = () => { try { return localStorage.getItem(KEY) || '' } catch { return '' } }
/* Pick a currency ('' for the shop's own): kept in this browser, and the site redraws in it. */
export function chooseCurrency(code) {
  const c = String(code || '').toUpperCase()
  try { if (c && CURRENCIES.includes(c)) localStorage.setItem(KEY, c); else localStorage.removeItem(KEY) } catch { /* only for now */ }
  window.dispatchEvent(new Event('ma:currency'))
}

export default function CurrencySync({ onChange }) {
  const { user } = useAccount()
  // logging in (or saving Details) brings the account's currency to this browser
  useEffect(() => { if (user && user.currency !== undefined && user.currency !== keptCurrency()) chooseCurrency(user.currency) }, [user && user.currency]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let gone = false
    const apply = async () => {
      const base = String(shop.currency || 'eur').toUpperCase()
      const code = keptCurrency()
      if (!code || code === base) { onChange({ code: '', rate: 1 }); return }
      const r = await fetchRates()
      if (gone) return
      const rate = Number(r[code])
      onChange(rate > 0 ? { code, rate } : { code: '', rate: 1 })
    }
    apply()
    window.addEventListener('ma:currency', apply)
    return () => { gone = true; window.removeEventListener('ma:currency', apply) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
