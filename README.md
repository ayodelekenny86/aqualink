# AquaLink

A water-delivery marketplace for Ghana: buyers book, sellers deliver, drivers
transport, and operators manage the network.

A single-page React app (Vite) front end backed by a Supabase Edge Functions
server. Payments go through Paystack. Accounts are local, with Google sign-in
as an optional extra.

## What it does

- **Buyers** sign in by phone or email, book a delivery, pay, and track it.
- **Sellers** apply, are approved by an operator, then accept jobs and manage
  their fleet of drivers.
- **Drivers** are auto-assigned to orders by locality, with no driver-side app.
- **Operators** approve sellers, change pricing, and review the network.
- **Institutions** run scheduled deliveries, track water quality, and plan a
  budget.

## Run it

```sh
npm install
npm run demo        # http://localhost:3000
```

Without Supabase configured the app runs fully offline against localStorage, so
the buyer, seller and operator flows all work locally. Add Supabase to turn on
real-time sync and push notifications:

```sh
cp .env.example .env
# fill in VITE_SUPABASE_PROJECT_REF and VITE_SUPABASE_ANON_KEY
```

## Deploy

The server is a set of Supabase Edge Functions under `supabase/functions/`,
with the schema in `supabase/migrations/20240101000000_init.sql`.

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy fcm pricing orders payments sellers ops config
```

Then set these secrets in the Supabase Dashboard (Settings > Edge Functions):

- `PAYSTACK_SECRET_KEY`
- `OPS_SESSION_SECRET` — `openssl rand -hex 32`
- `OPS_BOOTSTRAP_TOKEN` — a secure random string
- `OPS_ADMIN_EMAIL` / `OPS_ADMIN_PASSWORD` — first admin, password 12+ chars
- `APP_ORIGIN` — e.g. `https://your-app.vercel.app`
- `ALLOWED_ORIGINS` — comma-separated origins that may call the API

Create the first ops account:

```sh
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/ops/bootstrap \
  -H "X-Ops-Token: YOUR_BOOTSTRAP_TOKEN"
```

Set the Paystack webhook URL in the Paystack dashboard to
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/payments/webhook`.

## Honest figures

Every money figure is summed from real orders by `src/lib/summary.js`. The
finance panels, the ops dashboard and the downloadable report all read from
it, and an empty workspace says it has no data. Invented figures ("124 orders",
"GH₵18,540 GMV", a 4.8★ seller rating, a "100% — certificates up to date" water
quality score, a GH₵3,500/month subscription) have been removed rather than
kept as sample data, because a business cannot tell invented numbers from
measured ones. The Aqua panel says it cannot forecast demand rather than
inventing a forecast.

There is no escrow and no pending-payout queue. Paystack collects money
directly into the AquaLink account, so confirming delivery marks an order
delivered and records that the seller payout is handled separately by
operations.

## Reliability scoring

`src/lib/reliability.js` is a second opinion on seller performance, aimed at
the operator question "how dependable is this seller, and how long do they
usually take?". It sums completion, cancellation and on-time rates from real
orders, and it estimates a delivery window as the **median of observed
delivery windows**, expressed as a range and labelled an estimate. That
estimate is not a promise, and it is not invented: where timing is unrecorded
the panel says so plainly rather than substituting a plausible number. Timing
is recorded when an order is marked Assigned and then Delivered, so a fresh
workspace has no window to report.