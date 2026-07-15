// docusign-envelope: this app's first Supabase Edge Function (ADR-0020). Exists solely because
// DocuSign's JWT Grant auth requires RS256 (RSA-SHA256) JWT signing, which no Postgres extension
// can do (pgjwt is HMAC-only and deprecated) — Deno's native crypto.subtle handles RS256 signing
// directly, so this is the smallest surface that can do the job.
//
// Authorization model: this function is invoked via supabase.functions.invoke(...), which
// forwards the caller's own Supabase auth JWT in the Authorization header. It creates its OWN
// supabase-js client scoped to THAT JWT (never a service-role key) to read/write
// quotes/shipments/esign_requests — Postgres RLS enforces org membership exactly the same way it
// does for every other client call in this app. Only the DocuSign secrets themselves (Integration
// Key, User ID, Account ID, RSA private key) come from this function's own environment secrets,
// set via `supabase secrets set` — a separate store from Postgres Vault, since Deno reads env
// vars, not SQL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ── base64url + PKCS#1 → PKCS#8 conversion ──────────────────────────────────────────────────
// DocuSign issues RSA private keys in PKCS#1 PEM form ("-----BEGIN RSA PRIVATE KEY-----"), but
// the Web Crypto API's importKey only accepts PKCS#8. Converting is just wrapping the PKCS#1 DER
// bytes in a fixed, standard PKCS#8 ASN.1 envelope — no external library needed.

function base64Encode(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64UrlEncode(bytes: Uint8Array): string {
  return base64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function derLength(len: number): number[] {
  if (len < 0x80) return [len]
  const bytes: number[] = []
  let l = len
  while (l > 0) {
    bytes.unshift(l & 0xff)
    l >>= 8
  }
  return [0x80 | bytes.length, ...bytes]
}

function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const algorithmIdentifier = [
    0x30, 0x0d, // SEQUENCE, length 13
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // OID 1.2.840.113549.1.1.1 (rsaEncryption)
    0x05, 0x00, // NULL
  ]
  const version = [0x02, 0x01, 0x00] // INTEGER 0
  const octetString = [0x04, ...derLength(pkcs1.length), ...pkcs1]
  const body = [...version, ...algorithmIdentifier, ...octetString]
  return new Uint8Array([0x30, ...derLength(body.length), ...body])
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  const pkcs1 = pemToDer(pem)
  const pkcs8 = pem.includes('BEGIN PRIVATE KEY') ? pkcs1 : pkcs1ToPkcs8(pkcs1)
  return crypto.subtle.importKey('pkcs8', pkcs8.buffer as ArrayBuffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}

// ── DocuSign JWT Grant → access token ───────────────────────────────────────────────────────

async function getDocuSignAccessToken(): Promise<string> {
  const integrationKey = Deno.env.get('DOCUSIGN_INTEGRATION_KEY')
  const userId = Deno.env.get('DOCUSIGN_USER_ID')
  const privateKey = Deno.env.get('DOCUSIGN_PRIVATE_KEY')
  const authServer = Deno.env.get('DOCUSIGN_AUTH_SERVER') ?? 'account-d.docusign.com'
  if (!integrationKey || !userId || !privateKey) {
    throw new Error('DocuSign secrets are not configured (DOCUSIGN_INTEGRATION_KEY / DOCUSIGN_USER_ID / DOCUSIGN_PRIVATE_KEY)')
  }

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: integrationKey,
    sub: userId,
    aud: authServer,
    iat: now,
    exp: now + 3600,
    scope: 'signature impersonation',
  }
  const encoder = new TextEncoder()
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)))
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const signingInput = `${headerB64}.${payloadB64}`

  const key = await importRsaPrivateKey(privateKey)
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(signingInput))
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`

  const tokenRes = await fetch(`https://${authServer}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const tokenBody = await tokenRes.json()
  if (!tokenRes.ok) {
    // consent_required means the one-time DocuSign consent step hasn't been done for this
    // integration key + user yet — a real, expected first-time setup step, not a bug.
    throw new Error(`DocuSign token request failed (${tokenRes.status}): ${JSON.stringify(tokenBody)}`)
  }
  return tokenBody.access_token as string
}

function docusignBaseUrl(): string {
  return Deno.env.get('DOCUSIGN_BASE_URL') ?? 'https://demo.docusign.net'
}

