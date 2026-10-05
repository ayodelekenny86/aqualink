import { execFileSync } from "node:child_process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from 'vite-plugin-pwa';

/**
 * The commit a bundle was built from, written into `index.html` as a meta tag.
 *
 * Without it a stale deployment is indistinguishable from a current one. The
 * bundle is content-hashed, so the only way to tell is to read the page — and the
 * failure mode is silent: the app keeps working, just not the app you wrote. A
 * production URL was found serving a build from 82 commits earlier, complete with
 * the invented GMV tiles and an admin console that accepted any password, and
 * nothing in the repo reported it. `npm run verify:live` now reads this tag and
 * names the commit that is actually live.
 */
function buildStamp() {
  const stamp = { commit: 'unknown', dirty: false, builtAt: new Date().toISOString() };
  try {
    stamp.commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    // A build from a dirty tree is not reproducible from its commit, so the stamp
    // says so rather than naming a commit the deployed bytes do not match.
    stamp.dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().length > 0;
  } catch {
    // Not a git checkout (a CI tarball, a vendor copy). The tag still carries a
    // build time, so "is this newer than the deploy I made" still has an answer.
  }

  return {
    name: 'aqualink-build-stamp',
    transformIndexHtml(html) {
      const tag = [
        `<meta name="aqualink-build" content="${stamp.commit}${stamp.dirty ? '-dirty' : ''}" />`,
        `<meta name="aqualink-built" content="${stamp.builtAt}" />`,
      ].join('\n    ');
      return html.includes('</head>') ? html.replace('</head>', `    ${tag}\n  </head>`) : html;
    },
  };
}

// Where the server is reachable from the dev box. Two backends are supported:
//
//   - Supabase Edge Functions, when VITE_SUPABASE_PROJECT_REF (or
//     VITE_SUPABASE_URL) and VITE_SUPABASE_ANON_KEY are set. The client talks
//     to them directly on the absolute URL built by src/lib/api.js, so the proxy
//     below is not used and the app is identical to production.
//   - the Firebase Hosting emulator, which is what serves the `/api/*` rewrites
//     in firebase.json. Point the dev server at it and the client talks to the
//     same first-party `/api` paths it uses in production, so there is nothing to
//     reconfigure between local and deployed.
const DEFAULT_API_TARGET = "http://127.0.0.1:5000";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // loadEnv reads .env + .env.<mode> so the same values reach dev, build and
  // test. Vitest does not run Vite's env loading itself, so the test block
  // below injects them into import.meta.env — without that, the client thinks
  // no server is configured and the fetch mock is bypassed.
  const env = loadEnv(mode, process.cwd(), '');

  return {
  plugins: [
    react(),
    buildStamp(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'Octocat.png'],
      manifest: {
        name: 'AquaLink',
        short_name: 'AquaLink',
        description: 'Reliable water delivery in Ghana',
        theme_color: '#006064',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/logo192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/logo512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/accounts\.google\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'google-auth',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24,
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /^https:\/\/connect\.facebook\.net\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'facebook-sdk',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24,
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /^https:\/\/www\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-apis',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
          {
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'firebase-storage',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    open: false,
    proxy: {
      // Supabase Edge Functions, when running locally (`supabase start` serves
      // them at http://127.0.0.1:54321/functions/v1/<fn>/<action>). The client
      // builds these absolute URLs itself when VITE_SUPABASE_* is set, so this
      // entry only matters for a developer who has the local stack up but has
      // not set the env vars — it keeps the same `/functions/v1/...` paths
      // reachable from the dev server's origin.
      '/functions': {
        target: loadEnv(mode, process.cwd(), '').AQUALINK_SUPABASE_TARGET || 'http://127.0.0.1:54321',
        changeOrigin: true,
        secure: false,
      },
      // Without this, `fetch('/api/orders')` in dev hits the Vite dev server
      // itself, which answers with the SPA fallback: an HTML document where the
      // client expected JSON. Booking then failed with "returned an unreadable
      // response" and the Paystack redirect could never be initialised, so
      // payments were impossible to exercise locally.
      '/api': {
        target: loadEnv(mode, process.cwd(), '').AQUALINK_API_TARGET || DEFAULT_API_TARGET,
        changeOrigin: true,
        // Never buffer or rewrite the body. The Paystack webhook is validated
        // against the exact bytes received, and the emulator's own routing
        // already handles the path.
        secure: false,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    proxy: {
      '/functions': {
        target: process.env.AQUALINK_SUPABASE_TARGET || 'http://127.0.0.1:54321',
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: process.env.AQUALINK_API_TARGET || DEFAULT_API_TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    exclude: ['**/node_modules/**', '**/dist/**', '.kilo/**', '**/.kilo/**', 'functions/**'],
    // Signing in hashes a password with 210k PBKDF2 iterations on the main
    // thread, several times per test. That is comfortably inside vitest's 5s
    // default when a file runs alone and well outside it when the suite runs
    // every file in parallel and saturates the CPU, so sign-in tests failed
    // intermittently as a group. The budget has to cover the crypto, not just
    // the assertions.
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Vitest does not load .env files, so `import.meta.env` is empty in tests
    // and the client thinks no server is configured. Inject the configured
    // values so tests exercise the same code path as production — the fetch
    // mock then intercepts the absolute Supabase URLs instead of hitting the
    // real backend.
    define: {
      'import.meta.env.VITE_SUPABASE_PROJECT_REF': JSON.stringify(env.VITE_SUPABASE_PROJECT_REF || ''),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ''),
    },
  },
  };
})