// quotes-service: the business-logic tier for the Quotes module (ADR-0030) — the pilot of
// moving workflow orchestration out of client components into a TypeScript Edge Function.
// This function owns quote creation (contact resolution, ref generation, AUTHORITATIVE
// line-amount/total math — the client's total is a display preview, never trusted), the
// lifecycle actions (send/accept/reject/archive), and conversion to a booking (which delegates
// to the convert_quote_to_shipment RPC — one transaction, closing ADR-0006's double-submit
// race for good).
//
// Authorization model (same as docusign-envelope, ADR-0020): invoked via
// supabase.functions.invoke(...), which forwards the caller's own auth JWT; this function
// creates its OWN supabase-js client scoped to THAT JWT — never a service-role key — so every
// read/write below still passes through Postgres RLS, module gating, the quote status-machine
// trigger, audit capture, and webhook capture exactly as direct client calls did. The database
// remains the enforcement layer; this tier is orchestration + validation + observability
// (structured log line per action, visible in the Supabase dashboard's function logs).

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ── payloads ─────────────────────────────────────────────────────────────────────────────────

interface LineItemInput {
  description: string
  sacCode?: string | null
  quantity: number
  rate: number
}

interface CreatePayload {
  action: 'create'
  orgId: string
  mode: 'ocean' | 'air' | 'truck'
  tariffId?: string | null
  origin: string
  destination: string
  shipperContactId?: string | null
  shipperName: string
  consigneeContactId?: string | null
  consigneeName: string
  lineItems: LineItemInput[]
}

interface StatusPayload {
  action: 'send' | 'accept' | 'reject'
  quoteId: string
  reason?: string | null
}

interface ArchivePayload {
  action: 'archive'
  quoteId: string
}

interface ConvertPayload {
  action: 'convert'
  quoteId: string
}

type Payload = CreatePayload | StatusPayload | ArchivePayload | ConvertPayload

// ── helpers ──────────────────────────────────────────────────────────────────────────────────

function generateRef(prefix: string): string {
  const year = new Date().getFullYear()
  const suffix = Math.floor(100 + Math.random() * 899)
  return `${prefix}-${year}-${suffix}`
}

// Same resolve-or-create behavior QuoteModal previously ran client-side: an explicit contact id
// wins; otherwise reuse a same-org, same-kind, case-insensitive name match; otherwise create.
async function resolveOrCreateContact(
  supabase: SupabaseClient,
  orgId: string,
  existingId: string | null | undefined,
  kind: 'shipper' | 'consignee',
  name: string,
  userId: string,
): Promise<string | null> {
  if (existingId) return existingId
  const { data: match } = await supabase
    .from('contacts')
    .select('id')
    .eq('org_id', orgId)
    .eq('kind', kind)
    .ilike('name', name)
    .limit(1)
    .maybeSingle()
  if (match) return (match as { id: string }).id
  const { data, error } = await supabase
    .from('contacts')
    .insert({ org_id: orgId, kind, name, created_by: userId })
    .select('id')
    .single()
  if (error || !data) return null
  return (data as { id: string }).id
}

const QUOTE_SELECT = '*, converted_shipment:shipments!converted_shipment_id(ref)'

function logAction(action: string, outcome: 'ok' | 'error', detail: Record<string, unknown>): void {
  console.log(JSON.stringify({ fn: 'quotes-service', action, outcome, ...detail }))
}

// ── handlers ─────────────────────────────────────────────────────────────────────────────────

