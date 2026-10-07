import { shop } from '../data/site'

/* The shop's cart icon: a shopping bag or a shopping cart, whichever the admin picked (Shop →
   Settings & payments → Cart button icon). Used by the button in the top bar and the add-to-cart
   buttons, so they always match. */
const BAG = 'M5 8.5h14l-1.1 11.6a1.2 1.2 0 0 1-1.2 1.1H7.3a1.2 1.2 0 0 1-1.2-1.1z M9 10.5V7a3 3 0 0 1 6 0v3.5'
const TROLLEY = 'M2.5 4h2.6l2.3 10.6a1.2 1.2 0 0 0 1.2.9h8.6a1.2 1.2 0 0 0 1.2-.9L20.5 8H6 M9.5 18.1a1.4 1.4 0 1 0 0 2.800 1.4 1.4 0 0 0 0-2.800z M17 18.1a1.4 1.4 0 1 0 0 2.800 1.4 1.4 0 0 0 0-2.800z'

export default function CartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={shop.cartIcon === 'cart' ? TROLLEY : BAG} /></svg>
}
