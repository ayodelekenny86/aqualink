import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from 'vite-plugin-pwa';

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
  return {
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'Octocat.png', 'firebase-messaging-sw.js'],
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
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  };
})