import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signInAs, getOrg, invokeQuotesService, SUPABASE_URL, SUPABASE_ANON_KEY } from '../fixtures/supabase'
import { QA_ORGS } from '../fixtures/qa-data'

// Raw HTTP call to the public API gateway (ADR-0029) exactly as an external integrator would —
// no Supabase SDK: the anon key is the `apikey` header, the issued key is the `p_api_key` body param.
async function callGateway(rpc: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON error body */
  }
  return { status: res.status, json, text }
}

// INTEG module — the outbound-webhook outbox (ADR-0029) and the audit ledger (ADR-0010) stay
// unbroken as quote status changes flow through the tier. This also covers the observability rows
// TC-QUOTE-014. The created endpoint is disabled (not deleted) at the end. IDs map to test-catalog.md.

const tag = () => `QA-E2E-INTEG-${Date.now()}-${Math.floor(Math.random() * 1e4)}`

async function uid(client: SupabaseClient) {
  return (await client.auth.getUser()).data.user!.id
}

test.describe('INTEG — webhook outbox & audit continuity', () => {
  test('TC-INTEG-003/004 + TC-QUOTE-014 · status changes populate the outbox and the audit ledger', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)

    // Register the endpoint BEFORE the status changes we want captured.
    const { data: endpoint, error: epErr } = await ownerA
      .from('webhook_endpoints')
      .insert({
        org_id: orgA.id,
        url: `https://example.com/sst-e2e-${tag()}`,
        event_types: ['quote.sent', 'quote.accepted', 'quote.rejected'],
        created_by: await uid(ownerA),
      })
      .select('id')
      .single()
    expect(epErr, 'webhook endpoint registered').toBeNull()

    try {
      // Drive two quotes so every event type appears: one accepted, one rejected.
      const a = (await invokeQuotesService(ownerA, {
        action: 'create',
        orgId: orgA.id,
        mode: 'ocean',
        origin: tag(),
        destination: 'Rotterdam',
        shipperName: 'QA INTEG',
        consigneeName: 'QA INTEG',
        lineItems: [{ description: 'x', quantity: 1, rate: 100 }],
      }).then((r) => r.data)) as { id: string }
      await invokeQuotesService(ownerA, { action: 'send', quoteId: a.id })
      await invokeQuotesService(ownerA, { action: 'accept', quoteId: a.id })

      const b = (await invokeQuotesService(ownerA, {
        action: 'create',
        orgId: orgA.id,
        mode: 'air',
        origin: tag(),
        destination: 'Singapore',
        shipperName: 'QA INTEG',
        consigneeName: 'QA INTEG',
        lineItems: [{ description: 'y', quantity: 1, rate: 100 }],
      }).then((r) => r.data)) as { id: string }
      await invokeQuotesService(ownerA, { action: 'send', quoteId: b.id })
      await invokeQuotesService(ownerA, { action: 'reject', quoteId: b.id, reason: 'QA E2E' })

      // Outbox: all three event types captured for this endpoint.
      const { data: deliveries, error: delErr } = await ownerA.rpc('list_webhook_deliveries', {
        p_org_id: orgA.id,
        p_endpoint_id: endpoint!.id,
        p_limit: 50,
      })
      expect(delErr).toBeNull()
      const types = new Set(((deliveries as { event_type: string }[] | null) ?? []).map((d) => d.event_type))
      for (const t of ['quote.sent', 'quote.accepted', 'quote.rejected']) {
        expect(types.has(t), `outbox captured ${t}`).toBe(true)
      }

      // Audit ledger: rows written for the tier-driven changes on quote A (insert + status moves).
      const { data: audit, error: auditErr } = await ownerA.rpc('list_audit_log', {
        p_org_id: orgA.id,
        p_table_name: 'quotes',
        p_record_id: a.id,
      })
      expect(auditErr).toBeNull()
      expect((audit as unknown[] | null)?.length ?? 0, 'audit rows written for quote A').toBeGreaterThanOrEqual(3)

      await invokeQuotesService(ownerA, { action: 'archive', quoteId: a.id })
      await invokeQuotesService(ownerA, { action: 'archive', quoteId: b.id })
    } finally {
      await ownerA.from('webhook_endpoints').update({ enabled: false }).eq('id', endpoint!.id)
    }
  })

  test('TC-INTEG-001/002 · issue an API key and call the public gateway with it', async () => {
    const ownerA = await signInAs('ownerA')
    const orgA = await getOrg(ownerA, QA_ORGS.A)

    const created = await ownerA.rpc('create_api_key', { p_org_id: orgA.id, p_label: `qa-e2e-${tag()}` })
    expect(created.error, 'key issued').toBeNull()
    const key = created.data as { id: string; api_key: string; key_prefix: string }
    expect(key.api_key, 'plaintext key returned once').toBeTruthy()

    try {
      // A valid key → org-scoped 200 with an array payload.
      const ok = await callGateway('api_list_shipments', { p_api_key: key.api_key, p_limit: 5 })
      expect(ok.status, `gateway accepts a valid key (body: ${ok.text.slice(0, 120)})`).toBe(200)
      expect(Array.isArray(ok.json), 'gateway returns an array of shipments').toBe(true)

      // A garbage key → rejected with the documented message.
      const bad = await callGateway('api_list_shipments', { p_api_key: 'sst_live_garbage', p_limit: 5 })
      const rejected = bad.status >= 400 || JSON.stringify(bad.json).includes('Invalid or revoked')
      expect(rejected, `gateway rejects a garbage key (status ${bad.status})`).toBe(true)
    } finally {
      await ownerA.rpc('revoke_api_key', { p_key_id: key.id })
    }
  })
})
