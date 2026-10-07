# Going live: every setting and every step

This is the checklist for putting the Milton Aguiar site live for real: the site, the admin,
customer accounts, emails, and payments by card (Stripe) and PayPal. Work through it top to
bottom. Every value below goes in **Vercel → the project → Settings → Environment Variables**,
and nothing takes effect until the site is **redeployed** (Deployments → the latest → Redeploy).

Never put any of these values in the code or in GitHub. On your own computer they live in
`.env.local` (ignored by git); `.env.example` lists them without values.

---

## 1. Accounts you need

| Service | What it is for | Cost |
|---|---|---|
| GitHub | The code and the content (every admin Save is a commit) | Free |
| Vercel | Hosts the site and its functions (`/api`) | Hobby is free (100 deployments a day); Pro is about $20 a month |
| MongoDB Atlas | The database: customer accounts, orders, rewards | The free cluster is enough to start |
| Stripe | Card, Apple Pay and Google Pay payments, and discount codes | A fee per sale |
| PayPal Business | PayPal payments | A fee per sale |
| Gmail (or Resend) | Sends the confirm-your-email and reset-password emails | Free |
| A domain (optional) | `miltonaguiar.com` instead of `miltonaguiar.vercel.app` | About $12 a year |

---

## 2. Every environment variable

**Required** means the part named stays switched off without it; the rest of the site still works.

### Admin (needed for /admin to log in and save)

| Name | Value | Where it comes from |
|---|---|---|
| `ADMIN_PASSCODE` | The admin password. Long and hard to guess, 12+ characters | You choose it |
| `GITHUB_TOKEN` | A GitHub token that may write to this repository | GitHub → Settings → Developer settings → Fine-grained tokens (step 3) |

### The site's address

| Name | Value | Notes |
|---|---|---|
| `SITE_URL` | `https://miltonaguiar.vercel.app` (or your domain) | Links in emails and the email pictures use it. No slash at the end |

### Customer accounts and orders (database)

| Name | Value | Where it comes from |
|---|---|---|
| `MONGODB_URI` | `mongodb+srv://milton-app:<password>@testcluster.tbbqflh.mongodb.net/?appName=TestCluster` | Atlas → Connect → Drivers, with the `milton-app` password in it |
| `MONGODB_DB` | `miltona` | The database `milton-app` is allowed to use |

### Emails (confirm your email, reset your password)

Either Gmail (simple, about 500 emails a day):

| Name | Value |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `dyaa.alyassin0@gmail.com` (the Gmail that made the app password) |
| `SMTP_PASS` | The 16-letter Gmail **app password** (not the normal Gmail password) |
| `MAIL_FROM` | `Milton Aguiar <dyaa.alyassin0@gmail.com>` |

Or Resend (for sending from your own domain, e.g. `hello@miltonaguiar.com`):

| Name | Value |
|---|---|
| `RESEND_API_KEY` | resend.com → API Keys |
| `MAIL_FROM` | `Milton Aguiar <hello@your-domain>` (a domain verified in Resend) |

Optional for both:

