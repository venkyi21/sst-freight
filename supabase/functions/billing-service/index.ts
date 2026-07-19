// billing-service: the SaaS subscription tier for the platform's own billing (ADR-0034). Creates
// and cancels Razorpay subscriptions for an org, then persists the Razorpay ids through the
// set_subscription_razorpay_ids definer RPC (the subscriptions table has no client write grant).
//
// Authorization model (same as quotes-service, ADR-0030): invoked via
// supabase.functions.invoke(...), which forwards the caller's own Supabase auth JWT; this function
// creates its OWN supabase-js client scoped to THAT JWT — never a service-role key — so every read
// still passes through RLS, and every write goes through an is_org_admin()-gated definer RPC. This
// is orchestration only: Razorpay is the system of record for payment state, the razorpay-webhook
// function is the system of record for subscription status.
//
// Secrets (Edge Function config): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (Basic-auth the Razorpay
// API), RAZORPAY_PLAN_ID (the one Plan created once in the Razorpay dashboard). SUPABASE_URL /
// SUPABASE_ANON_KEY are auto-injected.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const RAZORPAY_API = 'https://api.razorpay.com/v1'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

interface CreatePayload {
  action: 'create_subscription'
  orgId: string
}
interface CancelPayload {
  action: 'cancel_subscription'
  orgId: string
}
type Payload = CreatePayload | CancelPayload

function razorpayAuthHeader(): string {
  const id = Deno.env.get('RAZORPAY_KEY_ID')
  const secret = Deno.env.get('RAZORPAY_KEY_SECRET')
  if (!id || !secret) throw new Error('Razorpay keys are not configured')
  return 'Basic ' + btoa(`${id}:${secret}`)
}

async function razorpay(path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${RAZORPAY_API}${path}`, {
    method,
    headers: { Authorization: razorpayAuthHeader(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { error?: { description?: string } })?.error?.description ?? `Razorpay ${res.status}`
    throw new Error(msg)
  }
  return data as Record<string, unknown>
}

// Verify the caller is an Owner/Admin of the org BEFORE touching Razorpay, so a non-admin can never
// create an orphan subscription at the payment provider. Reads the caller's own membership row
// (RLS-visible) — no elevated access needed.
async function assertOrgAdmin(supabase: SupabaseClient, orgId: string, userId: string): Promise<void> {
  const { data } = await supabase.from('memberships').select('role').eq('org_id', orgId).eq('user_id', userId).maybeSingle()
  const role = (data as { role?: string } | null)?.role
  if (role !== 'owner' && role !== 'admin') throw new Error('Only an Owner or Admin can manage billing')
}

async function handleCreate(supabase: SupabaseClient, orgId: string, userId: string): Promise<Response> {
  await assertOrgAdmin(supabase, orgId, userId)

  const planId = Deno.env.get('RAZORPAY_PLAN_ID')
  if (!planId) return jsonResponse({ error: 'RAZORPAY_PLAN_ID is not configured' }, 500)

  // Authoritative seat count via the definer RPC (the JWT client can't count other members' rows).
  const { data: seatData, error: seatErr } = await supabase.rpc('org_seat_count', { p_org_id: orgId })
  if (seatErr) return jsonResponse({ error: seatErr.message }, 400)
  const seats = Math.max(Number(seatData) || 1, 1)

  // total_count is the number of billing cycles Razorpay will attempt (12 monthly = one year, then
  // it renews on re-subscribe). quantity = seats for per-seat pricing. Razorpay returns short_url —
  // the hosted authorization page where the owner approves the recurring mandate (UPI AutoPay/card).
  const sub = await razorpay('/subscriptions', 'POST', {
    plan_id: planId,
    total_count: 12,
    quantity: seats,
    customer_notify: 1,
    notes: { org_id: orgId },
  })

  const subscriptionId = String(sub.id)
  const customerId = sub.customer_id ? String(sub.customer_id) : ''
  const shortUrl = sub.short_url ? String(sub.short_url) : null

  const { error: storeErr } = await supabase.rpc('set_subscription_razorpay_ids', {
    p_org_id: orgId,
    p_customer_id: customerId,
    p_subscription_id: subscriptionId,
    p_seats: seats,
  })
  if (storeErr) return jsonResponse({ error: storeErr.message }, 400)

  return jsonResponse({ data: { subscriptionId, shortUrl, seats } })
}

async function handleCancel(supabase: SupabaseClient, orgId: string, userId: string): Promise<Response> {
  await assertOrgAdmin(supabase, orgId, userId)
  const { data: sub } = await supabase.from('subscriptions').select('razorpay_subscription_id').eq('org_id', orgId).maybeSingle()
  const rzpId = (sub as { razorpay_subscription_id?: string } | null)?.razorpay_subscription_id
  if (!rzpId) return jsonResponse({ error: 'No active Razorpay subscription to cancel' }, 400)
  // cancel_at_cycle_end:0 cancels now. The status flip to 'cancelled' arrives via the
  // subscription.cancelled webhook (that function is the source of truth for status).
  await razorpay(`/subscriptions/${rzpId}/cancel`, 'POST', { cancel_at_cycle_end: 0 })
  return jsonResponse({ data: { cancelled: true } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    if (!user) return jsonResponse({ error: 'Not authenticated' }, 401)

    const payload = (await req.json()) as Payload
    if (!payload?.orgId) return jsonResponse({ error: 'orgId is required' }, 400)

    switch (payload.action) {
      case 'create_subscription':
        return await handleCreate(supabase, payload.orgId, user.id)
      case 'cancel_subscription':
        return await handleCancel(supabase, payload.orgId, user.id)
      default:
        return jsonResponse({ error: 'Unknown action' }, 400)
    }
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Unexpected error' }, 400)
  }
})
