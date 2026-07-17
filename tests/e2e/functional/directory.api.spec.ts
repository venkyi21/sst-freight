import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signInAs, getOrg, invokeQuotesService } from '../fixtures/supabase'
import { QA_ORGS } from '../fixtures/qa-data'

// DIR module — Directory (Contacts) is plain RLS-gated CRUD, never module-gated (ADR-0012). IDs
// map to docs/test-catalog.md. Created rows are archived at the end (contacts soft-archive).

const tag = () => `QA-E2E-DIR-${Date.now()}-${Math.floor(Math.random() * 1e4)}`

async function uid(client: SupabaseClient) {
  return (await client.auth.getUser()).data.user!.id
}

test.describe('DIR — Directory (Contacts)', () => {
  test('TC-DIR-001 · create a shipper contact', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const name = tag()
    const { data, error } = await ownerA
      .from('contacts')
      .insert({ org_id: orgA.id, kind: 'shipper', name, created_by: await uid(ownerA) })
      .select('id, name, kind')
      .single()
    expect(error).toBeNull()
    expect(data?.kind).toBe('shipper')
    expect(data?.name).toBe(name)
    await ownerA.from('contacts').update({ archived: true }).eq('id', data!.id)
  })

  test('TC-DIR-002 · a vendor contact without vendor_type is rejected by the check constraint', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const { data, error } = await ownerA
      .from('contacts')
      .insert({ org_id: orgA.id, kind: 'vendor', vendor_type: null, name: tag(), created_by: await uid(ownerA) })
      .select('id')
      .single()
    expect(error, 'kind=vendor with null vendor_type must violate the check constraint').toBeTruthy()
    expect(data).toBeNull()
  })

  test('TC-DIR-004 · editing a contact updates it, but a quote keeps its denormalized name snapshot (ADR-0003)', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)
    const original = tag()

    const { data: contact, error } = await ownerA
      .from('contacts')
      .insert({ org_id: orgA.id, kind: 'shipper', name: original, created_by: await uid(ownerA) })
      .select('id')
      .single()
    expect(error).toBeNull()

    // Reference the contact from a quote (the tier resolves the shipper by name and snapshots it).
    const created = await invokeQuotesService(ownerA, {
      action: 'create',
      orgId: orgA.id,
      mode: 'ocean',
      origin: tag(),
      destination: 'Rotterdam',
      shipperName: original,
      consigneeName: 'QA DIR Consignee',
      lineItems: [{ description: 'x', quantity: 1, rate: 100 }],
    })
    const quote = created.data as { id: string; shipper_name: string }
    expect(quote.shipper_name).toBe(original)

    // Rename the contact.
    const renamed = `${original}-RENAMED`
    const { error: upErr } = await ownerA.from('contacts').update({ name: renamed }).eq('id', contact!.id)
    expect(upErr, 'contact edit persists').toBeNull()
    const { data: after } = await ownerA.from('contacts').select('name').eq('id', contact!.id).single()
    expect(after?.name).toBe(renamed)

    // The quote's snapshot must NOT retroactively change (ADR-0003 denormalized name).
    const { data: q } = await ownerA.from('quotes').select('shipper_name').eq('id', quote.id).single()
    expect(q?.shipper_name, 'quote keeps the original snapshot name').toBe(original)

    await invokeQuotesService(ownerA, { action: 'archive', quoteId: quote.id })
    await ownerA.from('contacts').update({ archived: true }).eq('id', contact!.id)
  })

  test('TC-DIR-003 · a plain member can create a contact (Directory is never module-gated)', async () => {
    const memberA = await signInAs('memberA')
    const orgA = await getOrg(memberA, QA_ORGS.A)
    const name = tag()
    const { data, error } = await memberA
      .from('contacts')
      .insert({ org_id: orgA.id, kind: 'consignee', name, created_by: await uid(memberA) })
      .select('id')
      .single()
    expect(error, 'a member may create a contact').toBeNull()
    expect(data?.id).toBeTruthy()
    await memberA.from('contacts').update({ archived: true }).eq('id', data!.id)
  })
})
