# Milton Aguiar — website

Portfolio site for comic book artist Milton Aguiar ([@miltonaguiarart](https://www.instagram.com/miltonaguiarart/)).

Built with Vite, React 19, React Router, Framer Motion and Lenis. Fonts are bundled with the site.
Content is edited through an admin panel at `/admin` (see below).

## Run it

```
npm install
npm run dev        # http://localhost:5175
npm run build      # production build in dist/
npm run preview    # serve the production build
```

## Pages

| Route | Page |
|---|---|
| `/` | Home, page by page: the name and a drawing in the title panel with four pieces beside it, the current project as a splash panel with its cover and two buttons, the latest pieces as slanted panels, step-by-step comparisons, commissions with each offer as a panel, conventions |
| `/work` | Every piece, with category filters; a piece opens large with its details |
| `/shop` | Everything for sale: the pieces with a price, with Type and Category filters, New / Sale / Sold out tags and a cart. Shown while online purchases are switched on (**Shop → Settings & payments**); until a piece has a price it says the shop opens soon |
| `/gallery` | Pictures in sections, shown uncropped. Switched off to start with, because it shows the same pieces as Work; switch it on under **Show or hide** |
| `/commissions` | What is on offer (a card each), how it works (a strip of numbered panels), and where to ask |
| `/about` | His origin story, a panel at a time; the artist file; where to find him; covers and collaborations |
| `/contact` | Contact form, email and social links, laid out as an open page. With no contact email set, the form copies the message and opens Instagram |

## Edit the content: the admin panel

The site is edited at **`/admin`** (for example `https://your-site.com/admin/`).
It is a content manager (Decap CMS) that saves every change as a commit to this repository.
The site rebuilds itself about a minute later. No code involved.

The panel is styled as the site's own backstage (`public/admin/admin.css`): the same black page, square
panels, red and type, with its fonts kept beside it in `public/admin/fonts/`. Work, Gallery and Step by
step open as picture cards; the other lists as rows. Each list remembers the view you pick for it.

| Section | What you control |
|---|---|
| Work | Every piece: picture, title, category, date, link to the post, a note, whether it is on the home page and in which place. Under **For sale**: **Sell it in the Shop**, what it is (Prints, Original art...), a tag (New, On sale, Sold out), a price and a sale price |
| Shop → Items for sale | Everything for sale, with **+ Item for sale** to add something new: picture, price, sale price, what it is, tag, category, and **Only in the Shop** (on to start with) to keep it off the Work page |
| Gallery | Sections of the gallery page and the pictures in each. A section can also fill itself from Work, so a finished piece is only uploaded once. Tick "Show on the home page" on up to 6 pictures |
| Step by step | Sets of one piece at each stage (pencils, inks, colours), or an old drawing next to its redraw: a name and a picture for each stage |
| Conventions | Events, with dates and where to find the table |
| Home page, Work and Gallery pages, Commissions page, About page, Contact page | The words on each page, one short form per page: headings, introductions, buttons. The Home page form also holds the drawing beside the name and the current project (title, cover, where to read it, and a second button, for example to the publisher); the About form holds the story, one panel at a time, each with its words and picture; the Commissions form holds open or closed, the offers and prices, where "Get a quote" goes, and the picture used in the steps |
| Name, colour and contact | Site name, tagline, brand colour, logo, email, social links, footer text |
| Shop → Categories & sizes | The lists: categories and sub categories (DC, Marvel...) the Shop is filtered by, and the print sizes items can be sold in, with their measurements |
| Shop → Settings & payments | Online purchases on or off, the Shop page's words, currency, the kinds of thing sold (each with what the buyer gets), signed pieces and their extra cost, where prices and tags sit on the cards, delivery countries, the thank-you message |
| Show or hide | Switch whole pages, dark or light mode, or parts of the home page, on and off |

Pictures upload straight from the panel into `public/uploads/`. A piece without a picture gets a
blank art board with its title, so the site never shows a hole.

Every piece, gallery section, set and event also has a **Hide from the site** switch, which takes it off the site
without deleting it.

### Get a quote

Every offer, price tag and quote button goes to the artist's Instagram (the Instagram link under
**Name, colour and contact**). Commissions page → *Where the quote button goes* sends them
somewhere else. With no contact email and no form service set, the request and contact forms are
replaced by a button to Instagram as well.

### Selling online

Everything for sale is in the admin's own **Shop** group: **Items for sale** and **Settings & payments**. **+ Item for sale** adds a new one (a print, an
original, a book): give it a picture and a price and it is on the Shop page. It stays off the Work
page unless you switch off **Only in the Shop**. A piece already under **Work** goes on sale by
switching on **Sell it in the Shop** in its *For sale* group and giving it a price; it then shows
under Shop too, and its price shows on its card on the Work page. Opening a piece shows its price and **Add to cart** /
**Buy now**. The cart (the bag in the top bar) is kept in the visitor's browser; **Checkout** opens
one Stripe payment page for everything in it, which asks for the delivery address. Stripe sends
the buyer back to `/shop?thanks=1`, which thanks them and empties the cart.

