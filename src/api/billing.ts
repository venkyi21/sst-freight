import { supabase } from '../lib/supabaseClient'
import type { Subscription } from '../types/billing'

export async function fetchSubscription(orgId: string): Promise<{ data: Subscription | null; error: string | null }> {
  const { data, error } = await supabase.from('subscriptions').select('*').eq('org_id', orgId).maybeSingle()
  return { data: (data as Subscription | null) ?? null, error: error?.message ?? null }
}

// Kicks off a Razorpay subscription and returns the hosted-authorization short_url the owner opens
// to approve the recurring mandate. Mirrors src/api/quotes.ts's Edge Function call shape.
export async function createSubscription(orgId: string): Promise<{ shortUrl: string | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('billing-service', {
    body: { action: 'create_subscription', orgId },
  })
  if (error) {
    let msg = error.message
    try {
      const j = await (error as { context: { json(): Promise<{ error?: string }> } }).context.json()
      if (j?.error) msg = j.error
    } catch {
      /* keep the invoke message */
    }
    return { shortUrl: null, error: msg }
  }
  if (data?.error) return { shortUrl: null, error: data.error as string }
  return { shortUrl: (data?.data?.shortUrl as string | null) ?? null, error: null }
}

export async function cancelSubscription(orgId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke('billing-service', {
    body: { action: 'cancel_subscription', orgId },
  })
  if (error) return { error: error.message }
  if (data?.error) return { error: data.error as string }
  return { error: null }
}
