import { test, expect } from '../fixtures/app'
import { QA_ORGS } from '../fixtures/qa-data'

// BILL (UI) — the "loud trial" visibility (ADR-0034). The always-visible header badge shows only
// for trialing/past_due orgs. The QA tenants are backfilled `active`, so here we assert the badge
// is correctly HIDDEN and the wiring produces no page errors; the trialing SHOW-path is covered by
// src/lib/subscription.test.ts (shouldShowTrialBadge/subscriptionChip) + manual check on a fresh org.
test.describe('BILL — trial visibility', () => {
  test('TC-BILL-005 · an active org shows no trial badge and the dashboard renders cleanly', async ({ app, page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await app.signInAndOpen('ownerA', QA_ORGS.A)
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true }).first()).toBeVisible({ timeout: 15_000 })

    // No trial/payment nag for an active org.
    await expect(page.getByText(/Trial · \d+ day/)).toHaveCount(0)
    await expect(page.getByText('Payment due')).toHaveCount(0)
    // ...and the header's live badge is still present (proves the page mounted normally).
    await expect(page.getByText(/Live Alpha/)).toBeVisible()
    expect(errors, `no page errors: ${errors.join(' | ')}`).toHaveLength(0)
  })
})
