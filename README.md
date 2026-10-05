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
| Work | Every piece: picture, title, category, date, link to the post, a note, whether it is on the home page and in which place |
| Gallery | Sections of the gallery page and the pictures in each. A section can also fill itself from Work, so a finished piece is only uploaded once. Tick "Show on the home page" on up to 6 pictures |
| Step by step | Sets of one piece at each stage (pencils, inks, colours), or an old drawing next to its redraw: a name and a picture for each stage |
| Conventions | Events, with dates and where to find the table |
| Home page, Work and Gallery pages, Commissions page, About page, Contact page | The words on each page, one short form per page: headings, introductions, buttons. The Home page form also holds the drawing beside the name and the current project (title, cover, where to read it, and a second button, for example to the publisher); the About form holds the story, one panel at a time, each with its words and picture; the Commissions form holds open or closed, the offers and prices, where "Get a quote" goes, and the picture used in the steps |
| Name, colour and contact | Site name, tagline, brand colour, logo, email, social links, footer text |
| Show or hide | Switch whole pages, or parts of the home page, on and off |

Pictures upload straight from the panel into `public/uploads/`. A piece without a picture gets a
blank art board with its title, so the site never shows a hole.

Every piece, gallery section, set and event also has a **Hide from the site** switch, which takes it off the site
without deleting it.

### Get a quote

Every offer, price tag and quote button goes to the artist's Instagram (the Instagram link under
**Name, colour and contact**). Commissions page → *Where the quote button goes* sends them
somewhere else. With no contact email and no form service set, the request and contact forms are
replaced by a button to Instagram as well.

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

To change the passcode later, change `ADMIN_PASSCODE` on Vercel and redeploy; everyone is
logged out and uses the new one. A login lasts a week. Pictures uploaded through the admin on
Vercel can be about 3 MB at most.

Every **Save** in the admin is a commit to the branch the site was built from; Vercel rebuilds
and the change is live about a minute later. In a browser that is logged in to the admin, the
site shows anything saved since its last build straight away (`api/content.js`).

Any other static host works for the site itself: build command `npm run build`, output directory
`dist`, SPA fallback to `index.html`. On Netlify the admin can use Netlify Identity with Git
Gateway instead of the passcode (`netlify.toml` is included).