function mapEnvelopeStatus(docusignStatus: string): string {
  const s = docusignStatus.toLowerCase()
  if (s === 'completed' || s === 'signed') return 'completed'
  if (s === 'declined') return 'declined'
  if (s === 'voided') return 'voided'
  if (s === 'delivered') return 'delivered'
  return 'sent'
}

// ── request handlers ─────────────────────────────────────────────────────────────────────────

interface SendPayload {
  action: 'send'
  documentType: 'quote' | 'bill_of_lading'
  orgId: string
  quoteId?: string
  shipmentId?: string
  documentRef: string
  documentLabel: string
  html: string
  recipientName: string
  recipientEmail: string
}

interface StatusPayload {
  action: 'status'
  esignRequestId: string
}

async function handleSend(supabase: ReturnType<typeof createClient>, payload: SendPayload): Promise<Response> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return jsonResponse({ error: 'Not authenticated' }, 401)

  const accountId = Deno.env.get('DOCUSIGN_ACCOUNT_ID')
  if (!accountId) return jsonResponse({ error: 'DOCUSIGN_ACCOUNT_ID is not configured' }, 500)

  let accessToken: string
  try {
    accessToken = await getDocuSignAccessToken()
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'DocuSign auth failed' }, 502)
  }

  const htmlBase64 = base64Encode(new TextEncoder().encode(payload.html))

  const envelopeRes = await fetch(`${docusignBaseUrl()}/restapi/v2.1/accounts/${accountId}/envelopes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emailSubject: `Please sign: ${payload.documentLabel} (${payload.documentRef})`,
      status: 'sent',
      documents: [{ documentBase64: htmlBase64, name: payload.documentLabel, fileExtension: 'html', documentId: '1' }],
      recipients: {
        signers: [
          {
            email: payload.recipientEmail,
            name: payload.recipientName,
            recipientId: '1',
            routingOrder: '1',
            tabs: { signHereTabs: [{ anchorString: '/sig1/', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '0' }] },
          },
        ],
      },
    }),
  })
  const envelopeBody = await envelopeRes.json()
  if (!envelopeRes.ok) {
    return jsonResponse({ error: `DocuSign envelope creation failed (${envelopeRes.status}): ${JSON.stringify(envelopeBody)}` }, 502)
  }

  const { data: row, error: insertError } = await supabase
    .from('esign_requests')
    .insert({
      org_id: payload.orgId,
      document_type: payload.documentType,
      quote_id: payload.quoteId ?? null,
      shipment_id: payload.shipmentId ?? null,
      envelope_id: envelopeBody.envelopeId,
      recipient_name: payload.recipientName,
      recipient_email: payload.recipientEmail,
      status: 'sent',
      created_by: user.id,
    })
    .select()
    .single()

  if (insertError) return jsonResponse({ error: insertError.message }, 400)
  return jsonResponse({ data: row })
}

async function handleStatus(supabase: ReturnType<typeof createClient>, payload: StatusPayload): Promise<Response> {
  const { data: existing, error: fetchError } = await supabase
    .from('esign_requests')
    .select('*')
    .eq('id', payload.esignRequestId)
    .single()
  if (fetchError || !existing) return jsonResponse({ error: fetchError?.message ?? 'Not found' }, 404)

  const accountId = Deno.env.get('DOCUSIGN_ACCOUNT_ID')
  if (!accountId) return jsonResponse({ error: 'DOCUSIGN_ACCOUNT_ID is not configured' }, 500)

  let accessToken: string
  try {
    accessToken = await getDocuSignAccessToken()
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'DocuSign auth failed' }, 502)
  }

  const statusRes = await fetch(`${docusignBaseUrl()}/restapi/v2.1/accounts/${accountId}/envelopes/${existing.envelope_id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const statusBody = await statusRes.json()
  if (!statusRes.ok) {
    return jsonResponse({ error: `DocuSign status lookup failed (${statusRes.status}): ${JSON.stringify(statusBody)}` }, 502)
  }

  const newStatus = mapEnvelopeStatus(statusBody.status)
  const { data: updated, error: updateError } = await supabase
    .from('esign_requests')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', payload.esignRequestId)
    .select()
    .single()

  if (updateError) return jsonResponse({ error: updateError.message }, 400)
  return jsonResponse({ data: updated })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    const payload = (await req.json()) as SendPayload | StatusPayload
    if (payload.action === 'send') return await handleSend(supabase, payload)
    if (payload.action === 'status') return await handleStatus(supabase, payload)
    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unknown error' }, 500)
  }
})
