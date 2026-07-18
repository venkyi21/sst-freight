import { test, expect } from '@playwright/test'
import { signInAs, getOrg } from '../fixtures/supabase'
import { QA_ORGS } from '../fixtures/qa-data'

// CUSTOMS module — the global HS-code reference table (ADR-0016) and org-isolation of filings.
// Duty computation is pure client logic and lives in the unit layer; full filing creation runs
// through the UI in the golden path. IDs map to docs/test-catalog.md.

test.describe('CUSTOMS — reference data & isolation', () => {
  test('TC-CUSTOMS-003 · HS codes resolve from the global reference table', async () => {
    const ownerA = await signInAs('ownerA')
    const { data, error } = await ownerA
      .from('hs_codes')
      .select('hs_code, description, basic_customs_duty_pct, igst_pct')
      .limit(5)
    expect(error).toBeNull()
    expect((data ?? []).length, 'the global hs_codes table is populated').toBeGreaterThan(0)
    expect(data![0].hs_code, 'rows carry an HS code').toBeTruthy()
  })

  test('TC-CUSTOMS-005 · Org B cannot read Org A customs filings (RLS)', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const ownerB = await signInAs('ownerB')
    const { data, error } = await ownerB.from('customs_filings').select('id').eq('org_id', orgA.id)
    expect(error).toBeNull()
    expect(data ?? [], 'RLS returns zero Org A filings to Org B').toHaveLength(0)
  })

  test('TC-CUSTOMS-002 · create a Shipping Bill (export) filing', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const { data: hs } = await ownerA.from('hs_codes').select('hs_code').limit(1).single()
    const { data, error } = await ownerA
      .from('customs_filings')
      .insert({
        org_id: orgA.id,
        ref: `SB-E2E-${tag()}`,
        filing_type: 'shipping_bill',
        goods_description: 'QA export goods',
        hs_code: hs!.hs_code,
        assessable_value_inr: 50000,
        bcd_amount_inr: 0,
        sws_amount_inr: 0,
        igst_amount_inr: 0,
        total_duty_inr: 0,
        status: 'draft',
        created_by: (await ownerA.auth.getUser()).data.user!.id,
      })
      .select('id, filing_type, status')
      .single()
    expect(error, 'shipping bill created').toBeNull()
    expect(data?.filing_type).toBe('shipping_bill')
    expect(data?.status).toBe('draft')
  })

  test('TC-CUSTOMS-004 · filing status advances draft → filed → cleared', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const { data: hs } = await ownerA.from('hs_codes').select('hs_code').limit(1).single()
    const { data: filing, error } = await ownerA
      .from('customs_filings')
      .insert({
        org_id: orgA.id,
        ref: `BOE-E2E-${tag()}`,
        filing_type: 'bill_of_entry',
        goods_description: 'QA import goods',
        hs_code: hs!.hs_code,
        assessable_value_inr: 100000,
        bcd_amount_inr: 10000,
        sws_amount_inr: 1000,
        igst_amount_inr: 19980,
        total_duty_inr: 30980,
        status: 'draft',
        created_by: (await ownerA.auth.getUser()).data.user!.id,
      })
      .select('id')
      .single()
    expect(error).toBeNull()

    for (const next of ['filed', 'cleared'] as const) {
      const { data, error: upErr } = await ownerA
        .from('customs_filings')
        .update({ status: next, ...(next === 'filed' ? { filed_at: new Date().toISOString() } : {}) })
        .eq('id', filing!.id)
        .select('status')
        .single()
      expect(upErr, `transition to ${next}`).toBeNull()
      expect(data?.status).toBe(next)
    }
  })
})

// Shared run-unique marker for the created rows above.
function tag() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e4)}`
}
