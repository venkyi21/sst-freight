import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signInAs, getOrg } from '../fixtures/supabase'
import { QA_ORGS } from '../fixtures/qa-data'

// REPORT module — the per-USER (not just per-org) RLS boundary introduced with dashboard
// preferences (ADR-0018) and the onboarding-state row (ADR-0024). IDs map to docs/test-catalog.md.

const uid = async (c: SupabaseClient) => (await c.auth.getUser()).data.user!.id

test.describe('REPORT — per-user dashboard state', () => {
  test('TC-REPORT-004 · a user upserts their own dashboard prefs; a teammate cannot read them (per-user RLS)', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const ownerUid = await uid(ownerA)

    const up = await ownerA
      .from('dashboard_preferences')
      .upsert(
        { org_id: orgA.id, user_id: ownerUid, widget_key: 'revenue_trend', visible: false },
        { onConflict: 'org_id,user_id,widget_key' },
      )
    expect(up.error, 'owner upserts their own preference').toBeNull()

    const own = await ownerA
      .from('dashboard_preferences')
      .select('visible')
      .eq('user_id', ownerUid)
      .eq('widget_key', 'revenue_trend')
      .single()
    expect(own.data?.visible).toBe(false)

    // A same-org teammate must not be able to read another user's preference row.
    const adminA = await signInAs('adminA')
    const cross = await adminA.from('dashboard_preferences').select('id').eq('user_id', ownerUid)
    expect(cross.error).toBeNull()
    expect(cross.data ?? [], "a teammate cannot read another user's dashboard prefs").toHaveLength(0)

    // Restore the widget to visible so the fixture stays neutral.
    await ownerA
      .from('dashboard_preferences')
      .upsert(
        { org_id: orgA.id, user_id: ownerUid, widget_key: 'revenue_trend', visible: true },
        { onConflict: 'org_id,user_id,widget_key' },
      )
  })

  test('TC-REPORT-005 · onboarding-state row is per-user and cross-user isolated', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const ownerUid = await uid(ownerA)

    const up = await ownerA
      .from('user_onboarding_state')
      .upsert({ org_id: orgA.id, user_id: ownerUid, dismissed: false }, { onConflict: 'org_id,user_id' })
    expect(up.error, 'owner can write their own onboarding state').toBeNull()

    const own = await ownerA.from('user_onboarding_state').select('dismissed').eq('user_id', ownerUid)
    expect(own.error).toBeNull()
    expect((own.data ?? []).length, 'owner reads their own row').toBeGreaterThan(0)

    const adminA = await signInAs('adminA')
    const cross = await adminA.from('user_onboarding_state').select('id').eq('user_id', ownerUid)
    expect(cross.error).toBeNull()
    expect(cross.data ?? [], "a teammate cannot read another user's onboarding row").toHaveLength(0)
  })
})
