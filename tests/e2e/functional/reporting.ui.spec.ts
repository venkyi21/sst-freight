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

  test('TC-REPORT-006 · the invoice-ageing panel renders its buckets and honors the customize toggle', async ({ app, page }) => {
    await app.signInAndOpen('ownerA', QA_ORGS.A)
    await app.goToNav('Reporting')
    await expect(page.getByText('Invoice Ageing')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('1–30 days overdue')).toBeVisible()
    await expect(page.getByText('61+ days overdue')).toBeVisible()

    // Hide via Customize, verify it goes, then restore (shared QA tenant — leave state as found).
    await page.getByRole('button', { name: 'Customize' }).click()
    const toggle = page.getByLabel('Invoice Ageing')
    await toggle.uncheck()
    await expect(page.getByText('1–30 days overdue')).toHaveCount(0)
    await toggle.check()
    await expect(page.getByText('1–30 days overdue')).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()
  })
})
