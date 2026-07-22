// gst-einvoice (ADR-0037): generates a real e-invoice IRN + QR code via ClearTax's GSP API for one
// invoice. Scope is deliberately e-invoicing only, NOT periodic GSTR-1/3B return filing — a much
// bigger, separate compliance feature (see docs/tech-debt.md).
//
// Authorization model: same as docusign-envelope — invoked via supabase.functions.invoke(...),
// which forwards the caller's own Supabase JWT. This function creates its own supabase-js client
// scoped to THAT JWT (never service-role) to read invoices/invoice_line_items/contacts/organizations
// and write invoice_einvoices — Postgres RLS enforces org membership exactly like any other client
// call. Only the ClearTax credentials come from this function's own environment secrets.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// GST state codes (2-digit) keyed by lowercased state/UT name — kept in exact 1:1 correspondence
// with src/types/common.ts's INDIAN_STATES (the fixed dropdown both organizations.gst_state and
// contacts.state are populated from, so names here are trusted to match, not free text). India's
// e-invoice schema requires the numeric Stcd, not the name; an unmatched name is still a clear 400
// rather than a silently wrong code, in case that list and this map ever drift apart.
const GST_STATE_CODES: Record<string, string> = {
  'andaman and nicobar islands': '35', 'andhra pradesh': '37', 'arunachal pradesh': '12',
  assam: '18', bihar: '10', chandigarh: '04', chhattisgarh: '22',
  'dadra and nagar haveli and daman and diu': '26', delhi: '07', goa: '30', gujarat: '24',
  haryana: '06', 'himachal pradesh': '02', 'jammu and kashmir': '01', jharkhand: '20',
  karnataka: '29', kerala: '32', ladakh: '38', lakshadweep: '31', 'madhya pradesh': '23',
  maharashtra: '27', manipur: '14', meghalaya: '17', mizoram: '15', nagaland: '13',
  odisha: '21', puducherry: '34', punjab: '03', rajasthan: '08', sikkim: '11',
  'tamil nadu': '33', telangana: '36', tripura: '16', 'uttar pradesh': '09',
  uttarakhand: '05', 'west bengal': '19',
}

function stateCode(stateName: string | null): string | null {
  if (!stateName) return null
  return GST_STATE_CODES[stateName.trim().toLowerCase()] ?? null
}