**Sizes.** A piece can be sold in several print sizes: at the bottom of its form, **Sizes and
prices** takes as many rows as you like, each a size picked from a drop-down with its own price and, for a
discount, a lower price. Buyers choose the size from a drop-down beside the piece; the card says
"From €20" and the cart and the Stripe page name the size. Without sizes, the piece's own price is used.

**Categories.** The Shop page filters by **Category**, **Sub category** (DC, Marvel...) and **Type**,
each a drop-down. The categories, sub categories and print sizes (with their measurements) are lists kept under
**Shop → Categories & sizes**: add, rename, remove or drag them into order, and switch any
category or sub category to **Hide** (it leaves the drop-downs and the cards; its pieces stay).
Each drop-down can be switched off whole under **Show or hide → Parts of the Shop page**. (The categories are
the same ones the Work page uses.)

**A second picture.** Each item can have a **Second picture** (the print framed, on a wall, a
close-up...), uploaded under the first one. On its Shop card it fades in over the first when the
card is pointed at; an opened piece starts on the first picture, with both as thumbnails to
switch between.

On its Shop card each piece is shown as the thing the buyer gets: a **printed poster** (the art
on white paper), a **framed print**, an **original art board** (cream board, blue-line border), a
**comic book** (spine, page edges, gloss), or **just the art**. Choose the look for the whole shop and
for each kind under *Settings & payments*, and override it on any item (*Shown in the shop as*).

Prices are never trusted from the browser: `api/checkout.js` reads every price, sale and
signature extra again from the content files. Nothing can be bought until `STRIPE_SECRET_KEY` is
set on Vercel (step 4 below); until then the checkout says so and points to Instagram.

### Orders and customers

At the foot of the admin's navigation, under a line, **Sales** has three screens:

- **Orders**: every purchase made through the shop, read from Stripe. Totals for the period at the
  top (sales, orders, to ship, average order); chips to narrow them by where they are up to (To
  ship, Packed, Shipped, Delivered, Cancelled, Refunded, Unfinished checkouts) with a count on each;
  a search (order number, name, email, piece, tracking number); a period and a sort; Export CSV.
  Opening an order shows what was bought (with sizes), the customer, where it goes and the
  payment, and lets you set its status, a tracking number and a private note. Those three are kept
  on the payment in Stripe (its metadata), so there is no database to look after.
- **Customers**: everyone who has bought, worked out from the orders: orders, money spent, last
  order, country; who came back, who is waiting for an order. Opening one shows their orders.

- **Discounts**: codes for money off. Make one with **+ New discount**: the code (your own, or
  a made-up one), the percentage (5% to 50% in one tap, or any number), who can use it
  (everyone, or chosen customers: picked from the customers in a drop-down, or typed as email
  addresses), when it starts, how long it lasts (24 hours, 7 days, 30 days, no end, or until a
  date) and, if you like, how many times it can be used. The list shows which codes are active,
  starting later or ended, and how often each was used; open one to change who can use it or
  when it starts, or to delete it. Buyers type the code in the cart; a code given to chosen
  customers asks for their email, and they pay with that email. The codes are kept in Stripe
  (as coupons), never in the site's files, and the checkout checks each one again before
  payment. Orders show the code used and what it took off.

