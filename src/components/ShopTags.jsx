import { badge, buyable, money, nowPrice, onSale, shop, soldOut } from '../data/site'

/* A card's price and its New / Sale / Sold out tag. Where each sits is set in the admin (Shop and
   payments): on the top corners of the picture, or in the caption with the title. Given a piece
   that is not for sale, only a "New" tag can show. `place` picks the half asked for: 'art' for
   what lies on the picture, 'cap' for what goes in the caption. */
export default function ShopTags({ p, place }) {
  const tag = badge(p)
  const price = buyable(p) && !soldOut(p)
  const priceUp = shop.pricePlace !== 'below'
  const tagUp = shop.tagPlace !== 'below'
  const amount = <>{onSale(p) && <s>{money(p.price, true)}</s>}{money(nowPrice(p), true)}</>
  if (place === 'art') {
    return (
      <>
        {tag && tagUp && <span className={`tag-badge is-${tag.kind}`}>{tag.text}</span>}
        {price && priceUp && <span className="tag-price">{amount}</span>}
      </>
    )
  }
  return (
    <>
      {price && !priceUp && <em className="cap-price">{amount}</em>}
      {tag && !tagUp && <span className={`tag-badge is-inline is-${tag.kind}`}>{tag.text}</span>}
    </>
  )
}
