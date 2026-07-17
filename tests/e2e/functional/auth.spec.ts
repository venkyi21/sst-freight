import { test, expect } from '../fixtures/app'
import { QA_ORGS } from '../fixtures/qa-data'

// AUTH module — sign-in and org context. Scenario IDs map to docs/test-catalog.md.
// Phase 1 seeds only the smoke row (TC-AUTH-001); the rest of the AUTH scenarios land in Phase 2.
test.describe('AUTH — sign-in & org context', () => {
  test('TC-AUTH-001 · happy-path · sign-in → org pick → dashboard renders', async ({ app, page }) => {
    await app.signInAndOpen('ownerA', QA_ORGS.A)
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true }).first()).toBeVisible()
  })
})
