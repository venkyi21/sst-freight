import { supabase } from '../lib/supabaseClient'
import type { Subscription } from '../types/billing'

export async function fetchSubscription(orgId: string): Promise<{ data: Subscription | null; error: string | null }> {
  const { data, error } = await supabase.from('subscriptions').select('*').eq('org_id', orgId).maybeSingle()
  return { data: (data as Subscription | null) ?? null, error: error?.message ?? null }
}

// Supabase surfaces any 4xx/5xx from a function as the generic "Edge Function returned a non-2xx
// status code". Pull the function's real { error } message out of the response body so the UI shows
// the actual reason (e.g. "No active Razorpay subscription to cancel") instead of that placeholder.
async function invokeErrorMessage(error: { message: string; context?: { json(): Promise<{ error?: string }> } }): Promise<string> {
  try {
    const j = await error.context?.json()
    if (j?.error) return j.error
  } catch {
    /* fall back to the generic message */
  }
  return error.message
}

// Kicks off a Razorpay subscription and returns the hosted-authorization short_url the owner opens
// to approve the recurring mandate. Mirrors src/api/quotes.ts's Edge Function call shape.
export async function createSubscription(orgId: string): Promise<{ shortUrl: string | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('billing-service', {
    body: { action: 'create_subscription', orgId },
  })
  if (error) return { shortUrl: null, error: await invokeErrorMessage(error) }
  if (data?.error) return { shortUrl: null, error: data.error as string }
  return { shortUrl: (data?.data?.shortUrl as string | null) ?? null, error: null }
}

export async function cancelSubscription(orgId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke('billing-service', {
    body: { action: 'cancel_subscription', orgId },
  })
  if (error) return { error: await invokeErrorMessage(error) }
  if (data?.error) return { error: data.error as string }
  return { error: null }
}