All three lists come a page at a time (10, 15, 20, 50 or 100 rows, remembered in the browser).
Each order row ends in icons: **the pieces bought** (each with its picture, size, type, signed or
not, quantity, universe and category, and a link to the piece), **customer details** (a window
with their contact, every address they have had things sent to, their orders, totals and the
codes made for them) and **delete**, which always asks first in a window. Every order says how it
was paid ("Visa •••• 4242", "Apple Pay · Visa •••• 4242", "PayPal"). Deleting an order erases it
from the database, so it also leaves the buyer's account; Stripe never deletes a payment, so
Stripe keeps its own record. A discount code really is deleted. **Show or hide → Sales screens** has
a switch for each screen (test orders, test customers, test discount codes) that hides its test
data or shows it again: nothing is deleted, and real orders, customers and codes always show.

The three screens need `STRIPE_SECRET_KEY` on Vercel (step 4 below); `api/orders.js` checks the admin's login
before answering (`api/discounts.js` too; `api/discount.js` is the cart's check of a code). Refunds and receipts are done in the Stripe dashboard (each order links to it).
On this computer (`npm run dev`) the screens use a `STRIPE_SECRET_KEY` from `.env.local`, or with
none, sample orders and codes (`dev/`), labelled as such.

### Customer accounts and the membership card

Buyers can make an account (ported from the DarkBeats site): log in, make an account, a forgotten
password by email, confirming the email address, and their own page at `/account`. Switch it
under **Shop → Customer accounts**: Off (everyone buys as a guest), Optional, or Required (an
account is needed to buy). A logged-in customer gets:

- **the membership card**: a red card with their name, the year they joined, their member number
  (`#0001` for the first customer, then in sign-up order; one more than the highest number held now, so deleting the newest account frees its number) and how many pieces
  they have collected. The word in its corner is set in the admin (Collector, Member...). A
  visitor sees the card fill in with their name as they make an account;
- **their orders**, each with where it is up to (the stage and tracking number set in Sales →
  Orders; a tracking number written as a web address becomes a "Track the parcel" link). Once the
  email is confirmed, orders placed with it as a guest show too;
- **their cart on every device**, joined with what they added before logging in;
- **a heart** beside the price of every piece, to save it for later;
- **a profile picture**: their initials, one of the free pictures kept in the admin, or a piece
  they have bought (only they can use it). Each piece has **As a profile picture**, a crop to drag
  into place;
- **your note**, signed, on their page; details (name, phone, emails about new pieces) and
  security (change the password, log out every device, delete the account: its orders stay with
  the shop, unlinked).

**Rewards** (Shop → Rewards) are what customers earn. Each reward is a **profile picture**, a
**membership card design** (ink, gold foil, chrome, or a picture of your choosing), or a
**discount**, and is earned by **confirming their email**, by **a number of orders** (1, 3, 6,
10...), or by **a number of pieces collected** (refunded and deleted orders do not count). A
discount becomes a personal code the moment it is earned (one use, only with that customer's
email, for the days set on the reward), made in Stripe and listed in Sales → Discounts too.
Customers see every reward under **Rewards** in their account, with how close they are to each,
and pick their picture and card design under Details; locked ones say how to earn them.
Confirming the email gives a customer still on their initials the first picture straight away,
and confirming takes them straight to their account.

Emails (confirm your email, reset your password) come in the site's comic style. Their pictures
(the logo, the reward) are fetched from the live site, `public/email/`.

Accounts need a MongoDB database: `MONGODB_URI` on Vercel (see `.env.example`). This site shares
the cluster with DarkBeats but keeps to its own database, `miltona`, with its own database
user, so their customers and member numbers never mix. Until `MONGODB_URI` is set, accounts
stay hidden and everyone buys as a guest, whatever the switch says. Emails (the password link,
confirming the address) go through `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` (Gmail with an app
password works) or `RESEND_API_KEY` and `MAIL_FROM`; links in them use `SITE_URL`.

Card orders reach the database through Stripe's webhook: in Stripe, **Developers → Webhooks →
Add endpoint** `https://<the site>/api/stripe-webhook`, events `checkout.session.completed`,
`checkout.session.async_payment_succeeded` and `charge.refunded`; its signing secret goes on
Vercel as `STRIPE_WEBHOOK_SECRET`. PayPal orders are saved as they are paid, and with the
database set up they also show in Sales → Orders beside the Stripe ones.

Paying on this computer works as on DarkBeats: `.env.local` holds a Stripe **sandbox** key
(`sk_test_...`) and a PayPal **sandbox** app (never live keys), and Stripe's messages reach the
local webhook through the Stripe CLI:

    stripe listen --api-key <the sk_test_ key> --forward-to localhost:5175/api/stripe-webhook

(its `whsec_...` goes in `.env.local` as `STRIPE_WEBHOOK_SECRET`). Pay with Stripe's test card
4242 4242 4242 4242, any future date, any CVC. The sandbox can be shared with DarkBeats: this
site marks its own checkouts (`metadata.site = miltonaguiar`), lists and records only those, and
DarkBeats leaves them out. After paying, exactly what was bought leaves the cart (and the saved
cart of a logged-in buyer), and a logged-in buyer lands on their orders. A customer can remove
an order from their account with their password; the shop keeps its record.

On this computer, `MONGODB_URI=memory` in `.env.local` runs the accounts on a stand-in database
kept in the dev server's memory (`dev/memory-db.js`), forgotten when it restarts. With no email
service set, the emails are printed in the dev server's log instead, links included.

### The buttons under the name

Home page → **Buttons** lists the buttons under the name on the home page: the words on each,
where it goes (Shop, Work, Commissions, Get a quote on Instagram, About, Contact, Gallery, or
any web address), red or quiet, and a **Hide** switch. Drag them into order; **Add button** for
another. A button to a page that is switched off is left out by itself.

### The panels on the home page

Pieces ticked **Show on the home page** fill the panels. **Place on the home page** orders them:
1 is the tall panel beside the name, 2 and 3 the two small ones, 4 the wide one; 5 to 9 are the
panels of "Latest".

### The drawing beside the name

Home page → Drawing. A cut-out (a PNG or WebP with a see-through background) stands in the title
panel in front of a burst of the brand colour. Any other picture is laid in the panel as a sheet of
art board. The site tells the two apart by itself.

### Editing on this computer

```
npm run dev
```

Then open http://localhost:5175/admin/ and edit; changes land directly in `content/`.
(`npm run dev` also starts the small helper the panel saves through, on port 8083.)

### Editing files by hand

Everything the panel edits is plain JSON under `content/`. Editing those files and pushing
has the same effect as using the panel.

## Design

- The whole site is one comic. Every part of it is a page of panels: panels of art, and panels of solid colour (quiet, white or red) that carry the words, with a running head and a page number above each page. The first page of the home page sets the pattern and every other page follows it.
- A panel is one thing in the code: `.hp` (the frame) with `.hp-in` (what is inside), in `src/styles/components.css`. `is-loud` and `is-red` make a panel of words white or red.
- It opens **dark**: a black page whose gutters are the black itself, so nothing is outlined. The switch in the top bar changes to the light theme, where every panel is ruled in ink on white board; the visitor's choice is remembered in their browser.
- There are three colours (black, white, and one red set by a hue, `--h`, from **Name, colour and contact → Brand colour**; 25 is the red of the logo) and one family of type (Barlow Condensed for display and labels, Barlow for reading).
- Tokens for both themes are at the top of `src/styles/global.css`.
- Pictures arrive in pencil grey and are coloured in behind a line as they scroll into view (`components/Inked.jsx`).
- In front of the title panel of the Work, Commissions and About pages stands a deck of the finished pieces in Work, dealt one at a time in a random order on each visit (`components/Slides.jsx`). Each is shown whole, at its own shape, like a printed page. Whatever is added to Work joins in; a piece ticked **Pencils or work in progress** is left out.
- Buttons that ask for a commission ("Commission a piece", "Commission one like it") open the artist's Instagram, where quotes are given (`components/QuoteLink.jsx`).
- The page is never a flat colour: two glows of the red and a field of its print dots drift slowly behind everything (`body::before` and `::after` in `global.css`).
- On the Gallery page visitors can switch between four layouts: wall, grid, strip and spotlight.
- The browser icon, the icon a phone uses when the site is added to its home screen (`public/manifest.webmanifest`) and the mark in the top bar are all the logo.
- Everything respects `prefers-reduced-motion`: smooth scroll, the opening sheet and the moving band switch off.

## Deploy on Vercel (site and admin)

`vercel.json` holds the build settings and routing, so the site itself needs no setup:

1. On vercel.com: **Add New → Project**, import this GitHub repository, press **Deploy**.

The admin at `/admin/` needs two values. It logs in with **a passcode you choose**, and the site
saves changes to GitHub with **a token of its own** (the small files in `/api`). Nobody logging
in needs a GitHub account.

2. Make the token, once, with the GitHub account that owns this repository:
   **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new
   token**. Repository access: **Only select repositories** → this repository.
   Permissions → Repository permissions → **Contents: Read and write**. Generate and copy it.
3. On Vercel: project **Settings → Environment Variables**, add
   `ADMIN_PASSCODE` (the passcode: long and hard to guess, 12 characters or more) and
   `GITHUB_TOKEN` (the token from step 2), then **Deployments → Redeploy**.

4. For the shop, pick how buyers pay under **Shop → Settings & payments → How buyers pay**:
   Stripe (card, Apple Pay, Google Pay), PayPal, or Both (buyers choose at checkout). Then add
   the keys for what you picked:
   - PayPal: on developer.paypal.com, **Apps & Credentials**, make an app and copy its
     **Client ID** and **Secret** into `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. Without
     `PAYPAL_ENV` it runs in PayPal's **sandbox** (test buyers from developer.paypal.com →
     Sandbox accounts); set `PAYPAL_ENV` = `live` (with the Live app's keys) for real money.
   - Stripe: see below.
   To try either on this computer first, put the same keys in a file `.env.local` beside
   `package.json` (it is never committed) and run `npm run dev`: the shop's checkout runs
   locally against Stripe's test mode and PayPal's sandbox.
5. Stripe: in Stripe, **Developers → API keys**, copy the **Secret key** (`sk_live_...`, or
   `sk_test_...` to try it with Stripe's test cards) and add it on Vercel as `STRIPE_SECRET_KEY`,
   then redeploy. The key stays on Vercel; the browser never sees it.
6. Customer accounts: in MongoDB Atlas, on the cluster, **Database Access → Add new database
   user** (`milton-app`, with **readWrite** on the `miltona` database only), then **Connect →
   Drivers** for the address. On Vercel add `MONGODB_URI` (that address, with the user's
   password in it), `MONGODB_DB` = `miltona`, the email settings and `SITE_URL`, then the
   Stripe webhook (above), and redeploy. Every setting is listed in `.env.example`.

To change the passcode later, change `ADMIN_PASSCODE` on Vercel and redeploy; everyone is
logged out and uses the new one. A login lasts a week. Pictures uploaded through the admin on
Vercel can be about 3 MB at most.

Every **Save** in the admin is a commit to the branch the site was built from; Vercel rebuilds
and the change is live about a minute later. In a browser that is logged in to the admin, the
site shows anything saved since its last build straight away (`api/content.js`).

Any other static host works for the site itself: build command `npm run build`, output directory
`dist`, SPA fallback to `index.html`. On Netlify the admin can use Netlify Identity with Git
Gateway instead of the passcode (`netlify.toml` is included).
