import { test, expect } from '@playwright/test'
import { signInAs, getOrg } from '../fixtures/supabase'
import { QA_ORGS } from '../fixtures/qa-data'

// REF module — referral program + wallet (ADR-0036). A referral_code links a NEW org (referee) back
// to a referrer: referee gets +30d trial, a pending referral is created, only the referrer can read
// it, and self-referral is blocked. The 2-cycle reward RELEASE needs simulated Razorpay charges and
// is manual* (TC-REF-004) — the reward math is unit-covered (src/lib/referral.test.ts).

test.describe('REF — referral & wallet', () => {
  test('TC-REF-001 · signing up via a referral link links referee→referrer, extends the trial, and only the referrer can see it', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const { data: orgRow } = await ownerA.from('organizations').select('referral_code').eq('id', orgA.id).single()
    const code = (orgRow as { referral_code: string | null } | null)?.referral_code
    expect(code, 'org A has a referral code (backfilled)').toBeTruthy()

    // A DIFFERENT owner signs up through A's code → a real (non-self) referral.
    const ownerB = await signInAs('ownerB')
    const { data: newOrg, error } = await ownerB
      .rpc('create_organization', { p_name: `QA-REF-${Date.now()}`, p_color: '#334155', p_referral_code: code })
      .single()
    expect(error).toBeNull()
    const refereeOrgId = (newOrg as { id: string }).id

    // pending referral exists, and the REFERRER (A) can read it
    const { data: refs } = await ownerA.from('referrals').select('status').eq('referrer_org_id', orgA.id).eq('referee_org_id', refereeOrgId)
    expect(refs, 'a referral row exists for the referrer').toHaveLength(1)
    expect((refs as { status: string }[])[0].status).toBe('pending')

    // referee trial extended: 14 (base) + 30 (referral) ≈ 44 days out
    const { data: sub } = await ownerB.from('subscriptions').select('trial_ends_at').eq('org_id', refereeOrgId).single()
    const days = (new Date((sub as { trial_ends_at: string }).trial_ends_at).getTime() - Date.now()) / 86_400_000
    expect(days, 'referee trial extended by ~30 days').toBeGreaterThan(40)

    // RLS: the referee (B) cannot read the referral — only the referrer sees it
    const { data: refB } = await ownerB.from('referrals').select('id').eq('referee_org_id', refereeOrgId)
    expect(refB, 'the referee cannot read the referral row').toHaveLength(0)
  })

  test('TC-REF-002 · self-referral is blocked (same owner cannot refer themselves)', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const { data: orgRow } = await ownerA.from('organizations').select('referral_code').eq('id', orgA.id).single()
    const code = (orgRow as { referral_code: string }).referral_code

    // ownerA uses their OWN org's code → referrer-owner == referee-owner == ownerA
    const { data: selfOrg } = await ownerA
      .rpc('create_organization', { p_name: `QA-REF-SELF-${Date.now()}`, p_color: '#334155', p_referral_code: code })
      .single()
    const selfOrgId = (selfOrg as { id: string }).id

    const { data: selfRefs } = await ownerA.from('referrals').select('id').eq('referee_org_id', selfOrgId)
    expect(selfRefs, 'no referral is created for a self-referral').toHaveLength(0)

    // and the self-org trial is NOT extended (still ~14 days)
    const { data: sub } = await ownerA.from('subscriptions').select('trial_ends_at').eq('org_id', selfOrgId).single()
    const days = (new Date((sub as { trial_ends_at: string }).trial_ends_at).getTime() - Date.now()) / 86_400_000
    expect(days, 'self-referral gives no trial bonus').toBeLessThan(16)
  })
})
