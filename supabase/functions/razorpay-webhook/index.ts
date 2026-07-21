// razorpay-webhook: the source of truth for subscription STATUS (ADR-0034). Razorpay calls this on
// every subscription lifecycle event. There is no Supabase session on these requests, so this
// function MUST be deployed with Verify-JWT OFF. Security comes entirely from the HMAC signature:
// the raw body is verified against RAZORPAY_WEBHOOK_SECRET before anything is written, then a single
// anon-granted SECURITY DEFINER RPC (apply_razorpay_event) applies the change — same trust model as
// ADR-0029 (possession of a verified credential IS the authorization).
//
// Secret (Edge Function config): RAZORPAY_WEBHOOK_SECRET (set to the same value in the Razorpay
// dashboard's webhook config). SUPABASE_URL / SUPABASE_ANON_KEY are auto-injected.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2'

// Razorpay subscription event -> our status. Kept in sync with src/lib/subscription.ts
// (mapRazorpayEventToStatus) which the unit tests cover.
function mapEventToStatus(event: string): 'active' | 'past_due' | 'cancelled' | null {
  switch (event) {
    case 'subscription.activated':
    case 'subscription.charged':
    case 'subscription.resumed':
      return 'active'
    case 'subscription.pending':
    case 'subscription.halted':
      return 'past_due'
    case 'subscription.cancelled':
    case 'subscription.completed':
      return 'cancelled'
    default:
      return null
  }
}

// Constant-time-ish hex HMAC-SHA256 verification via Web Crypto (available in the Edge runtime).
async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  if (!signature) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('')
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')
  if (!secret) return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), { status: 500 })

  const rawBody = await req.text()
  const signature = req.headers.get('X-Razorpay-Signature') ?? ''
  if (!(await verifySignature(rawBody, signature, secret))) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 })
  }

  let event: { event?: string; payload?: { subscription?: { entity?: { id?: string; current_end?: number } } } }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new Response(JSON.stringify({ error: 'Bad JSON' }), { status: 400 })
  }

  const status = mapEventToStatus(event.event ?? '')
  const entity = event.payload?.subscription?.entity
  // Events we don't track (or with no subscription id) are acknowledged 200 so Razorpay stops
  // retrying — they're simply not relevant to our status model.
  if (!status || !entity?.id) return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200 })

  const periodEnd = entity.current_end ? new Date(entity.current_end * 1000).toISOString() : null
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
  const { error } = await supabase.rpc('apply_razorpay_event', {
    p_razorpay_subscription_id: entity.id,
    p_status: status,
    p_current_period_end: periodEnd,
  })
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  // Referral cycle counting (ADR-0036): only a real charge counts toward the referee's 2 paid cycles
  // that release the referrer's reward. subscription.activated (the initial authorization) does not.
  if (event.event === 'subscription.charged') {
    const { error: refErr } = await supabase.rpc('record_referral_cycle', { p_razorpay_subscription_id: entity.id })
    if (refErr) return new Response(JSON.stringify({ error: refErr.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
