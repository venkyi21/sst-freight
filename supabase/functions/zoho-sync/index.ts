// zoho-sync (ADR-0037): pushes an invoice + its customer to a client's own Zoho Books account.
// Architecturally different from every other integration in this app — Zoho requires each org to
// connect its OWN Zoho Books account via OAuth2 (authorization-code + refresh-token), not a single
// vendor-wide credential set like Razorpay/DocuSign/ClearTax. That means TWO very different request
// shapes share this one function:
//
//   - oauth_callback: Zoho redirects the user's browser here directly (a plain GET with ?code=&
//     state=, no Supabase Authorization header at all — this is why "Verify JWT" must be OFF for
//     this function, same reason as razorpay-webhook). Exchanges the code for tokens using the
//     SERVICE-ROLE client (zoho_connections has no client-facing RLS policy at all — see
//     schema.sql), then 302-redirects the browser back into the app.
//   - sync_invoice: a normal supabase.functions.invoke() POST, forwarding the caller's own JWT.
//     Reads the org's stored refresh token via service-role (the one read a normal user must never
//     be able to do directly), refreshes if expired, then writes invoice_zoho_syncs through the
//     RLS-scoped client — that write is a normal org-scoped action, not a secret.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function zohoDc(): string {
  return Deno.env.get('ZOHO_DC') ?? 'com'
}
function accountsBase(): string {
  return `https://accounts.zoho.${zohoDc()}`
}
function apiBase(): string {
  return `https://www.zohoapis.${zohoDc()}`
}

function serviceRoleClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

// ── OAuth callback (GET, no Supabase auth header — Zoho itself redirects the browser here) ────

async function handleOAuthCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get('code')
  const orgId = url.searchParams.get('state') // MVP: state carries the org_id directly, no signing
  const appBaseUrl = Deno.env.get('APP_BASE_URL') ?? '/'
  if (!code || !orgId) {
    return jsonResponse({ error: 'Missing code or state from Zoho redirect' }, 400)
  }

  const clientId = Deno.env.get('ZOHO_CLIENT_ID')
  const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET')
  const redirectUri = Deno.env.get('ZOHO_REDIRECT_URI')
  if (!clientId || !clientSecret || !redirectUri) {
    return jsonResponse({ error: 'Zoho secrets are not configured (ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REDIRECT_URI)' }, 500)
  }

  const tokenRes = await fetch(`${accountsBase()}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const tokenBody = await tokenRes.json()
  if (!tokenRes.ok || !tokenBody.access_token) {
    return jsonResponse({ error: `Zoho token exchange failed: ${JSON.stringify(tokenBody)}` }, 502)
  }

  // Zoho Books calls need an organization_id — fetch the account's own org list and take the
  // first one (MVP: one Zoho org per connection, same simplification as one-GSTIN-per-org).
  const orgsRes = await fetch(`${apiBase()}/books/v3/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${tokenBody.access_token}` },
  })
  const orgsBody = await orgsRes.json()
  const zohoOrgId = orgsBody?.organizations?.[0]?.organization_id
  if (!orgsRes.ok || !zohoOrgId) {
    return jsonResponse({ error: `Could not read the Zoho Books organization list: ${JSON.stringify(orgsBody)}` }, 502)
  }

  const supabase = serviceRoleClient()
  const { error: upsertError } = await supabase.from('zoho_connections').upsert({
    org_id: orgId,
    access_token: tokenBody.access_token,
    refresh_token: tokenBody.refresh_token,
    token_expires_at: new Date(Date.now() + tokenBody.expires_in * 1000).toISOString(),
    zoho_org_id: zohoOrgId,
    connected_at: new Date().toISOString(),
  })
  if (upsertError) return jsonResponse({ error: upsertError.message }, 400)

  return new Response(null, { status: 302, headers: { Location: `${appBaseUrl}#/settings?zoho=connected` } })
}

// ── sync_invoice (POST, RLS-scoped client via caller's own JWT) ────────────────────────────────

interface SyncPayload {
  action: 'sync_invoice'
  invoiceId: string
}

interface ConnectUrlPayload {
  action: 'get_connect_url'
  orgId: string
}

