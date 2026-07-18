import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signInAs, getOrg, invokeQuotesService } from '../fixtures/supabase'
import { QA_ORGS } from '../fixtures/qa-data'

// QUOTE module — server-side enforcement through the quotes-service tier (ADR-0030), asserted at
// the API layer with supabase-js (the browser can't prove the server rejected anything). Ported
// from the retired scratchpad `qa-quotes-tier.mjs`; IDs map to docs/test-catalog.md.
//
// Serialized by the global workers:1 setting — these share the Client A tenant. Each test creates
// its own uniquely-marked quote so they don't collide with each other or with leftover rows.

const tag = () => `QA-E2E-${Date.now()}-${Math.floor(Math.random() * 1e4)}`

async function shipmentCount(client: SupabaseClient, orgId: string) {
  const { count, error } = await client
    .from('shipments')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
  if (error) throw new Error(`shipment count: ${error.message}`)
  return count ?? 0
}

/** Create a draft quote via the tier and return it. */
async function createDraft(
  client: SupabaseClient,
  orgId: string,
  lineItems: { description: string; quantity: number; rate: number; sacCode?: string }[],
  extra: Record<string, unknown> = {},
) {
  const { data, error } = await invokeQuotesService(client, {
    action: 'create',
    orgId,
    mode: 'ocean',
    origin: tag(),
    destination: 'Rotterdam',
    shipperName: 'QA E2E Shipper',
    consigneeName: 'QA E2E Consignee',
    lineItems,
    ...extra,
  })
  if (error || !data) throw new Error(`create failed: ${error}`)
  return data as { id: string; ref: string; total: number; status: string }
}

