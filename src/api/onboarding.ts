import { supabase } from '../lib/supabaseClient'
import type { UserOnboardingState } from '../types'

export async function fetchOnboardingState(orgId: string, userId: string): Promise<UserOnboardingState | null> {
  const { data } = await supabase.from('user_onboarding_state').select('*').eq('org_id', orgId).eq('user_id', userId).maybeSingle()
  return (data as UserOnboardingState | null) ?? null
}

export interface OnboardingCounts {
  contacts: number
  quotes: number
  shipments: number
  invoices: number
  customsFilings: number
}

export async function fetchOnboardingCounts(orgId: string): Promise<OnboardingCounts> {
  const [contacts, quotes, shipments, invoices, customsFilings] = await Promise.all([
    supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('shipments').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('customs_filings').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
  ])
  return {
    contacts: contacts.count ?? 0,
    quotes: quotes.count ?? 0,
    shipments: shipments.count ?? 0,
    invoices: invoices.count ?? 0,
    customsFilings: customsFilings.count ?? 0,
  }
}

export async function dismissOnboarding(orgId: string, userId: string, rowId: string | null): Promise<string | null> {
  if (rowId) {
    await supabase.from('user_onboarding_state').update({ dismissed: true }).eq('id', rowId)
    return rowId
  }
  const { data } = await supabase.from('user_onboarding_state').insert({ org_id: orgId, user_id: userId, dismissed: true }).select().single()
  return (data as { id: string } | null)?.id ?? null
}
