import { supabase } from '../lib/supabaseClient'
import type { PublicTrackingData } from '../types'

// Only RPC granted to the `anon` role (ADR-0008/0009) — no session required.
export async function fetchPublicTracking(token: string): Promise<{ data: PublicTrackingData | null; error: boolean }> {
  const { data, error } = await supabase.rpc('get_public_shipment_tracking', { p_token: token })
  return { data: (data as PublicTrackingData | null) ?? null, error: Boolean(error) || !data }
}
