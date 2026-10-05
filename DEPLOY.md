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
supabase functions deploy fcm pricing orders payments sellers ops config ai notifications
```

`supabase db push` and `supabase functions deploy` both need an authenticated
CLI. If `supabase projects list` reports "Access token not provided", run
`supabase login` first; the CLI prints a verification URL and waits for the code.

## Check what is actually live

`npm run verify:live` probes every hosting origin this project uses, the build
that is actually being served, and every Edge Function, so a stale deploy or a
missing deploy is reported by name instead of surfacing as a CORS error in the
browser console.

```sh
npm run verify:live
```

It checks more than "does the site answer 200", because a deployment can answer
200 and still be wrong. Four of its checks are about content rather than
availability:

| Check | What it catches |
| --- | --- |
| `the live build matches this checkout` | A deployment serving an old commit. Every build stamps its commit into `index.html` as `aqualink-build`, so a bundle from a month ago is reported as such |
| `the served bundle contains no fabricated claims` | A build from before the honesty work, still showing invented GMV, an escrow balance and a fixed persona on a live URL |
| `the served bundle is built against the server` | A build with no API origin in it, which cannot price an order or take a payment |
| `a CSP is set` | An origin serving the app with no Content-Security-Policy at all |

It also probes **every client route**, read out of the ROUTES table in
`src/lib/api.js` rather than a copy of it kept beside the checker. That copy had
drifted and was missing six of the twenty routes, and a per-function check could
not have caught a missing action anyway: `orders/create` answering 405 proves
`orders` is deployed, not that `orders/verify` exists.

It exits non-zero and lists each failure, prefixed with the host it came from. Set
`AQUALINK_SITE_URLS` to a comma-separated list to check origins beyond the two
defaults (`aqualinkgh1.vercel.app` and `viviluxy-assistant.web.app`).

Deploying to Vercel needs no extra config: `vercel.json` carries the same security
headers as `firebase.json`, plus the SPA rewrite. `scripts/verifyLive.test.js`
asserts the two header sets stay identical, because a header present on one origin
and not the other leaves that deployment unprotected while looking the same.

Three failures are expected on a fresh deployment and are fixed by the commands
below:

| Failure | Cause | Fix |
| --- | --- | --- |
| `functions/v1/ai` | The AI function was never deployed | `supabase functions deploy ai` |
| `functions/v1/notifications` | The notifications function was never deployed | `supabase functions deploy notifications` |
| `ai/chat has a usable key` | `GEMINI_API_KEY` is unset, so the function answers 503 | `supabase secrets set GEMINI_API_KEY=…` |

The last one is not cosmetic. Without the key the AI panel does not fail loudly:
`useAquaAi` falls back to the local matcher so the assistant keeps answering, and
on an undeployed server *every* answer is a local one. The panel therefore names
the reason it fell back — "not deployed", "no AI key set", or "this device could
not reach the server" — instead of showing a badge that reads like a deliberate
mode. `classifyAiFailure` in `src/lib/ai.js` is what distinguishes them, and
`src/lib/ai.test.jsx` pins each case.

Deploying the two missing functions is what removes the condition entirely:

```sh
supabase login
supabase functions deploy ai notifications
supabase secrets set GEMINI_API_KEY=your-key
npm run verify:live
```

## Finishing the current deployment

The front end is live and the pricing/config functions are deployed. These three
steps complete it:

```sh
supabase login                                              # once
supabase db push                                            # phone column on accounts
supabase secrets set GEMINI_API_KEY=your-key                # enables real Gemini answers
npm run supabase:deploy                                     # all 10 functions
npm run verify:live                                         # confirm
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
GEMINI_API_KEY            # for the AI assistant Edge Function
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

## One price rule, three copies of the arithmetic

The buyer's price is computed in three places on purpose: `src/lib/money.js`
runs in the browser, `functions/lib/pricing.js` runs on the Firebase functions,
and `supabase/functions/_lib/pricing.ts` runs on the Supabase Edge Functions that
do the actual charging. They are separate files because a modified browser must
not be able to decide what someone is charged.

They are therefore pinned against each other in
`src/lib/pricingContract.test.js`, to the pesewa. The Supabase copy was outside
that test and had already drifted — its `quotePrice` had lost the three range
guards the other two keep — so the one copy nobody tested was the one charging
money. If you change an allocation or validation rule, change it in all three and
let the test tell you which one you missed.

Price is flat per delivery and does not scale with volume. `volumeLitres` is
accepted and stored, but it is deliberately not part of the arithmetic: the rule
is "the customer pays GH¢300, inclusive of the 50% discount". Per-litre pricing
would be a change to that rule, not a bug fix.

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