| Name | Value |
|---|---|
| `MAIL_REPLY_TO` | Where customers' replies go, e.g. Milton's own email |
| `MAIL_BRAND` | The name at the top of emails (the site's name when empty) |

### Card payments (Stripe)

| Name | Value | Where it comes from |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` (live) or `sk_test_...` (testing) | Stripe → Developers → API keys → Secret key |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Stripe → Developers → Webhooks → the endpoint you add (step 8) |

### PayPal

| Name | Value | Where it comes from |
|---|---|---|
| `PAYPAL_CLIENT_ID` | The app's Client ID | developer.paypal.com → Apps & Credentials → **Live** → your app |
| `PAYPAL_CLIENT_SECRET` | The app's Secret | Same place |
| `PAYPAL_ENV` | `live` | Leave it out while testing (PayPal then runs in its sandbox) |

### Set by Vercel itself (do not add these)

`VERCEL`, `VERCEL_GIT_REPO_OWNER`, `VERCEL_GIT_REPO_SLUG`, `VERCEL_GIT_COMMIT_REF`,
`VERCEL_GIT_COMMIT_SHA`, `VERCEL_PROJECT_PRODUCTION_URL`.

### Copy-paste list for Vercel (fill in the blanks)

```
ADMIN_PASSCODE=
GITHUB_TOKEN=
SITE_URL=https://miltonaguiar.vercel.app
MONGODB_URI=mongodb+srv://milton-app:<password>@testcluster.tbbqflh.mongodb.net/?appName=TestCluster
MONGODB_DB=miltona
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=dyaa.alyassin0@gmail.com
SMTP_PASS=
MAIL_FROM=Milton Aguiar <dyaa.alyassin0@gmail.com>
MAIL_REPLY_TO=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENV=live
```

Tip: Vercel lets each variable have a different value for **Production** and **Preview**. Put the
live keys on Production and the test keys (Stripe `sk_test_`, PayPal sandbox, no `PAYPAL_ENV`) on
Preview, so test deployments never take real money.

---

## 3. The steps, in order

### Step 1. The Vercel project
1. vercel.com → **Add New → Project** → import `AlyassinDyaa/MiltonAguiar-Portfolio` → **Deploy**.
   (Already done: the site is at miltonaguiar.vercel.app.)
2. The free Hobby plan allows 100 deployments a day, and every admin Save is one. If the admin is
   used a lot, move to Pro.

### Step 2. The admin password
1. Choose a long passcode and add it as `ADMIN_PASSCODE`.

### Step 3. The GitHub token (so the admin can save)
1. GitHub, logged in as the owner of the repository: **Settings → Developer settings → Personal
   access tokens → Fine-grained tokens → Generate new token**.
2. Repository access: **Only select repositories** → `MiltonAguiar-Portfolio`.
3. Permissions → Repository permissions → **Contents: Read and write**.
4. Generate, copy, add as `GITHUB_TOKEN`.

### Step 4. The database (MongoDB Atlas)
1. Atlas → **Database Access** → user `milton-app` → **Edit**:
   - privileges: **readWrite** on the database `miltona` (only that one);
   - **Edit Password** → **Autogenerate** → copy it (it is shown once).
2. Atlas → **Network Access** → **Add IP Address** → **Allow access from anywhere**
   (`0.0.0.0/0`). Vercel's servers have no fixed address, so without this the live site cannot
   reach the database. The password still protects it.
3. Atlas → the cluster → **Connect → Drivers** → copy the address, put the password in place of
   `<password>`, add it as `MONGODB_URI`. Add `MONGODB_DB` = `miltona`.

### Step 5. Emails
1. Gmail: the Google account `dyaa.alyassin0@gmail.com` needs **2-Step Verification** on.
2. Go to **myaccount.google.com/apppasswords** → name it `Milton site` → **Create** → copy the
   16 letters → add as `SMTP_PASS`, with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `MAIL_FROM`
   as listed above.
3. The app password used while building was shared in a chat: **revoke it and make a new one**
   for the live site.
4. Later, to send from your own domain: make a Resend account, verify the domain, add
   `RESEND_API_KEY` and change `MAIL_FROM` (remove the `SMTP_` ones).

### Step 6. The site's address
1. Add `SITE_URL` = `https://miltonaguiar.vercel.app` (or the domain from step 11).

### Step 7. Stripe, live
1. Stripe dashboard → **Activate payments**: business details, identity, the bank account payouts
   go to. Until this is done, live keys do not work.
2. Turn off **Test mode** (top right) → **Developers → API keys** → reveal the **Secret key**
   (`sk_live_...`) → add as `STRIPE_SECRET_KEY`.

### Step 8. Stripe's webhook (so card orders reach the database and customers' accounts)
1. Stripe (live mode) → **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://miltonaguiar.vercel.app/api/stripe-webhook` (your `SITE_URL` +
   `/api/stripe-webhook`).
3. Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `charge.refunded`.
4. Save → **Reveal** the signing secret (`whsec_...`) → add as `STRIPE_WEBHOOK_SECRET`.

### Step 9. PayPal, live
1. A **PayPal Business** account.
2. developer.paypal.com → **Apps & Credentials** → switch to **Live** → **Create App** → copy
   the **Client ID** and **Secret** → add as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
3. Add `PAYPAL_ENV` = `live`.

### Step 10. Redeploy
1. Vercel → **Deployments** → the latest → **⋯ → Redeploy**. Every change to the variables
   needs this.

### Step 11 (optional). Your own domain
1. Vercel → the project → **Settings → Domains** → add the domain, and follow its DNS steps at
   the place you bought it.
2. Then change `SITE_URL` to the domain, change the Stripe webhook URL (step 8) to the domain,
   and redeploy. PayPal needs nothing: it returns to whatever address the buyer came from.

---

## 4. In the admin (yoursite/admin), before opening the shop

1. **Shop → Settings & payments**: Online purchases **on**; How buyers pay (Stripe, PayPal or
   Both); currency; the countries you post to; delivery address on.
2. **Shop → Customer accounts**: Optional (buyers may make an account) or Required.
3. **Shop → Rewards**: check the rewards, their milestones and discounts.
4. **Shop → Items for sale**: every piece with its sizes and prices.
5. **Site → Show / hide → Sales screens**: switch the three test-data switches **off**, so the
   Sales screens show only real sales.
6. **Site → Name, colour and contact**: the contact email and links are right.

---

## 5. Check it works (on the live site)

- [ ] `/admin` logs in with the passcode; a small change saves and shows on the site a minute later.
- [ ] Make an account → the confirmation email arrives (check spam) → the link opens your account
      with the reward unlocked.
- [ ] **Forgot your password** → the email arrives → a new password works.
- [ ] Buy something small by card → back on the site, the thank-you → the order is in
      **Sales → Orders** and in the buyer's account (if logged in).
- [ ] Stripe → Developers → Webhooks → the endpoint shows the event delivered (200).
- [ ] Buy something with PayPal → the order shows in Sales → Orders.
- [ ] In the admin, mark the test order **Shipped** with a tracking number → the buyer's account
      shows it.
- [ ] Refund the test purchases (in Stripe and in PayPal), then delete the orders in Sales → Orders.

---

## 6. Keep safe

- Live keys only on Vercel (Production). Test keys only in `.env.local` and Vercel Preview.
- If a key or password is ever shared (a chat, a screenshot), make a new one and replace it.
- Changing `ADMIN_PASSCODE` or `GITHUB_TOKEN` logs everyone out of the admin.
- The Stripe sandbox is shared with DarkBeats while testing: each site only lists its own orders.
