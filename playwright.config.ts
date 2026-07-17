import { defineConfig, devices } from '@playwright/test'

// Committed E2E/functional layer (ADR-0032). This is deliberately NOT wired into CI — it runs
// on-demand (`npm run test:e2e`) and before every dev→main merge. Playwright boots the local Vite
// dev server, which reads `.env.local` and therefore points at the DEV Supabase project; the specs
// drive real network traffic against it, so a base URL and live QA data (docs/test-data-register.md)
// are required. Tests are serialized (workers: 1) because they share the two mutable QA tenants —
// parallel workers would race on the same rows.
const PORT = Number(process.env.E2E_PORT ?? 5174)

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
