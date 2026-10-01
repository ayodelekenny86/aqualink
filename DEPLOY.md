# AquaLink — deployment guide

AquaLink is a React/Vite front end backed by Supabase Edge Functions. The
server owns order pricing and every provider secret.

## What is configured

| Component | Status |
| --- | --- |
| Supabase Edge Functions | `supabase/functions/*` serve every API endpoint |
| PostgreSQL | `supabase/migrations/20240101000000_init.sql` creates orders, config, sellers, ops, accounts, receipts, fcm_tokens |
| Paystack payments | Server-side initialize + verify + HMAC webhook |
| Google sign-in | Client-side RS256 verification, optional |
| Push notifications | Token registry on the server; the provider channel is operator-configured |
| Security headers | CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy |
| Offline mode | Runs on localStorage when Supabase is not configured |

## One-command deploy

```sh
npm install
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy fcm pricing orders payments sellers ops config
```

## Secrets to set

In the Supabase Dashboard, Settings > Edge Functions:

```
PAYSTACK_SECRET_KEY
OPS_SESSION_SECRET        # openssl rand -hex 32
OPS_BOOTSTRAP_TOKEN       # secure random string
OPS_ADMIN_EMAIL
OPS_ADMIN_PASSWORD        # 12+ characters
APP_ORIGIN                # https://your-app.vercel.app
ALLOWED_ORIGINS           # comma-separated
```

Then create the one ops account:

```sh
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/ops/bootstrap \
  -H "X-Ops-Token: YOUR_BOOTSTRAP_TOKEN"
```

Set the Paystack webhook URL in the Paystack dashboard to
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/payments/webhook`.

## Run locally

```sh
npm run demo
```

Without Supabase the app runs offline against localStorage, so the buyer,
seller and operator flows all work. Add `VITE_SUPABASE_PROJECT_REF` and
`VITE_SUPABASE_ANON_KEY` for real-time sync.

## Honest figures

Every money figure in the app is summed from real orders by `src/lib/summary.js`.
The finance panels, the ops dashboard and the downloadable report all read
from it, and an empty workspace says it has no data. Invented figures ("124
orders", "GH₵18,540 GMV", a 4.8★ seller rating, a "100% — certificates up to
date" water quality score, a GH₵3,500/month subscription) have been removed
rather than kept as sample data, because a business cannot tell invented
numbers from measured ones. The Aqua panel says it cannot forecast demand
rather than inventing a forecast.

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