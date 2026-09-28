# AquaLink

A water-delivery marketplace for Ghana: buyers book, sellers deliver, drivers
transport, and operators manage the network.

A single-page React app (Vite) front end backed by a Firebase Functions server.
Payments go through Paystack. Accounts are local, with Google sign-in as an
optional extra.

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

Without Firebase configured the app runs fully offline against localStorage, so
the buyer, seller and operator flows all work locally. Add Firebase to turn on
real-time sync and push notifications:

```sh
cp .env.example .env
# fill in VITE_FIREBASE_* from the Firebase console
```

## Deploy

```sh
npm --prefix functions install
firebase deploy --only functions,hosting
```

Then set the Paystack webhook URL in the Paystack dashboard to
`https://<your-domain>/api/webhooks/paystack`.

## Tests

```sh
npm run test:run
```

305 tests across 19 files, including a 22-assertion honesty suite that pins
the figures the app refuses to invent.

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

## Architecture

| Layer | File | Responsibility |
| --- | --- | --- |
| Server | `functions/index.js` | Owns order pricing and every provider secret |
| Money | `src/lib/money.js` | Client-side display quoting only |
| Summary | `src/lib/summary.js` | Single source of truth for money figures |
| Reliability | `src/lib/reliability.js` | Delivery-window estimates from real timing |
| Booking | `src/hooks/useBooking.js` | Orders, saved addresses, live driver card |
| Auth | `src/hooks/useAuth.js` | Local accounts, phone OTP, password, Google |
| Ops | `src/hooks/useSellerPerformance.js` | Seller scoring from real orders |

## License

Private.