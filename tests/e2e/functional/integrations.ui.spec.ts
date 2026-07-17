import { test, expect } from '../fixtures/app'
import { QA_ORGS } from '../fixtures/qa-data'

// INTEG module — the Integrations nav is owner/admin-only (ADR-0029). Browser-level RBAC visibility,
// complementing the server-side webhook/gateway checks in integrations.api.spec.ts.
test.describe('INTEG — nav visibility by role', () => {
  test('TC-INTEG-005 · owner sees the Integrations nav; a member does not', async ({ app, page }) => {
    await app.signInAndOpen('ownerA', QA_ORGS.A)
    await expect(page.getByRole('button', { name: 'Integrations', exact: true }), 'owner sees Integrations').toBeVisible()
  })

  test('TC-INTEG-005b · a plain member does not see the Integrations nav', async ({ app, page }) => {
    await app.signInAndOpen('memberA', QA_ORGS.A)
    // Dashboard is up (a landmark that always renders), so absence of the nav is a real negative.
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Integrations', exact: true })).toHaveCount(0)
  })
})