function ddmmyyyy(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

interface GeneratePayload {
  action: 'generate'
  invoiceId: string
}

async function handleGenerate(supabase: ReturnType<typeof createClient>, payload: GeneratePayload): Promise<Response> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401)

  const apiKey = Deno.env.get('CLEARTAX_API_KEY')
  const clearTaxBase = Deno.env.get('CLEARTAX_BASE_URL') ?? 'https://api.cleartax.in'
  if (!apiKey) return jsonResponse({ error: 'CLEARTAX_API_KEY is not configured' }, 500)

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('*, organizations(gstin, legal_name, gst_state), contacts:client_contact_id(gstin, name, address_line1, city, state, pincode)')
    .eq('id', payload.invoiceId)
    .single()
  if (invErr || !invoice) return jsonResponse({ error: invErr?.message ?? 'Invoice not found' }, 404)

  const { data: lineItems, error: liErr } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', payload.invoiceId)
  if (liErr) return jsonResponse({ error: liErr.message }, 400)
  if (!lineItems || lineItems.length === 0) {
    return jsonResponse({ error: 'Invoice has no line items — nothing to generate an e-invoice from' }, 400)
  }

  const org = invoice.organizations as { gstin: string | null; legal_name: string | null; gst_state: string | null }
  const contact = invoice.contacts as { gstin: string | null; name: string | null; address_line1: string | null; city: string | null; state: string | null; pincode: string | null } | null

  if (!org?.gstin || !org?.legal_name) {
    return jsonResponse({ error: "Your organization's GSTIN and legal name must be set (Settings → GST) before generating an e-invoice" }, 400)
  }
  if (!contact?.gstin || !contact?.address_line1 || !contact?.pincode) {
    return jsonResponse({ error: 'The billed contact needs a GSTIN, address, and PIN code set (Directory → edit contact) before generating an e-invoice' }, 400)
  }
  const sellerStcd = stateCode(org.gst_state)
  const buyerStcd = stateCode(contact.state)
  if (!sellerStcd || !buyerStcd) {
    return jsonResponse({ error: 'Could not resolve a GST state code for your organization or the billed contact — check the state field spelling' }, 400)
  }

  const items = (lineItems as Array<Record<string, unknown>>).map((li, idx) => ({
    SlNo: String(idx + 1),
    PrdDesc: li.description,
    IsServc: 'Y',
    HsnCd: li.sac_code ?? '9967',
    Qty: li.quantity,
    Unit: 'OTH',
    UnitPrice: li.rate,
    TotAmt: li.taxable_value,
    AssAmt: li.taxable_value,
    GstRt: li.gst_rate,
    CgstAmt: li.cgst_amount,
    SgstAmt: li.sgst_amount,
    IgstAmt: li.igst_amount,
    TotItemVal: li.line_total,
  }))
  const totals = (lineItems as Array<Record<string, number>>).reduce(
    (acc, li) => ({
      taxable: acc.taxable + Number(li.taxable_value),
      cgst: acc.cgst + Number(li.cgst_amount),
      sgst: acc.sgst + Number(li.sgst_amount),
      igst: acc.igst + Number(li.igst_amount),
      total: acc.total + Number(li.line_total),
    }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
  )

  const transaction = {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N' },
    DocDtls: { Typ: 'INV', No: invoice.ref, Dt: ddmmyyyy(invoice.created_at as string) },
    SellerDtls: { Gstin: org.gstin, LglNm: org.legal_name, Stcd: sellerStcd },
    BuyerDtls: {
      Gstin: contact.gstin,
      LglNm: contact.name,
      Pos: buyerStcd,
      Addr1: contact.address_line1,
      Loc: contact.city ?? '',
      Pin: contact.pincode,
      Stcd: buyerStcd,
    },
    ItemList: items,
    ValDtls: {
      AssVal: totals.taxable,
      CgstVal: totals.cgst,
      SgstVal: totals.sgst,
      IgstVal: totals.igst,
      TotInvVal: totals.total,
    },
  }

  const irnRes = await fetch(`${clearTaxBase}/einv/v2/eInvoice/generate`, {
    method: 'PUT',
    headers: {
      'X-Cleartax-Auth-Token': apiKey,
      'Content-Type': 'application/json',
      gstin: org.gstin,
    },
    body: JSON.stringify([{ transaction }]),
  })
  const irnBody = await irnRes.json()
  if (!irnRes.ok) {
    await supabase.from('invoice_einvoices').upsert(
      {
        org_id: invoice.org_id,
        invoice_id: payload.invoiceId,
        status: 'failed',
        gsp_response: irnBody,
        error_message: `ClearTax request failed (${irnRes.status})`,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'invoice_id' },
    )
    return jsonResponse({ error: `ClearTax request failed (${irnRes.status}): ${JSON.stringify(irnBody)}` }, 502)
  }

  const result = Array.isArray(irnBody) ? irnBody[0] : irnBody
  const govtResponse = result?.govt_response ?? {}
  const success = govtResponse.Success === 'Y' && result?.document_status === 'IRN_GENERATED'

  const { data: row, error: upsertError } = await supabase
    .from('invoice_einvoices')
    .upsert(
      {
        org_id: invoice.org_id,
        invoice_id: payload.invoiceId,
        irn: govtResponse.Irn ?? null,
        ack_no: govtResponse.AckNo ?? null,
        ack_date: govtResponse.AckDt ?? null,
        qr_code: govtResponse.SignedQRCode ?? null,
        status: success ? 'generated' : 'failed',
        gsp_response: result,
        error_message: success ? null : JSON.stringify(govtResponse.ErrorDetails ?? result),
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'invoice_id' },
    )
    .select()
    .single()

  if (upsertError) return jsonResponse({ error: upsertError.message }, 400)
  if (!success) return jsonResponse({ error: row.error_message ?? 'ClearTax did not return a generated IRN', data: row }, 502)
  return jsonResponse({ data: row })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    const payload = (await req.json()) as GeneratePayload
    if (payload.action === 'generate') return await handleGenerate(supabase, payload)
    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
