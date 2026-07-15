import { supabase } from '../lib/supabaseClient'
import type { BillingModel, PlatformModule, PlatformOrgSummary, PlatformRevenueEntry } from '../types'

export async function listAllOrganizations(): Promise<{ data: PlatformOrgSummary[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_all_organizations')
  return { data: (data as PlatformOrgSummary[] | null) ?? null, error: error?.message ?? null }
}

export async function listAllPlatformRevenue(): Promise<{ data: PlatformRevenueEntry[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_platform_revenue', { p_org_id: null })
  return { data: (data as PlatformRevenueEntry[] | null) ?? null, error: error?.message ?? null }
}

export async function setOrgBillingModel(orgId: string, model: BillingModel): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_org_billing_model', { p_org_id: orgId, p_model: model })
  return { error: error?.message ?? null }
}

export async function setOrgConfig(orgId: string, monthlyFeeInr: number, enabledModules: PlatformModule[]): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_org_config', { p_org_id: orgId, p_monthly_fee_inr: monthlyFeeInr, p_enabled_modules: enabledModules })
  return { error: error?.message ?? null }
}
