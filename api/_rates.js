import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db, dbReady } from './_db.js'
import { CURRENCIES } from '../src/data/currency.js'

/* The day's exchange rates from the shop's currency (the European Central Bank's, through
   frankfurter.dev), for paying in the buyer's own currency (src/data/currency.js). Kept for a few
   hours in this function and for half a day in the database, so the site and the checkout use the
   same rate; if the source cannot be reached, the last rates kept (up to a week old) are used, and
   with none at all every payment is in the shop's own currency. { base, date, rates: { USD: 1.12 } } */
const shopCurrency = () => { try { return String(JSON.parse(readFileSync(join(process.cwd(), 'content/site/shop.json'), 'utf8')).currency || 'eur').toUpperCase() } catch { return 'EUR' } }
let memo = null
const FRESH = 3 * 3600e3, KEEP = 12 * 3600e3, STALE = 7 * 24 * 3600e3

export async function getRates() {
  const base = shopCurrency()
  if (memo && memo.base === base && Date.now() - memo.at < FRESH) return memo
  let stored = null
  try { if (dbReady()) stored = await (await db()).collection('meta').findOne({ _id: `rates:${base}` }) } catch { /* no database: fetch */ }
  if (stored && Date.now() - stored.at < KEEP) { memo = stored; return stored }
  try {
    const want = CURRENCIES.filter((c) => c !== base).join(',')
    const answer = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${want}`, { signal: AbortSignal.timeout(4000) })
    const said = await answer.json()
    if (!answer.ok || !said.rates) throw new Error(`rates: ${answer.status}`)
    const got = { _id: `rates:${base}`, base, date: said.date, rates: said.rates, at: Date.now() }
    memo = got
    try { if (dbReady()) await (await db()).collection('meta').updateOne({ _id: got._id }, { $set: got }, { upsert: true }) } catch { /* kept in this function only */ }
    return got
  } catch (e) {
    console.error('exchange rates not fetched:', e.message)
    if (stored && Date.now() - stored.at < STALE) { memo = stored; return stored }
    return { base, date: '', rates: {}, at: Date.now() }
  }
}