test.describe('QUOTE — API enforcement (quotes-service tier)', () => {
  test('TC-QUOTE-001/002 · server recomputes total, ignores tampered client total', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const q = await createDraft(
      ownerA,
      orgA.id,
      [
        { description: 'Ocean freight', quantity: 2, rate: 100 },
        { description: 'Docs fee', sacCode: '9967', quantity: 3, rate: 50 },
      ],
      { total: 1 }, // tampered — tier must recompute 2*100 + 3*50 = 350
    )
    expect(Number(q.total), 'server-recomputed total').toBe(350)

    const { data: lines } = await ownerA
      .from('quote_line_items')
      .select('quantity, rate, amount')
      .eq('quote_id', q.id)
    expect(lines?.length).toBe(2)
    expect(lines?.every((l) => Number(l.amount) === l.quantity * l.rate)).toBe(true)

    await invokeQuotesService(ownerA, { action: 'archive', quoteId: q.id }) // cleanup
  })

  test('TC-QUOTE-003/004/006 · lifecycle send→accept, and illegal accepted→sent is rejected', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const q = await createDraft(ownerA, orgA.id, [{ description: 'freight', quantity: 1, rate: 200 }])

    const sent = await invokeQuotesService(ownerA, { action: 'send', quoteId: q.id })
    expect(sent.error).toBeNull()
    expect((sent.data as { status: string }).status).toBe('sent')

    const accepted = await invokeQuotesService(ownerA, { action: 'accept', quoteId: q.id })
    expect(accepted.error).toBeNull()
    expect((accepted.data as { status: string }).status).toBe('accepted')

    const illegal = await invokeQuotesService(ownerA, { action: 'send', quoteId: q.id })
    expect(illegal.error, 'accepted→sent must be rejected by the validation trigger').toBeTruthy()

    await invokeQuotesService(ownerA, { action: 'archive', quoteId: q.id })
  })

  test('TC-QUOTE-005/009 · reject persists reason; convert of a rejected quote is blocked', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const q = await createDraft(ownerA, orgA.id, [{ description: 'air freight', quantity: 1, rate: 500 }], {
      mode: 'air',
    })
    await invokeQuotesService(ownerA, { action: 'send', quoteId: q.id })
    const rejected = await invokeQuotesService(ownerA, {
      action: 'reject',
      quoteId: q.id,
      reason: 'Rate too high — QA E2E',
    })
    expect(rejected.error).toBeNull()
    expect((rejected.data as { status: string; rejection_reason: string }).status).toBe('rejected')
    expect((rejected.data as { rejection_reason: string }).rejection_reason).toBe('Rate too high — QA E2E')

    const conv = await invokeQuotesService(ownerA, { action: 'convert', quoteId: q.id })
    expect(conv.error, 'converting a rejected quote must be blocked by the RPC').toBeTruthy()

    await invokeQuotesService(ownerA, { action: 'archive', quoteId: q.id })
  })

  test('TC-QUOTE-007/008 · concurrent converts yield exactly one shipment (ADR-0030 race)', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const q = await createDraft(ownerA, orgA.id, [{ description: 'ocean', quantity: 1, rate: 300 }])
    await invokeQuotesService(ownerA, { action: 'send', quoteId: q.id })
    await invokeQuotesService(ownerA, { action: 'accept', quoteId: q.id })

    const before = await shipmentCount(ownerA, orgA.id)
    const [r1, r2] = await Promise.all([
      invokeQuotesService(ownerA, { action: 'convert', quoteId: q.id }),
      invokeQuotesService(ownerA, { action: 'convert', quoteId: q.id }),
    ])
    const after = await shipmentCount(ownerA, orgA.id)

    const successes = [r1, r2].filter((r) => !r.error && (r.data as { shipment?: unknown })?.shipment)
    const failures = [r1, r2].filter((r) => r.error)
    expect(successes.length, 'exactly one convert succeeds').toBe(1)
    expect(failures.length, 'the other is cleanly rejected').toBe(1)
    expect(after - before, 'exactly one shipment created').toBe(1)

    const { data: qAfter } = await ownerA
      .from('quotes')
      .select('status, converted_shipment_id')
      .eq('id', q.id)
      .single()
    expect(qAfter?.status).toBe('converted')
    expect(qAfter?.converted_shipment_id).toBeTruthy()

    await invokeQuotesService(ownerA, { action: 'archive', quoteId: q.id })
  })

  test('TC-QUOTE-010 · archive round-trips (true→false), no hard delete', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const q = await createDraft(ownerA, orgA.id, [{ description: 'freight', quantity: 1, rate: 100 }])
    const a1 = await invokeQuotesService(ownerA, { action: 'archive', quoteId: q.id })
    const a2 = await invokeQuotesService(ownerA, { action: 'archive', quoteId: q.id })
    expect((a1.data as { archived: boolean }).archived).toBe(true)
    expect((a2.data as { archived: boolean }).archived).toBe(false)
    await invokeQuotesService(ownerA, { action: 'archive', quoteId: q.id }) // leave archived
  })

  test('TC-QUOTE-011 · Org B owner cannot send/convert/create against Org A (RLS + RPC)', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const q = await createDraft(ownerA, orgA.id, [{ description: 'freight', quantity: 1, rate: 100 }])

    const ownerB = await signInAs('ownerB')
    const xSend = await invokeQuotesService(ownerB, { action: 'send', quoteId: q.id })
    expect(xSend.error, 'cross-org send blocked').toBeTruthy()
    const xConv = await invokeQuotesService(ownerB, { action: 'convert', quoteId: q.id })
    expect(xConv.error, 'cross-org convert blocked').toBeTruthy()
    const xCreate = await invokeQuotesService(ownerB, {
      action: 'create',
      orgId: orgA.id,
      mode: 'truck',
      origin: 'X',
      destination: 'Y',
      shipperName: 'Attacker',
      consigneeName: 'Attacker',
      lineItems: [{ description: 'x', quantity: 1, rate: 1 }],
    })
    expect(xCreate.error, 'cross-org create blocked').toBeTruthy()

    await invokeQuotesService(ownerA, { action: 'archive', quoteId: q.id })
  })

  test('TC-QUOTE-012 · quotes-disabled org is blocked from creating (module gate), then restored', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const platform = await signInAs('platform')

    const { data: allOrgs } = await platform.rpc('list_all_organizations')
    const row = (allOrgs as { id: string; enabled_modules: string[]; monthly_fee_inr: number }[] | null)?.find(
      (o) => o.id === orgA.id,
    )
    expect(row, 'platform admin can read Org A config').toBeTruthy()
    const original = row!.enabled_modules

    try {
      const narrowed = original.filter((m) => m !== 'quotes')
      const { error: cfgErr } = await platform.rpc('set_org_config', {
        p_org_id: orgA.id,
        p_monthly_fee_inr: row!.monthly_fee_inr,
        p_enabled_modules: narrowed,
      })
      expect(cfgErr, 'narrowing modules succeeds').toBeNull()

      const gated = await invokeQuotesService(ownerA, {
        action: 'create',
        orgId: orgA.id,
        mode: 'ocean',
        origin: 'Gated',
        destination: 'Gated',
        shipperName: 'Gated QA',
        consigneeName: 'Gated QA',
        lineItems: [{ description: 'gated', quantity: 1, rate: 1 }],
      })
      expect(gated.error, 'creating a quote in a quotes-disabled org is blocked').toBeTruthy()
    } finally {
      // Always restore — a tenant left with quotes disabled breaks every later quote spec.
      const { error: restoreErr } = await platform.rpc('set_org_config', {
        p_org_id: orgA.id,
        p_monthly_fee_inr: row!.monthly_fee_inr,
        p_enabled_modules: original,
      })
      expect(restoreErr, 'modules restored').toBeNull()
    }
  })
})
