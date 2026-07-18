import { test, expect } from '../fixtures/app'
import { QA_ORGS } from '../fixtures/qa-data'
import type { Page } from '@playwright/test'

// QUOTE module — browser journeys through the real app (the tier is exercised via the UI here;
// server enforcement is asserted separately in quotes.api.spec.ts). Ported from the retired
// scratchpad `qa-quotes-ui.mjs`. IDs map to docs/test-catalog.md.

async function openQuotesTab(page: Page) {
  await page.getByRole('button', { name: 'Quotes', exact: true }).first().click() // sidebar
  await page.getByRole('button', { name: 'Quotes', exact: true }).nth(1).click() // page tab
  await page.getByText('Show archived').waitFor({ timeout: 15_000 })
}

async function createQuote(
  page: Page,
  o: { origin: string; destination: string; qty: number; rate: number; desc: string },
) {
  await page.getByRole('button', { name: '+ New Quote' }).click()
  const modal = page.locator('form', { has: page.getByPlaceholder('Shipper name') })
  await modal.getByPlaceholder('Shipper name').fill('QA UI Shipper')
  await page.keyboard.press('Escape') // dismiss autocomplete dropdown
  await modal.getByPlaceholder('Consignee name').fill('QA UI Consignee')
  await page.keyboard.press('Escape')
  await modal.getByPlaceholder('e.g. Chennai Port (INMAA)').fill(o.origin)
  await modal.getByPlaceholder('e.g. Rotterdam (NLRTM)').fill(o.destination)
  await modal.getByPlaceholder('Freight').fill(o.desc)
  await modal.getByPlaceholder('Qty').fill(String(o.qty))
  await modal.getByPlaceholder('Rate').fill(String(o.rate))
  await modal.getByRole('button', { name: 'Save Draft' }).click()
  await modal.waitFor({ state: 'detached', timeout: 15_000 })
}

const rowFor = (page: Page, origin: string) => page.locator('tr', { hasText: origin })

test.describe('QUOTE — UI journeys', () => {
  test('TC-QUOTE-007 (UI) · create → send → accept → convert → archive', async ({ app, page }) => {
    await app.signInAndOpen('ownerA', QA_ORGS.A)
    await openQuotesTab(page)

    const origin = `QA-UI-${Date.now()}`
    await createQuote(page, { origin, destination: 'Rotterdam UI', qty: 2, rate: 150, desc: 'Ocean freight UI' })
    const row = rowFor(page, origin)
    await row.waitFor({ timeout: 15_000 })
    await expect(row, 'server-computed total ₹300 rendered').toContainText('300')

    await row.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(row.getByText('Sent', { exact: true })).toBeVisible()

    await row.getByRole('button', { name: 'Mark Accepted' }).click()
    await expect(row.getByText('Accepted', { exact: true })).toBeVisible()

    await row.getByRole('button', { name: 'Convert to Booking' }).click()
    await expect(row.getByText(/Converted — (BKG|AWB|TRK)-/), 'CONVERTED chip with live shipment ref').toBeVisible({
      timeout: 20_000,
    })

    await row.getByRole('button', { name: 'Archive', exact: true }).click()
    await row.waitFor({ state: 'detached', timeout: 15_000 })
  })

  test('TC-QUOTE-005 (UI) · create → send → reject with reason → archive', async ({ app, page }) => {
    await app.signInAndOpen('ownerA', QA_ORGS.A)
    await openQuotesTab(page)

    const origin = `QA-UI-R-${Date.now()}`
    await createQuote(page, { origin, destination: 'Singapore UI', qty: 1, rate: 420, desc: 'Air freight UI' })
    const row = rowFor(page, origin)
    await row.waitFor({ timeout: 15_000 })

    await row.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(row.getByText('Sent', { exact: true })).toBeVisible()

    await row.getByRole('button', { name: 'Mark Rejected' }).click()
    await row.getByPlaceholder('Reason (optional)').fill('Rate too high — UI QA')
    await row.getByRole('button', { name: 'Confirm' }).click()
    await expect(row.getByText('Rejected', { exact: true })).toBeVisible()
    await expect(row.getByText('Rate too high — UI QA'), 'rejection reason rendered under the chip').toBeVisible()

    await row.getByRole('button', { name: 'Archive', exact: true }).click()
    await row.waitFor({ state: 'detached', timeout: 15_000 })
  })
})