// The client can never build this URL itself — ZOHO_CLIENT_ID is a server secret, correctly never
// shipped in the frontend bundle. `state=orgId` is what oauth_callback reads back (MVP: unsigned —
// see docs/tech-debt.md for the CSRF-hardening a real signed state would add).
function handleGetConnectUrl(payload: ConnectUrlPayload): Response {
  const clientId = Deno.env.get('ZOHO_CLIENT_ID')
  const redirectUri = Deno.env.get('ZOHO_REDIRECT_URI')
  if (!clientId || !redirectUri) return jsonResponse({ error: 'Zoho secrets are not configured' }, 500)

  const url = new URL(`${accountsBase()}/oauth/v2/auth`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', 'ZohoBooks.fullaccess.all')
  url.searchParams.set('access_type', 'offline') // required to receive a refresh_token
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', payload.orgId)
  return jsonResponse({ data: { url: url.toString() } })
}

async function getValidAccessToken(supabaseService: ReturnType<typeof createClient>, orgId: string): Promise<{ token: string | null; error: string | null }> {
  const { data: conn, error } = await supabaseService.from('zoho_connections').select('*').eq('org_id', orgId).single()
  if (error || !conn) return { token: null, error: 'Zoho is not connected for this organization' }

  if (new Date(conn.token_expires_at as string) > new Date(Date.now() + 60_000)) {
    return { token: conn.access_token as string, error: null }
  }

  const clientId = Deno.env.get('ZOHO_CLIENT_ID')
  const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET')
  const refreshRes = await fetch(`${accountsBase()}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: conn.refresh_token as string,
      client_id: clientId!,
      client_secret: clientSecret!,
      grant_type: 'refresh_token',
    }),
  })
  const refreshBody = await refreshRes.json()
  if (!refreshRes.ok || !refreshBody.access_token) {
    return { token: null, error: `Zoho token refresh failed: ${JSON.stringify(refreshBody)}` }
  }
  await supabaseService
    .from('zoho_connections')
    .update({ access_token: refreshBody.access_token, token_expires_at: new Date(Date.now() + refreshBody.expires_in * 1000).toISOString() })
    .eq('org_id', orgId)
  return { token: refreshBody.access_token as string, error: null }
}

// Finds an existing Zoho contact by exact name, else creates one — a real business likely
// already has most clients in Zoho, so match-first avoids duplicate customer records.
async function resolveZohoCustomerId(accessToken: string, zohoOrgId: string, contactName: string, email: string | null): Promise<{ id: string | null; error: string | null }> {
  const searchRes = await fetch(
    `${apiBase()}/books/v3/contacts?organization_id=${zohoOrgId}&contact_name=${encodeURIComponent(contactName)}`,
    { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } },
  )
  const searchBody = await searchRes.json()
  const existing = searchBody?.contacts?.[0]?.contact_id
  if (existing) return { id: existing, error: null }

  const createRes = await fetch(`${apiBase()}/books/v3/contacts?organization_id=${zohoOrgId}`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact_name: contactName, email: email ?? undefined }),
  })
  const createBody = await createRes.json()
  if (!createRes.ok || !createBody?.contact?.contact_id) {
    return { id: null, error: `Could not create the Zoho customer: ${JSON.stringify(createBody)}` }
  }
  return { id: createBody.contact.contact_id, error: null }
}

async function handleSyncInvoice(supabase: ReturnType<typeof createClient>, payload: SyncPayload): Promise<Response> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401)

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('*, contacts:client_contact_id(name, email)')
    .eq('id', payload.invoiceId)
    .single()
  if (invErr || !invoice) return jsonResponse({ error: invErr?.message ?? 'Invoice not found' }, 404)

  const { data: lineItems, error: liErr } = await supabase.from('invoice_line_items').select('*').eq('invoice_id', payload.invoiceId)
  if (liErr) return jsonResponse({ error: liErr.message }, 400)

  const supabaseService = serviceRoleClient()
  const { token: accessToken, error: tokenError } = await getValidAccessToken(supabaseService, invoice.org_id as string)
  if (tokenError || !accessToken) return jsonResponse({ error: tokenError ?? 'Could not get a Zoho access token' }, 502)

  const { data: conn } = await supabaseService.from('zoho_connections').select('zoho_org_id').eq('org_id', invoice.org_id as string).single()
  const zohoOrgId = conn?.zoho_org_id as string

  const contact = invoice.contacts as { name: string | null; email: string | null } | null
  const { id: customerId, error: customerError } = await resolveZohoCustomerId(accessToken, zohoOrgId, contact?.name ?? invoice.client_name as string, contact?.email ?? null)
  if (customerError || !customerId) {
    await supabase.from('invoice_zoho_syncs').upsert(
      { org_id: invoice.org_id, invoice_id: payload.invoiceId, status: 'failed', error_message: customerError },
      { onConflict: 'invoice_id' },
    )
    return jsonResponse({ error: customerError }, 502)
  }

  const invoiceRes = await fetch(`${apiBase()}/books/v3/invoices?organization_id=${zohoOrgId}`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_id: customerId,
      invoice_number: invoice.ref,
      date: (invoice.created_at as string).slice(0, 10),
      due_date: invoice.due_date ?? undefined,
      line_items: ((lineItems ?? []) as Array<Record<string, unknown>>).map((li) => ({
        name: li.description,
        rate: li.rate,
        quantity: li.quantity,
      })),
    }),
  })
  const invoiceBody = await invoiceRes.json()
  const zohoInvoiceId = invoiceBody?.invoice?.invoice_id

  if (!invoiceRes.ok || !zohoInvoiceId) {
    const { data: row } = await supabase
      .from('invoice_zoho_syncs')
      .upsert(
        { org_id: invoice.org_id, invoice_id: payload.invoiceId, status: 'failed', error_message: `Zoho invoice creation failed: ${JSON.stringify(invoiceBody)}` },
        { onConflict: 'invoice_id' },
      )
      .select()
      .single()
    return jsonResponse({ error: row?.error_message ?? 'Zoho invoice creation failed', data: row }, 502)
  }

  const { data: row, error: upsertError } = await supabase
    .from('invoice_zoho_syncs')
    .upsert(
      { org_id: invoice.org_id, invoice_id: payload.invoiceId, zoho_invoice_id: zohoInvoiceId, status: 'synced', synced_at: new Date().toISOString(), error_message: null },
      { onConflict: 'invoice_id' },
    )
    .select()
    .single()
  if (upsertError) return jsonResponse({ error: upsertError.message }, 400)
  return jsonResponse({ data: row })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    if (req.method === 'GET' && url.searchParams.has('code')) {
      return await handleOAuthCallback(url)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    const payload = (await req.json()) as SyncPayload | ConnectUrlPayload
    if (payload.action === 'sync_invoice') return await handleSyncInvoice(supabase, payload)
    if (payload.action === 'get_connect_url') return handleGetConnectUrl(payload)
    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
