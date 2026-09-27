import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    open: false,
  },
  preview: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    // Agent Manager keeps a copy of the app under .kilo/worktrees. Without this
    // exclude, vitest discovers and runs that duplicate suite as well.
    exclude: ['**/node_modules/**', '**/dist/**', '.kilo/**', '**/.kilo/**'],
  },
})
