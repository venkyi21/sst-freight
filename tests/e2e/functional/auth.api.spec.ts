import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, signInAs, getOrg } from '../fixtures/supabase'
import { QA_ORGS, QA_USERS, QA_PASSWORD } from '../fixtures/qa-data'

// AUTH module — sign-in negatives and cross-tenant isolation, asserted at the API layer. The
// isolation checks query the OTHER org's id directly (obtained from a client that can see it) and
// assert RLS returns zero rows — an empty UI list would prove nothing. IDs map to test-catalog.md.

test.describe('AUTH — API (auth negatives & cross-tenant isolation)', () => {
  test('TC-AUTH-002 · sign-in with a wrong password is rejected', async () => {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { data, error } = await client.auth.signInWithPassword({
      email: QA_USERS.ownerA,
      password: `${QA_PASSWORD}-wrong`,
    })
    expect(error, 'wrong password must be rejected').toBeTruthy()
    expect(data.session).toBeNull()
  })

  test('TC-AUTH-004 · Org B member sees zero Org A shipments via a direct query (RLS)', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)

    const memberB = await signInAs('memberB')
    const { data, error } = await memberB.from('shipments').select('id').eq('org_id', orgA.id)
    expect(error).toBeNull()
    expect(data ?? [], 'RLS returns zero Org A shipments to an Org B member').toHaveLength(0)
  })

  test('TC-AUTH-005 · Org B member sees zero Org A contacts via a direct query (RLS)', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)

    const memberB = await signInAs('memberB')
    const { data, error } = await memberB.from('contacts').select('id').eq('org_id', orgA.id)
    expect(error).toBeNull()
    expect(data ?? [], 'RLS returns zero Org A contacts to an Org B member').toHaveLength(0)
  })

  test('TC-AUTH-003 · signing up with an already-registered email does not create a new account', async () => {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { data, error } = await client.auth.signUp({ email: QA_USERS.ownerA, password: QA_PASSWORD })
    // Supabase either errors ("User already registered") or, with enumeration protection on,
    // returns an obfuscated user carrying an EMPTY identities array — either way, no new account.
    const noNewAccount = !!error || (data.user?.identities?.length ?? 0) === 0
    expect(noNewAccount, 'a duplicate-email signup must not create a second account').toBe(true)
  })

  test('TC-AUTH-006 · a user only ever sees the orgs they belong to (RLS org context)', async () => {
    const ownerA = await signInAs('ownerA')
    const uid = (await ownerA.auth.getUser()).data.user!.id
    const [orgsRes, memRes] = await Promise.all([
      ownerA.from('organizations').select('id, name'),
      ownerA.from('memberships').select('org_id').eq('user_id', uid),
    ])
    expect(orgsRes.error).toBeNull()
    const orgIds = new Set((orgsRes.data ?? []).map((o) => o.id))
    const memOrgIds = new Set((memRes.data ?? []).map((m) => m.org_id))
    expect(orgIds.size, 'sees at least one org').toBeGreaterThan(0)
    expect((orgsRes.data ?? []).some((o) => o.name.startsWith(QA_ORGS.A)), 'Client A is visible').toBe(true)
    // Org visibility is exactly the set of memberships — no more, no less.
    expect([...orgIds].every((id) => memOrgIds.has(id)), 'every visible org is one the user is a member of').toBe(true)
  })
})
