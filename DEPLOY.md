# AquaLink — deployment guide

AquaLink is a React/Vite front end (Firebase Hosting) backed by a Firebase
Functions server. The server owns order pricing and every provider secret.

## What is configured

| Component | Status |
| --- | --- |
| Firebase Hosting + Functions | `firebase.json` rewrites `/api/*` to functions, serves the SPA |
| Paystack payments | Server-side initialize + verify + HMAC webhook |
| Google sign-in | Client-side RS256 verification, optional |
| Push notifications | Firebase Cloud Messaging via the server |
| Security headers | CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy |
| Offline mode | Runs on localStorage when Firebase is not configured |

## One-command deploy

```sh
npm install
npm --prefix functions install
firebase deploy --only functions,hosting
```

## Secrets to set

```sh
firebase functions:secrets:set PAYSTACK_SECRET_KEY
firebase functions:secrets:set OPS_BOOTSTRAP_TOKEN
firebase functions:secrets:set OPS_ADMIN_PASSWORD      # 12+ characters
firebase functions:secrets:set OPS_SESSION_SECRET      # openssl rand -hex 32
```

Then create the one ops account:

```sh
curl -X POST https://<your-domain>/api/bootstrap/ops \
  -H "X-Ops-Token: <your-token>"
```

Set the Paystack webhook URL in the Paystack dashboard to
`https://<your-domain>/api/webhooks/paystack`.

## Run locally

```sh
npm run demo
```

Without Firebase the app runs offline against localStorage, so the buyer,
seller and operator flows all work. Add `VITE_FIREBASE_*` from the Firebase
console for real-time sync and push notifications.

## Honest figures

Every money figure in the app is summed from real orders by `src/lib/summary.js`.
The finance panels, the ops dashboard and the downloadable report all read from
it, and an empty workspace says it has no data. Invented figures ("124 orders",
"GH₵18,540 GMV", a 4.8★ seller rating, a "100% — certificates up to date" water
quality score, a GH₵3,500/month subscription) have been removed rather than kept
as sample data, because a business cannot tell invented numbers from measured
ones. The Aqua panel says it cannot forecast demand rather than inventing a
forecast.

There is no escrow and no pending-payout queue. Paystack collects money directly
into the AquaLink account, so confirming delivery marks an order delivered and
records that the seller payout is handled separately by operations.

## Reliability scoring

`src/lib/reliability.js` is a second opinion on seller performance, aimed at the
operator question "how dependable is this seller, and how long do they usually
take?". It sums completion, cancellation and on-time rates from real orders, and
it estimates a delivery window as the **median of observed delivery windows**,
expressed as a range and labelled an estimate. That estimate is not a promise, and
it is not invented: where timing is unrecorded the panel says so plainly rather
than substituting a plausible number. Timing is recorded when an order is marked
Assigned and then Delivered, so a fresh workspace has no window to report.