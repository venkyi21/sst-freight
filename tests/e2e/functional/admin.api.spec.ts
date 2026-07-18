import { test, expect } from '@playwright/test'
import { signInAs, getOrg } from '../fixtures/supabase'
import { QA_ORGS } from '../fixtures/qa-data'

// ADMIN module — platform-admin gating and role-escalation rejection, at the API layer (a hidden
// button proves nothing about what the RPC would reject). IDs map to docs/test-catalog.md.

test.describe('ADMIN — API (platform gating & role escalation)', () => {
  test('TC-ADMIN-002 · platform admin lists all organizations (sees Client A + B)', async () => {
    const platform = await signInAs('platform')
    const { data, error } = await platform.rpc('list_all_organizations')
    expect(error).toBeNull()
    const names = ((data as { name: string }[] | null) ?? []).map((o) => o.name)
    expect(names.some((n) => n.startsWith(QA_ORGS.A)), 'Client A visible').toBe(true)
    expect(names.some((n) => n.startsWith(QA_ORGS.B)), 'Client B visible').toBe(true)
  })

  test('TC-ADMIN-001 · a non-platform-admin owner is rejected from list_all_organizations', async () => {
    const ownerA = await signInAs('ownerA')
    const { data, error } = await ownerA.rpc('list_all_organizations')
    // The RPC is platform-admin-gated: it either errors or returns no rows for a normal owner.
    const blocked = !!error || ((data as unknown[] | null) ?? []).length === 0
    expect(blocked, 'a normal org owner must not see the platform-wide org list').toBe(true)
  })

  test('TC-ADMIN-003 · a plain member cannot self-promote to admin (direct RPC)', async () => {
    const memberA = await signInAs('memberA')
    const orgA = await getOrg(memberA, QA_ORGS.A)
    const uid = (await memberA.auth.getUser()).data.user?.id
    const { data: mine, error: mErr } = await memberA
      .from('memberships')
      .select('id, role')
      .eq('user_id', uid!)
      .eq('org_id', orgA.id)
      .single()
    expect(mErr).toBeNull()
    expect(mine?.role, 'fixture precondition: memberA is a plain member').toBe('member')

    const { error } = await memberA.rpc('update_member_role', { p_membership_id: mine!.id, p_new_role: 'admin' })
    expect(error, 'self-promotion to admin must be rejected server-side').toBeTruthy()

    // Confirm the role did not actually change.
    const { data: after } = await memberA.from('memberships').select('role').eq('id', mine!.id).single()
    expect(after?.role).toBe('member')
  })

  test('TC-ADMIN-004 · an admin cannot demote/remove the owner', async () => {
    const adminA = await signInAs('adminA')
    const orgA = await getOrg(adminA, QA_ORGS.A)
    const { data: members, error } = await adminA.rpc('list_org_members', { p_org_id: orgA.id })
    expect(error).toBeNull()
    const owner = ((members as { membership_id: string; role: string }[] | null) ?? []).find((m) => m.role === 'owner')
    expect(owner, 'owner membership found').toBeTruthy()

    const demote = await adminA.rpc('update_member_role', { p_membership_id: owner!.membership_id, p_new_role: 'member' })
    expect(demote.error, 'demoting the owner is rejected').toBeTruthy()
    const remove = await adminA.rpc('remove_member', { p_membership_id: owner!.membership_id })
    expect(remove.error, 'removing the owner is rejected').toBeTruthy()
  })

  test('TC-ADMIN-005 · platform admin can set org config', async () => {
    const platform = await signInAs('platform')
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const { data: allOrgs } = await platform.rpc('list_all_organizations')
    const row = ((allOrgs as { id: string; enabled_modules: string[]; monthly_fee_inr: number }[] | null) ?? []).find(
      (o) => o.id === orgA.id,
    )
    expect(row).toBeTruthy()
    // No-op set (same modules + fee) — proves the RPC is callable by a platform admin without
    // mutating the tenant (the narrow/restore path is exercised by TC-QUOTE-012).
    const { error } = await platform.rpc('set_org_config', {
      p_org_id: orgA.id,
      p_monthly_fee_inr: row!.monthly_fee_inr,
      p_enabled_modules: row!.enabled_modules,
    })
    expect(error, 'platform admin set_org_config succeeds').toBeNull()
  })

  test('TC-ADMIN-006 · a non-admin cannot read the audit log', async () => {
    const memberA = await signInAs('memberA')
    const orgA = await getOrg(memberA, QA_ORGS.A)
    const { data, error } = await memberA.rpc('list_audit_log', { p_org_id: orgA.id, p_table_name: null })
    const blocked = !!error || ((data as unknown[] | null) ?? []).length === 0
    expect(blocked, 'a plain member gets no audit rows (admin-only, ADR-0010)').toBe(true)
  })

  test('TC-ADMIN-007 · org branding update is owner/admin-only', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await ownerA.from('organizations').select('id, color, logo_url').ilike('name', `${QA_ORGS.A}%`).limit(1).single()
    expect(orgA.error).toBeNull()
    // Owner sets the same color back (no-op) → allowed.
    const ownerSet = await ownerA.rpc('update_org_branding', {
      p_org_id: orgA.data!.id,
      p_color: orgA.data!.color,
      p_logo_url: orgA.data!.logo_url,
    })
    expect(ownerSet.error, 'owner may update branding').toBeNull()

    // Member is rejected by the is_org_admin gate (ADR-0019).
    const memberA = await signInAs('memberA')
    const memberSet = await memberA.rpc('update_org_branding', {
      p_org_id: orgA.data!.id,
      p_color: '#000000',
      p_logo_url: null,
    })
    expect(memberSet.error, 'a member cannot update branding').toBeTruthy()
  })

  test('TC-ADMIN-008 · joining with an invalid invite code is rejected', async () => {
    // The happy-path join (a real new member) is verified manually (qa Week 3) to avoid mutating
    // the shared fixtures / needing a disposable auth user; the code-validation guard is the part
    // safely automatable here.
    const memberB = await signInAs('memberB')
    const { error } = await memberB.rpc('join_organization', { p_invite_code: 'NOT-A-REAL-CODE-XYZ' })
    expect(error, 'a garbage invite code is rejected').toBeTruthy()
  })
})
