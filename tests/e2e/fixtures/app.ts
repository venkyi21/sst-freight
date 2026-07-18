import { test as base, expect, type Page } from '@playwright/test'
import { QA_PASSWORD, QA_USERS, type QaUser } from './qa-data'

// Page-object helper shared by every functional/E2E spec (ADR-0032). It encapsulates the two flows
// every scenario starts with — email/password sign-in and org selection — plus sidebar navigation,
// so a UI change to any of them is fixed in one place rather than across dozens of specs. The
// selectors mirror the (uncommitted, now-retired) scratchpad QA scripts that verified these journeys.
export class AppHarness {
  constructor(public readonly page: Page) {}

  /** Sign in as one of the pre-provisioned QA identities and land on the org picker (or dashboard). */
  async signIn(user: QaUser) {
    const page = this.page
    await page.goto('/')
    await page.locator('input[type="email"]').fill(QA_USERS[user])
    await page.locator('input[type="password"]').fill(QA_PASSWORD)
    await page.locator('button[type="submit"]').click()
  }

  /**
   * Choose an org by name prefix. Handles both shapes: a user with several memberships sees the
   * "Select your organization" picker; a single-membership user is dropped straight into the app.
   */
  async pickOrg(namePrefix: string) {
    const page = this.page
    const picker = page.getByText('Select your organization')
    const orgButton = page.getByRole('button', { name: new RegExp(namePrefix) }).first()
    // Whichever resolves first wins: the picker heading, or (single-org) the shell's nav.
    await Promise.race([
      picker.waitFor({ timeout: 20_000 }),
      page.getByRole('button', { name: 'Dashboard', exact: true }).first().waitFor({ timeout: 20_000 }),
    ])
    if (await picker.isVisible().catch(() => false)) {
      await orgButton.click()
    }
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true }).first()).toBeVisible({
      timeout: 20_000,
    })
  }

  /** Sign in and select an org in one step — the common preamble for most specs. */
  async signInAndOpen(user: QaUser, orgNamePrefix: string) {
    await this.signIn(user)
    await this.pickOrg(orgNamePrefix)
  }

  /** Click a left-nav destination by its exact label (e.g. "Quotes", "Directory", "Accounting"). */
  async goToNav(label: string) {
    await this.page.getByRole('button', { name: label, exact: true }).first().click()
  }
}

// Extend Playwright's test with an `app` fixture + a page-error guard: any uncaught page error
// fails the test, matching the "zero uncaught page errors" assertion the scratchpad scripts made.
export const test = base.extend<{ app: AppHarness }>({
  app: async ({ page }, use) => {
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))
    await use(new AppHarness(page))
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toHaveLength(0)
  },
})

export { expect }
