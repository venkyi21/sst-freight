import { test, expect } from '@playwright/test'
import { signInAs, getOrg } from '../fixtures/supabase'
import { QA_ORGS } from '../fixtures/qa-data'

// PUBLIC module — the no-auth public pages: the tracking portal (ADR-0008, query-param routing
// ADR-0009) and the TCO calculator (ADR-0023). The load-bearing property is that these create
// **no auth session** and leak nothing across shipments. These specs use the base runner (no login).

function pageErrorGuard(page: import('@playwright/test').Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

test.describe('PUBLIC — no-auth pages', () => {
  test('TC-PUBLIC-001 · a valid tracking link shows the shipment and creates no auth session', async ({ page }) => {
    // Fetch a real tracking token out-of-band (Node-side client; no browser session created).
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const { data: shipment } = await ownerA
      .from('shipments')
      .select('tracking_token, ref')
      .eq('org_id', orgA.id)
      .not('tracking_token', 'is', null)
      .limit(1)
      .single()
    expect(shipment?.tracking_token, 'a shipment with a tracking token exists').toBeTruthy()

    const errors = pageErrorGuard(page)
    await page.goto(`/?track=${shipment!.tracking_token}`)
    await expect(page.getByText(/Tracking for/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('SST Freight')).toBeVisible()
    // No login surface on a public page.
    await expect(page.locator('input[type="email"]')).toHaveCount(0)
    // No Supabase auth session persisted in the browser.
    const authKeys = await page.evaluate(() =>
      Object.keys(window.localStorage).filter((k) => k.includes('auth-token') || k.startsWith('sb-')),
    )
    expect(authKeys, 'public tracking creates no auth session').toHaveLength(0)
    expect(errors, `no page errors: ${errors.join(' | ')}`).toHaveLength(0)
  })

  test('TC-PUBLIC-002 · a bad tracking token leaks nothing', async ({ page }) => {
    await page.goto('/?track=deadbeef-not-a-real-token-000')
    await expect(page.getByText(/couldn't find a shipment/i)).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('input[type="email"]')).toHaveCount(0)
  })

  test('TC-PUBLIC-003 · the TCO calculator renders with no login', async ({ page }) => {
    const errors = pageErrorGuard(page)
    await page.goto('/?tco')
    await expect(page.getByText(/Total Cost of Ownership/)).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('input[type="email"]'), 'no login on the public TCO page').toHaveCount(0)
    expect(errors, `no page errors: ${errors.join(' | ')}`).toHaveLength(0)
  })
})
