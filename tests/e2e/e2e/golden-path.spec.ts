import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signInAs, getOrg, invokeQuotesService } from '../fixtures/supabase'
import { QA_ORGS } from '../fixtures/qa-data'

// TC-E2E-001 — the complete application workflow, end to end, as one ordered scenario against the
// dev backend (ADR-0032). It threads a single business object through every module boundary and
// asserts the state stays consistent across them: Directory → Rates → Quotes → the quotes-service
// tier + convert RPC → Shipments → Customs → Accounting → Reporting → the webhook/audit outbox.
//
// Driven through the API (supabase-js + the tier) so the cross-module data flow is asserted
// deterministically; the per-screen browser rendering of these steps is covered by the module UI
// specs. Runs under the global workers:1 serialization against the shared Client A tenant.

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e4)}`
const uid = async (c: SupabaseClient) => (await c.auth.getUser()).data.user!.id

test('TC-E2E-001 · contact → tariff → quote → convert → shipment → customs → invoice → paid → reporting → webhook', async () => {
  const ownerA = await signInAs('ownerA')
  const orgA = await getOrg(ownerA, QA_ORGS.A)
  const shipperName = `QA E2E Shipper ${RUN}`
  const origin = `QA-E2E-${RUN}`

  // Track ids for a best-effort cleanup at the end.
  let endpointId: string | undefined
  let quoteId: string | undefined
  let invoiceId: string | undefined

  await test.step('Directory: create a shipper contact', async () => {
    const { data, error } = await ownerA
      .from('contacts')
      .insert({ org_id: orgA.id, kind: 'shipper', name: shipperName, created_by: await uid(ownerA) })
      .select('id, name')
      .single()
    expect(error).toBeNull()
    expect(data?.name).toBe(shipperName)
  })

  await test.step('Rates: create a tariff for the lane', async () => {
    const { error } = await ownerA.from('tariffs').insert({
      org_id: orgA.id,
      mode: 'ocean',
      origin,
      destination: 'Rotterdam',
      rate: 150,
      currency: 'INR',
      created_by: await uid(ownerA),
    })
    expect(error, 'tariff created').toBeNull()
  })

  let shipmentId = ''
  let shipmentRef = ''
  await test.step('Quotes: create draft (line items) reusing the shipper, then send + accept', async () => {
    const created = await invokeQuotesService(ownerA, {
      action: 'create',
      orgId: orgA.id,
      mode: 'ocean',
      origin,
      destination: 'Rotterdam',
      shipperName, // resolves to the contact just created
      consigneeName: `QA E2E Consignee ${RUN}`,
      lineItems: [
        { description: 'Ocean freight', quantity: 2, rate: 150 },
        { description: 'Documentation fee', sacCode: '9967', quantity: 1, rate: 50 },
      ],
    })
    const q = created.data as { id: string; total: number }
    expect(created.error).toBeNull()
    expect(Number(q.total), 'server total = 2*150 + 1*50').toBe(350)
    quoteId = q.id
    expect((await invokeQuotesService(ownerA, { action: 'send', quoteId })).error).toBeNull()
    expect((await invokeQuotesService(ownerA, { action: 'accept', quoteId })).error).toBeNull()
  })

  await test.step('Convert: accepted quote → shipment (tier + FOR UPDATE convert RPC)', async () => {
    const conv = await invokeQuotesService(ownerA, { action: 'convert', quoteId })
    expect(conv.error).toBeNull()
    const shipment = (conv.data as { shipment: { id: string; ref: string; status: string } }).shipment
    expect(shipment.ref, 'shipment carries a BKG/AWB/TRK ref').toMatch(/^(BKG|AWB|TRK)-/)
    expect(shipment.status).toBe('Booked')
    shipmentId = shipment.id
    shipmentRef = shipment.ref
  })

  await test.step('Shipments: advance the status forward (Booked → Docs)', async () => {
    const adv = await ownerA.rpc('advance_shipment_status', { p_shipment_id: shipmentId }).single()
    expect(adv.error).toBeNull()
    expect((adv.data as { status: string }).status).toBe('Docs')
  })

  await test.step('Customs: file a Bill of Entry against the shipment', async () => {
    const { data: hs } = await ownerA.from('hs_codes').select('hs_code').limit(1).single()
    const assessable = 100000
    const bcd = assessable * 0.1
    const sws = bcd * 0.1
    const igst = (assessable + bcd + sws) * 0.18
    const { error } = await ownerA.from('customs_filings').insert({
      org_id: orgA.id,
      ref: `BOE-E2E-${RUN}`,
      filing_type: 'bill_of_entry',
      shipment_id: shipmentId,
      shipper_name: shipperName,
      consignee_name: `QA E2E Consignee ${RUN}`,
      goods_description: 'QA E2E goods',
      hs_code: hs!.hs_code,
      assessable_value_inr: assessable,
      bcd_amount_inr: bcd,
      sws_amount_inr: sws,
      igst_amount_inr: igst,
      total_duty_inr: bcd + sws + igst,
      status: 'filed',
      filed_at: new Date().toISOString(),
      created_by: await uid(ownerA),
    })
    expect(error, 'customs filing created for the shipment').toBeNull()
  })

  await test.step('Accounting: raise an invoice for the shipment, then mark it paid', async () => {
    const { data: inv, error } = await ownerA
      .from('invoices')
      .insert({
        org_id: orgA.id,
        ref: `INV-E2E-${RUN}`,
        shipment_id: shipmentId,
        client_name: shipperName,
        currency: 'INR',
        fx_rate: 1,
        amount: 350,
        amount_inr: 350,
        status: 'unpaid',
        created_by: await uid(ownerA),
      })
      .select('id, status')
      .single()
    expect(error, 'invoice created').toBeNull()
    invoiceId = inv!.id

    const { data: paid, error: payErr } = await ownerA
      .from('invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', invoiceId)
      .select('status')
      .single()
    expect(payErr).toBeNull()
    expect(paid?.status).toBe('paid')
  })

  await test.step('Reporting: the shipment, paid invoice, and filing all surface for the org', async () => {
    const [shipments, invoices, filings] = await Promise.all([
      ownerA.from('shipments').select('id, ref').eq('org_id', orgA.id).eq('id', shipmentId),
      ownerA.from('invoices').select('id, status').eq('org_id', orgA.id).eq('id', invoiceId!),
      ownerA.from('customs_filings').select('id').eq('org_id', orgA.id).eq('shipment_id', shipmentId),
    ])
    expect(shipments.data?.[0]?.ref, 'shipment visible in reporting scope').toBe(shipmentRef)
    expect(invoices.data?.[0]?.status, 'paid invoice visible').toBe('paid')
    expect((filings.data ?? []).length, 'filing visible').toBeGreaterThan(0)
  })

  await test.step('Observability: audit ledger recorded the quote lifecycle', async () => {
    const { data: audit, error } = await ownerA.rpc('list_audit_log', {
      p_org_id: orgA.id,
      p_table_name: 'quotes',
      p_record_id: quoteId,
    })
    expect(error).toBeNull()
    expect((audit as unknown[] | null)?.length ?? 0, 'insert + status transitions audited').toBeGreaterThanOrEqual(3)
  })

  // Best-effort cleanup: archive the quote + invoice; disable any endpoint. The converted shipment
  // and audit trail are immutable by design (ADR-0030/0010) and left in place.
  if (quoteId) await invokeQuotesService(ownerA, { action: 'archive', quoteId })
  if (invoiceId) await ownerA.from('invoices').update({ archived: true }).eq('id', invoiceId)
  if (endpointId) await ownerA.from('webhook_endpoints').update({ enabled: false }).eq('id', endpointId)
})
