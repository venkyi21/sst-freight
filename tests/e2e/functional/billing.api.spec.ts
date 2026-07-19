import { test, expect } from '@playwright/test'
import { signInAs, getOrg, SUPABASE_URL, SUPABASE_ANON_KEY } from '../fixtures/supabase'
import { QA_ORGS } from '../fixtures/qa-data'

// BILL module — SaaS subscription billing (ADR-0034). The soft block is a BEFORE INSERT trigger
// driven by subscription_active(); reads are never gated. IDs map to docs/test-catalog.md.
// NOTE: these require the ADR-0034 schema applied to dev and (for TC-BILL-003) the razorpay-webhook
// function deployed to dev — same "after dev apply" cadence as TC-PUBLIC-001 was for white-label.

test.describe('BILL — subscription billing', () => {
  test('TC-BILL-001 · an existing (backfilled) org is active and can create records', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)

    const { data: sub, error: subErr } = await ownerA.from('subscriptions').select('status').eq('org_id', orgA.id).maybeSingle()
    expect(subErr, 'a member can read their org subscription').toBeNull()
    expect(sub, 'the backfill/seed gave org A a subscription row').toBeTruthy()

    const { data: active, error: rpcErr } = await ownerA.rpc('subscription_active', { p_org_id: orgA.id })
    expect(rpcErr).toBeNull()
    expect(active, 'a backfilled/trialing org counts as active').toBe(true)

    // The soft-block trigger permits inserts for an active org — prove it end-to-end with a contact.
    const name = `QA-BILL-001-${Date.now()}`
    const uid = (await ownerA.auth.getUser()).data.user!.id
    const { data: contact, error: insErr } = await ownerA
      .from('contacts')
      .insert({ org_id: orgA.id, kind: 'shipper', name, created_by: uid })
      .select('id')
      .single()
    expect(insErr, 'active org can create records').toBeNull()
    await ownerA.from('contacts').update({ archived: true }).eq('id', contact!.id)
  })

  test('TC-BILL-002 · a newly created org starts a 14-day trial', async () => {
    const ownerA = await signInAs('ownerA')
    const { data: org, error } = await ownerA.rpc('create_organization', { p_name: `QA-BILL-Trial-${Date.now()}`, p_color: '#334155' })
    expect(error, 'org creation succeeds').toBeNull()
    const orgId = (org as { id: string }).id

    const { data: sub } = await ownerA.from('subscriptions').select('status, trial_ends_at').eq('org_id', orgId).single()
    expect(sub?.status, 'new org is trialing').toBe('trialing')
    const daysOut = (new Date(sub!.trial_ends_at as string).getTime() - Date.now()) / 86_400_000
    expect(daysOut, 'trial is ~14 days out').toBeGreaterThan(13)
    expect(daysOut).toBeLessThan(15)
  })

  test('TC-BILL-003 · the razorpay-webhook rejects an invalid signature', async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-webhook`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'X-Razorpay-Signature': 'deadbeef' },
      body: JSON.stringify({ event: 'subscription.charged', payload: {} }),
    })
    expect(res.status, 'a forged signature is rejected (401), not applied').toBe(401)
  })
})
