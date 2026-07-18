import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signInAs, getOrg, invokeQuotesService } from '../fixtures/supabase'
import { QA_ORGS } from '../fixtures/qa-data'

const tag = () => `${Date.now()}-${Math.floor(Math.random() * 1e4)}`

// Create a shipment via the proven quote→convert path, then raise an INR invoice against it.
async function makeInvoice(client: SupabaseClient, orgId: string) {
  const created = await invokeQuotesService(client, {
    action: 'create', orgId, mode: 'ocean', origin: `QA-ACCT-${tag()}`, destination: 'Rotterdam',
    shipperName: 'QA ACCT', consigneeName: 'QA ACCT', lineItems: [{ description: 'x', quantity: 1, rate: 100 }],
  })
  const q = created.data as { id: string }
  await invokeQuotesService(client, { action: 'send', quoteId: q.id })
  await invokeQuotesService(client, { action: 'accept', quoteId: q.id })
  const conv = await invokeQuotesService(client, { action: 'convert', quoteId: q.id })
  const shipmentId = (conv.data as { shipment: { id: string } }).shipment.id
  const uid = (await client.auth.getUser()).data.user!.id
  const { data: inv } = await client.from('invoices').insert({
    org_id: orgId, ref: `INV-ACCT-${tag()}`, shipment_id: shipmentId, client_name: 'QA ACCT',
    currency: 'INR', fx_rate: 1, amount: 100, amount_inr: 100, status: 'unpaid', created_by: uid,
  }).select('id, fx_rate').single()
  return { quoteId: q.id, invoiceId: inv!.id }
}

// ACCT module — the GST supply-type + CGST/SGST-vs-IGST math and the aging buckets are pure logic,
// covered by the unit layer (src/lib/gst.test.ts, invoiceAging.test.ts). The invoice create→paid
// lifecycle runs through the UI in the golden path. Here we lock down what only the API can prove:
// cross-tenant isolation of invoices and costs. IDs map to docs/test-catalog.md.

test.describe('ACCT — accounting isolation', () => {
  test('TC-ACCT-007 · Org B cannot read Org A invoices or costs (RLS)', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const ownerB = await signInAs('ownerB')

    const invoices = await ownerB.from('invoices').select('id').eq('org_id', orgA.id)
    expect(invoices.error).toBeNull()
    expect(invoices.data ?? [], 'RLS returns zero Org A invoices to Org B').toHaveLength(0)

    const costs = await ownerB.from('shipment_costs').select('id').eq('org_id', orgA.id)
    expect(costs.error).toBeNull()
    expect(costs.data ?? [], 'RLS returns zero Org A costs to Org B').toHaveLength(0)
  })

  test('TC-ACCT-004 · a non-admin cannot change an invoice fx_rate (protect_invoice_fx_rate)', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const { quoteId, invoiceId } = await makeInvoice(ownerA, orgA.id)

    const memberA = await signInAs('memberA')
    const { error } = await memberA.from('invoices').update({ fx_rate: 2 }).eq('id', invoiceId)
    expect(error, 'a non-admin fx_rate change is rejected (trigger or grant)').toBeTruthy()

    const { data: after } = await ownerA.from('invoices').select('fx_rate').eq('id', invoiceId).single()
    expect(Number(after?.fx_rate), 'fx_rate unchanged').toBe(1)

    await ownerA.from('invoices').update({ archived: true }).eq('id', invoiceId)
    await ownerA.from('quotes').update({ archived: true }).eq('id', quoteId)
  })

  test('TC-ACCT-006 · the platform-revenue (FinTech-slice) ledger is org-scoped and isolated', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const ownerB = await signInAs('ownerB')
    const orgB = await getOrg(ownerB, QA_ORGS.B)

    // Org B's owner can read its own platform-revenue ledger (may be empty depending on activity).
    const own = await ownerB.rpc('list_platform_revenue', { p_org_id: orgB.id })
    expect(own.error, 'own platform-revenue ledger is readable').toBeNull()
    expect(Array.isArray(own.data), 'returns a ledger array').toBe(true)

    // A different org's owner cannot read Org B's platform revenue.
    const cross = await ownerA.rpc('list_platform_revenue', { p_org_id: orgB.id })
    const blocked = !!cross.error || ((cross.data as unknown[] | null) ?? []).length === 0
    expect(blocked, 'cross-org platform-revenue read is blocked/empty').toBe(true)
  })
})