async function handleCreate(supabase: SupabaseClient, userId: string, p: CreatePayload): Promise<Response> {
  if (!p.orgId || !p.origin?.trim() || !p.destination?.trim() || !p.shipperName?.trim() || !p.consigneeName?.trim()) {
    return jsonResponse({ error: 'Origin, destination, shipper, and consignee are all required' }, 400)
  }
  if (!Array.isArray(p.lineItems) || p.lineItems.length === 0) {
    return jsonResponse({ error: 'At least one line item is required' }, 400)
  }
  for (const li of p.lineItems) {
    if (!li.description?.trim() || !(li.quantity > 0) || !(li.rate > 0)) {
      return jsonResponse({ error: 'Every line needs a description, quantity, and rate greater than 0' }, 400)
    }
  }

  // Authoritative math: amounts and total are computed HERE from raw qty/rate — a tampered
  // client-side total can never reach the table.
  const amounts = p.lineItems.map((li) => li.quantity * li.rate)
  const total = amounts.reduce((sum, a) => sum + a, 0)

  const shipperId = await resolveOrCreateContact(supabase, p.orgId, p.shipperContactId, 'shipper', p.shipperName.trim(), userId)
  const consigneeId = await resolveOrCreateContact(supabase, p.orgId, p.consigneeContactId, 'consignee', p.consigneeName.trim(), userId)

  // Ref retry on (org_id, ref) unique_violation — previously in api/quotes.ts, now here.
  let quote: Record<string, unknown> | null = null
  let lastError: { code?: string; message?: string } | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('quotes')
      .insert({
        org_id: p.orgId,
        ref: generateRef('QT'),
        tariff_id: p.tariffId || null,
        mode: p.mode,
        origin: p.origin.trim(),
        destination: p.destination.trim(),
        shipper_contact_id: shipperId,
        shipper_name: p.shipperName.trim(),
        consignee_contact_id: consigneeId,
        consignee_name: p.consigneeName.trim(),
        // Line 1 backfills the legacy rate/quantity columns (ADR-0021's additive shape).
        quantity: p.lineItems[0].quantity,
        rate: p.lineItems[0].rate,
        total,
        status: 'draft',
        created_by: userId,
      })
      .select()
      .single()
    if (!error && data) {
      quote = data as Record<string, unknown>
      break
    }
    lastError = error
    if (error?.code !== '23505') break
  }
  if (!quote) {
    logAction('create', 'error', { orgId: p.orgId, error: lastError?.message })
    return jsonResponse({ error: lastError?.message ?? 'Could not create quote' }, 400)
  }

  const rows = p.lineItems.map((li, i) => ({
    org_id: p.orgId,
    quote_id: quote!.id,
    description: li.description.trim(),
    sac_code: li.sacCode?.trim() || null,
    quantity: li.quantity,
    rate: li.rate,
    currency: 'INR',
    amount: amounts[i],
    created_by: userId,
  }))
  const { error: lineErr } = await supabase.from('quote_line_items').insert(rows)
  if (lineErr) {
    // Same accepted, documented non-atomicity as before (ADR-0006/ADR-0021 — quotes have no
    // delete grant, so no compensation is possible): the quote exists, the failure is logged
    // loudly here (now in the tier's persistent dashboard logs, not a lost browser console).
    logAction('create', 'error', { orgId: p.orgId, ref: quote.ref, error: `line items failed: ${lineErr.message}` })
  } else {
    logAction('create', 'ok', { orgId: p.orgId, ref: quote.ref, total, lines: rows.length })
  }
  return jsonResponse({ data: quote })
}

async function handleStatus(supabase: SupabaseClient, p: StatusPayload): Promise<Response> {
  const status = p.action === 'send' ? 'sent' : p.action === 'accept' ? 'accepted' : 'rejected'
  // The real UPDATE below is what fires validate_quote_status_transition (the state machine),
  // quotes_audit, and capture_quote_status_webhook — the tier validates shape, the DB enforces.
  const { data, error } = await supabase
    .from('quotes')
    .update({ status, rejection_reason: p.action === 'reject' ? (p.reason?.trim() || null) : null })
    .eq('id', p.quoteId)
    .select(QUOTE_SELECT)
    .single()
  if (error || !data) {
    logAction(p.action, 'error', { quoteId: p.quoteId, error: error?.message })
    return jsonResponse({ error: error?.message ?? 'Could not update quote status' }, 400)
  }
  logAction(p.action, 'ok', { quoteId: p.quoteId, ref: (data as { ref: string }).ref, status })
  return jsonResponse({ data })
}

async function handleArchive(supabase: SupabaseClient, p: ArchivePayload): Promise<Response> {
  const { data: current, error: readErr } = await supabase.from('quotes').select('archived, ref').eq('id', p.quoteId).single()
  if (readErr || !current) {
    return jsonResponse({ error: readErr?.message ?? 'Quote not found' }, 400)
  }
  const { data, error } = await supabase
    .from('quotes')
    .update({ archived: !(current as { archived: boolean }).archived })
    .eq('id', p.quoteId)
    .select(QUOTE_SELECT)
    .single()
  if (error || !data) {
    logAction('archive', 'error', { quoteId: p.quoteId, error: error?.message })
    return jsonResponse({ error: error?.message ?? 'Could not archive quote' }, 400)
  }
  logAction('archive', 'ok', { quoteId: p.quoteId, ref: (current as { ref: string }).ref, archived: !(current as { archived: boolean }).archived })
  return jsonResponse({ data })
}

async function handleConvert(supabase: SupabaseClient, p: ConvertPayload): Promise<Response> {
  // The atomic multi-step op lives in Postgres (ADR-0030's division of labor): one transaction,
  // row-locked, shipment insert + quote flip together — the double-submit race is dead.
  const { data: shipment, error } = await supabase.rpc('convert_quote_to_shipment', { p_quote_id: p.quoteId }).single()
  if (error || !shipment) {
    logAction('convert', 'error', { quoteId: p.quoteId, error: error?.message })
    return jsonResponse({ error: error?.message ?? 'Could not convert quote' }, 400)
  }
  const { data: updatedQuote } = await supabase.from('quotes').select(QUOTE_SELECT).eq('id', p.quoteId).single()
  logAction('convert', 'ok', { quoteId: p.quoteId, shipmentRef: (shipment as { ref: string }).ref })
  return jsonResponse({ data: { shipment, quote: updatedQuote } })
}

// ── entrypoint ───────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return jsonResponse({ error: 'Not authenticated' }, 401)

    const payload = (await req.json()) as Payload
    switch (payload.action) {
      case 'create':
        return await handleCreate(supabase, userData.user.id, payload)
      case 'send':
      case 'accept':
      case 'reject':
        return await handleStatus(supabase, payload)
      case 'archive':
        return await handleArchive(supabase, payload)
      case 'convert':
        return await handleConvert(supabase, payload)
      default:
        return jsonResponse({ error: 'Unknown action' }, 400)
    }
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
