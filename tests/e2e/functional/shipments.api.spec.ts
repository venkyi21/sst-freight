import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signInAs, getOrg, invokeQuotesService } from '../fixtures/supabase'
import { QA_ORGS } from '../fixtures/qa-data'

// SHIP module — the forward-only status machine (ADR-0004), enforced server-side. We obtain a real
// shipment via the proven quote→convert path (rather than reconstructing a full booking insert),
// then assert the RPC advances forward and a direct backward UPDATE is rejected by the trigger.
// IDs map to docs/test-catalog.md.

const tag = () => `QA-E2E-SHIP-${Date.now()}-${Math.floor(Math.random() * 1e4)}`

async function makeShipment(client: SupabaseClient, orgId: string) {
  const created = await invokeQuotesService(client, {
    action: 'create',
    orgId,
    mode: 'ocean',
    origin: tag(),
    destination: 'Rotterdam',
    shipperName: 'QA SHIP Shipper',
    consigneeName: 'QA SHIP Consignee',
    lineItems: [{ description: 'ocean', quantity: 1, rate: 100 }],
  })
  const q = created.data as { id: string }
  await invokeQuotesService(client, { action: 'send', quoteId: q.id })
  await invokeQuotesService(client, { action: 'accept', quoteId: q.id })
  const conv = await invokeQuotesService(client, { action: 'convert', quoteId: q.id })
  const shipmentId = (conv.data as { shipment: { id: string; status: string } }).shipment.id
  return { quoteId: q.id, shipmentId }
}

test.describe('SHIP — forward-only status machine', () => {
  test('TC-SHIP-004/006 · status advances forward and records history with changed_by', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const { quoteId, shipmentId } = await makeShipment(ownerA, orgA.id)

    const { data: start } = await ownerA.from('shipments').select('status').eq('id', shipmentId).single()
    expect(start?.status, 'a fresh booking starts at Booked').toBe('Booked')

    const adv = await ownerA.rpc('advance_shipment_status', { p_shipment_id: shipmentId }).single()
    expect(adv.error).toBeNull()
    expect((adv.data as { status: string }).status, 'Booked→Docs').toBe('Docs')

    const { data: history, error: hErr } = await ownerA.rpc('list_shipment_status_history', {
      p_shipment_id: shipmentId,
    })
    expect(hErr).toBeNull()
    expect((history as unknown[] | null)?.length ?? 0, 'a status-history row was recorded').toBeGreaterThan(0)
    expect((history as { changed_by_email: string }[])[0].changed_by_email, 'history attributes the actor').toBeTruthy()

    await ownerA.from('quotes').update({ archived: true }).eq('id', quoteId)
  })

  test('TC-SHIP-003 · a truck booking is created as Booked with a TRK- ref', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const created = await invokeQuotesService(ownerA, {
      action: 'create',
      orgId: orgA.id,
      mode: 'truck',
      origin: tag(),
      destination: 'Bengaluru',
      shipperName: 'QA TRUCK Shipper',
      consigneeName: 'QA TRUCK Consignee',
      lineItems: [{ description: 'trip', quantity: 1, rate: 100 }],
    })
    const q = created.data as { id: string }
    await invokeQuotesService(ownerA, { action: 'send', quoteId: q.id })
    await invokeQuotesService(ownerA, { action: 'accept', quoteId: q.id })
    const conv = await invokeQuotesService(ownerA, { action: 'convert', quoteId: q.id })
    const shipment = (conv.data as { shipment: { ref: string; status: string; mode: string } }).shipment
    expect(shipment.mode).toBe('truck')
    expect(shipment.status, 'defaults to Booked').toBe('Booked')
    expect(shipment.ref, 'truck ref prefix').toMatch(/^TRK-/)
    await ownerA.from('quotes').update({ archived: true }).eq('id', q.id)
  })

  test('TC-SHIP-007 · Org B cannot read Org A shipments (RLS)', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const ownerB = await signInAs('ownerB')
    const { data, error } = await ownerB.from('shipments').select('id').eq('org_id', orgA.id)
    expect(error).toBeNull()
    expect(data ?? [], 'RLS returns zero Org A shipments to Org B').toHaveLength(0)
  })

  test('TC-SHIP-005 · a backward status transition is rejected server-side', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const { quoteId, shipmentId } = await makeShipment(ownerA, orgA.id)

    await ownerA.rpc('advance_shipment_status', { p_shipment_id: shipmentId }).single() // → Docs
    const { error } = await ownerA.from('shipments').update({ status: 'Booked' }).eq('id', shipmentId)
    expect(error, 'a direct backward status update must be rejected by the trigger').toBeTruthy()

    const { data: after } = await ownerA.from('shipments').select('status').eq('id', shipmentId).single()
    expect(after?.status, 'status did not move backward').toBe('Docs')

    await ownerA.from('quotes').update({ archived: true }).eq('id', quoteId)
  })
})
