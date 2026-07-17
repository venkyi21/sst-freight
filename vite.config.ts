import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// GitHub Pages project sites (username.github.io/<repo>/) need every asset
// URL prefixed with "/<repo>/". Set VITE_BASE_PATH at build time (the
// deploy workflow does this automatically) — leave it unset for local dev,
// a custom domain, or a <user>.github.io root page.
//
// `defineConfig` comes from vitest/config (a typed superset of vite's own) so the `test`
// block below type-checks — see ADR-0026 for why Vitest, and why environment: 'node'
// (pure-function tests only, no DOM needed for this scope).
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  test: {
    environment: 'node',
    // Vitest owns src/ only. The Playwright E2E/functional specs live under tests/e2e/ and are
    // run by their own runner (ADR-0032) against a live dev backend — scoping include here keeps
    // Vitest's default `**/*.spec.ts` glob from picking them up.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
