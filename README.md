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
is optional, but Google sign-in is unusable without its one variable.

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
