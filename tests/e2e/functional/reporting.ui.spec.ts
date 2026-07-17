import { test, expect } from '../fixtures/app'
import { QA_ORGS } from '../fixtures/qa-data'

// REPORT module — the reporting dashboard renders its KPI summary and charts with real org data
// (ADR-0018). Browser-level render, complementing the per-user RLS checks in reporting.api.spec.ts.
test.describe('REPORT — dashboard & charts render', () => {
  test('TC-REPORT-001/002/003 · KPI summary + charts render with real data', async ({ app, page }) => {
    await app.signInAndOpen('ownerA', QA_ORGS.A)
    await app.goToNav('Reporting')
    await expect(page.getByText('Volume by Mode')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Shipments by Status')).toBeVisible()
    await expect(page.getByText('Customer Profitability')).toBeVisible()
  })
})
