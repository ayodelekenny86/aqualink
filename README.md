# GitHub Codespaces ♥️ React

Welcome to your shiny new Codespace running React! We've got everything fired up and running for you to explore React.

You've got a blank canvas to work on from a git perspective as well. There's a single initial commit with the what you're seeing right now - where you go from here is up to you!

Everything you do here is contained within this one codespace. There is no repository on GitHub yet. If and when you’re ready you can click "Publish Branch" and we’ll create your repository and push up your project. If you were just exploring then and have no further need for this code then you can simply delete your codespace and it's gone forever.

This project was bootstrapped for you with [Vite](https://vitejs.dev/).

## Available Scripts

In the project directory, you can run:

### `npm start`

We've already run this for you in the `Codespaces: server` terminal window below. If you need to stop the server for any reason you can just run `npm start` again to bring it back online.

Runs the app in the development mode.\
Open [http://localhost:3000/](http://localhost:3000/) in the built-in Simple Browser (`Cmd/Ctrl + Shift + P > Simple Browser: Show`) to view your running application.

The page will reload automatically when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

## Configuration

Copy `.env.example` to `.env` and fill in what you need. Everything in this app
is optional, but payments and Google sign-in are unusable without theirs.

### Payments (Paystack)

AquaLink takes real payments through [Paystack](https://paystack.com). This
requires a server, because the Paystack secret key must never reach a browser.
The repo now includes one, in `functions/`.

**The server owns the price of an order.** The browser sends what the customer
wants (volume, location, contact details); the server computes what it costs,
stores that, and charges that. If the browser could name the amount, a modified
client would simply book a GH₵300 order for GH₵1. `functions/lib/pricing.js` is
the authority, and the client copy in `src/lib/money.js` is display-only.

**Settlement is the server's decision, never the browser's.** After Paystack
returns the customer, the server queries Paystack and compares the result to the
stored order on reference, amount and currency. A transaction that is successful
but for a different amount, or for a different order, is refused. A client-side
"success" is not evidence of payment, and there is no code path in the app that
marks an order paid on the browser's word.

Set the secret key, then deploy:

```sh
firebase login
firebase use --add            # requires the Blaze (pay-as-you-go) plan
npm --prefix functions install
firebase functions:secrets:set PAYSTACK_SECRET_KEY
firebase deploy --only functions,hosting
```

Then set the webhook URL in the Paystack dashboard to
`https://<your-domain>/api/webhooks/paystack`. Webhooks are verified with
HMAC-SHA512 against the raw request body; an unverified webhook is an
unauthenticated instruction to mark orders paid, so it is refused outright. The
browser never calls Paystack directly — `firebase.json` proxies `/api/*` to the
functions, which keeps the functions domain out of the client.

There is **no demo or sandbox payment path**. If the server is unreachable or
unconfigured, the app says so and no order can be marked paid. An earlier
version had a demo mode whose verify step returned `settled` on a timer; that
was not a convenience, it let the app report revenue that did not exist.

### Accounts

There are **no seeded accounts and no passwords shown on screen**. The previous
version invented a buyer and an ops account on first run and printed the ops
password on the sign-in page, which published a real admin credential to anyone
who loaded the app.

- **Buyers and sellers** register from the app's own sign-up form.
- **The operations account** is created once by the `apiBootstrapOps` function
  from secrets you set in the environment. It refuses to run a second time.

```sh
firebase functions:secrets:set OPS_BOOTSTRAP_TOKEN
firebase functions:secrets:set OPS_ADMIN_PASSWORD   # 12+ characters
firebase functions:config:set  # or set OPS_ADMIN_EMAIL as a plain env var
curl -X POST https://<your-domain>/api/bootstrap/ops \
  -H "X-Ops-Token: <your-token>"
```

`OPS_SESSION_SECRET` is separate and is **required** for the operator console to
work at all. The bootstrap token creates the one ops account; the session secret
signs the short-lived tokens that prove to the server who an operator is.

```sh
firebase functions:secrets:set OPS_SESSION_SECRET   # openssl rand -hex 32
```

Without it, `POST /api/ops/login` and every protected endpoint return `503
auth_unconfigured` — they fail closed, so a misconfigured deployment exposes
nothing rather than everything.

### Operator sign-in and what it actually protects

The ops console used to check a password against `localStorage`. The server had no
idea who was calling it, so no admin action could be protected. Operators now sign
in against `POST /api/ops/login`, which verifies the scrypt hash on the server and
returns an expiring HMAC token (`functions/lib/session.js`). The token is required by:

| Endpoint | What it controls |
| --- | --- |
| `POST /api/pricing/update` | The list price, discount and surge every order is charged at |
| `POST /api/sellers/review` | Approving or rejecting a seller's application |

`GET /api/pricing` stays public: a customer needs to see the price they are about
to pay. The price that is actually *charged* is always computed server-side in
`apiCreateOrder`, so a modified browser only ever changes what is displayed, never
what is billed.

### Seller approval

Seller approval used to be self-service: the app generated an `SEL-XXXXXXXX` code
in the browser, displayed it, and then accepted it. Anyone who loaded the page could
generate a code and approve themselves, so the control was decorative.

It is now server-side. A seller submits `POST /api/sellers/apply`, polls
`GET /api/sellers/status` until it reports `approved`, and only then does the
workspace unlock. The approval itself comes from a signed-in operator through
`POST /api/sellers/review`, and every decision records who made it and when. A
second decision on the same application is rejected rather than overwriting the
first, so the audit trail keeps the original outcome.

### Pricing: the customer pays GH₵300

**The business rule: a customer pays GH₵300, inclusive of the 50% discount.** The
list price is GH₵600, discounted by 50%, and GH₵300 is the amount actually taken.

| | |
| --- | --- |
| List price | GH₵600.00 |
| Discount (50%) | −GH₵300.00 |
| **Customer pays** | **GH₵300.00** |
| Water seller (45%) | GH₵135.00 |
| Driver (15%) | GH₵45.00 |
| AquaLink (40%) | GH₵120.00 |

There is **no service charge on top**. The previous version added a 10% buyer
service charge to the discounted price, so the customer paid GH₵330 while still
being advertised 50% off — the headline price was not the price paid. It also made
the revenue split describe money that did not exist: the platform took 40% of
GH₵300 plus a further GH₵30 that was never part of any order value. The three
shares now divide the GH₵300 exactly, with nothing unaccounted for.

`buyerServiceCharge` is still a configurable field, set to `0` by default, because
it is a real pricing lever an operator may want. `src/lib/money.test.js` and
`functions/lib/payments.test.js` pin the GH₵300 figure, so raising it fails the
test suite rather than quietly charging buyers more than the advertised price.

### Honest figures

Money shown in the app is summed from real orders by `src/lib/summary.js`. The
finance panels, the ops dashboard and the downloadable report all read from it,
and an empty workspace says it has no data. Invented figures ("124 orders",
"GH₵18,540 GMV", a 4.8★ seller rating, a "100% — certificates up to date" water
quality score, a GH₵3,500/month subscription) have been removed rather than kept
as sample data, because a business cannot tell invented numbers from measured ones.
The Aqua panel says it cannot forecast demand rather than inventing a forecast.

There is no escrow and no pending-payout queue. Paystack collects money directly
into the AquaLink account, so confirming delivery marks an order delivered and
records that the seller payout is handled separately by operations.

### Google sign-in

Set `VITE_GOOGLE_CLIENT_ID` to the client id of a **Web application** OAuth
client from the Google Cloud console:

```sh
cp .env.example .env
# then set VITE_GOOGLE_CLIENT_ID in .env
```

With the variable set, the buyer and ops access gates render a "Continue with
Google" button. Without it, no button is rendered and the gate explains that
Google sign-in is not configured. That absence is deliberate: the button
enables a flow that cannot work without a client id, and it is also the surface
that decides who is allowed in, so it is not rendered speculatively.

The credential returned by Google is never trusted on arrival. It is verified in
the browser before any account is created or session started
(`src/lib/googleAuth.js`):

- the RS256 signature is checked against Google's published certificates,
  fetched from `https://www.googleapis.com/oauth2/v3/certs` and cached for one
  hour so a key rotation is picked up;
- `aud` must equal this app's client id, `iss` must be a Google issuer, and
  `exp` must be in the future;
- `email_verified` must be true, so an unproven address cannot sign in;
- the algorithm must be `RS256`, which rejects unsigned `alg: none` tokens.

Known limits, both of which need a backend to fix properly:

- **No nonce store.** The nonce is not recorded and replayed, so a captured
  token could in principle be replayed before it expires.
- **No revocation.** Signing out of Google does not end the AquaLink session,
  and a revoked Google account keeps its local session until the token expires.

Neither is fixable in a static client, so treat this as a real authentication
boundary only once a server holds the nonce and session state.

## Learn More

You can learn more in the [Vite documentation](https://vitejs.dev/guide/).

To learn Vitest, a Vite-native testing framework, go to [Vitest documentation](https://vitest.dev/guide/)

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://sambitsahoo.com/blog/vite-code-splitting-that-works.html](https://sambitsahoo.com/blog/vite-code-splitting-that-works.html)

### Analyzing the Bundle Size

This section has moved here: [https://github.com/btd/rollup-plugin-visualizer#rollup-plugin-visualizer](https://github.com/btd/rollup-plugin-visualizer#rollup-plugin-visualizer)

### Making a Progressive Web App

This section has moved here: [https://dev.to/hamdankhan364/simplifying-progressive-web-app-pwa-development-with-vite-a-beginners-guide-38cf](https://dev.to/hamdankhan364/simplifying-progressive-web-app-pwa-development-with-vite-a-beginners-guide-38cf)

### Advanced Configuration

This section has moved here: [https://vitejs.dev/guide/build.html#advanced-base-options](https://vitejs.dev/guide/build.html#advanced-base-options)

### Deployment

This section has moved here: [https://vitejs.dev/guide/build.html](https://vitejs.dev/guide/build.html)

### Troubleshooting

This section has moved here: [https://vitejs.dev/guide/troubleshooting.html](https://vitejs.dev/guide/troubleshooting.html)
