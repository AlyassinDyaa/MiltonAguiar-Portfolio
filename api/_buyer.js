import { read } from './_cart.js'
import { currentUser } from './_users.js'

/* Who is buying, for the two ways to pay (a leading underscore keeps Vercel from serving this
   file). Customer accounts are switched in the admin (Shop → Customer accounts): off, optional or
   required. With them on, the logged-in customer, so their order lands in their account; a failed
   lookup never stops a sale. With accounts required and nobody logged in, `mustLogIn` is true and
   the sale waits. */
export const accountsMode = () => {
  const mode = (read('content/pages/account.json') || {}).accounts || (read('content/site/shop.json') || {}).accounts
  return ['optional', 'required'].includes(mode) ? mode : 'off'
}

export async function buyer(req) {
  const mode = accountsMode()
  if (mode === 'off') return { user: null, mustLogIn: false }
  let user = null
  try { user = await currentUser(req) } catch (e) { console.error('account lookup:', e.message) }
  return { user, mustLogIn: mode === 'required' && !user }
}
