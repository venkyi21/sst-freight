import { test, expect } from '../fixtures/app'
import { QA_ORGS } from '../fixtures/qa-data'
import { signInAs } from '../fixtures/supabase'
import type { Page } from '@playwright/test'

// Page-render smoke layer (ADR-0033). Visits every navigable screen and asserts it mounts with a
// page-unique landmark and produces zero page errors (the `app` fixture fails the test on any
// uncaught pageerror). This is a render/mount check — NOT component-behavior wiring — so it extends,
// not violates, ADR-0027's defensive-only component-test policy. Lifts the System column per module.

// [nav button label, a locator for a landmark that renders ONLY on that screen (never in the nav)].
const OWNER_SCREENS: [string, (page: Page) => ReturnType<Page['getByText']>][] = [
  ['Dashboard', (p) => p.getByText('Active Shipments')],
  ['Directory', (p) => p.getByPlaceholder('Search name, email, phone, city...')],
  ['Team', (p) => p.getByText('Joined', { exact: true })],
  ['Quotes', (p) => p.getByText('Rates & Quotes')],
  ['Accounting', (p) => p.getByText('Total Outstanding')],
  ['Customs Filings', (p) => p.getByText('HS Code', { exact: true })],
  ['Reporting', (p) => p.getByText('Volume by Mode')],
  ['Integrations', (p) => p.getByText('API Keys', { exact: true })],
  ['Settings', (p) => p.getByText('Organization Settings')],
  ['Audit Log', (p) => p.getByText('Table', { exact: true })],
]

test.describe('SMOKE — every screen mounts without errors', () => {
  test('TC-SMOKE-001 · owner screens all render with their landmark', async ({ app, page }) => {
    await app.signInAndOpen('ownerA', QA_ORGS.A)
    for (const [label, landmark] of OWNER_SCREENS) {
      await app.goToNav(label)
      await expect(landmark(page), `${label} screen renders its landmark`).toBeVisible({ timeout: 15_000 })
    }
  })

  test('TC-SMOKE-002 · platform admin screen renders for a platform admin', async ({ app, page }) => {
    // Resolve the platform user's own login-context org name out-of-band, then pick it in the UI.
    const p = await signInAs('platform')
    const { data: orgs } = await p.from('organizations').select('name').limit(1)
    const orgName = orgs?.[0]?.name ?? ''
    expect(orgName, 'platform user has a login-context org').toBeTruthy()

    await app.signInAndOpen('platform', orgName.split(' ')[0])
    await app.goToNav('Platform Admin')
    await expect(page.getByText('Organization', { exact: true }), 'platform admin screen renders').toBeVisible({
      timeout: 15_000,
    })
  })
})
