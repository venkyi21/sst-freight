import { supabase } from '../lib/supabaseClient'
import type { Membership, Organization } from '../types'

export async function fetchMembershipsForCurrentUser(): Promise<{ data: Pick<Membership, 'org_id' | 'role'>[] | null; error: string | null }> {
  const { data, error } = await supabase.from('memberships').select('org_id, role')
  return { data: (data as Pick<Membership, 'org_id' | 'role'>[] | null) ?? null, error: error?.message ?? null }
}

export async function fetchOrganizationsByIds(orgIds: string[]): Promise<{ data: Organization[] | null; error: string | null }> {
  const { data, error } = await supabase.from('organizations').select('*').in('id', orgIds)
  return { data: (data as Organization[] | null) ?? null, error: error?.message ?? null }
}

export async function checkIsPlatformAdmin(): Promise<boolean> {
  const { data } = await supabase.rpc('is_platform_admin')
  return Boolean(data)
}

export async function createOrganizationRpc(
  name: string,
  color: string,
  referralCode?: string | null,
): Promise<{ data: Organization | null; error: string | null }> {
  const args: Record<string, unknown> = { p_name: name, p_color: color }
  if (referralCode) args.p_referral_code = referralCode // ADR-0036: link this new org to a referrer
  const { data, error } = await supabase.rpc('create_organization', args).single()
  return { data: (data as Organization | null) ?? null, error: error?.message ?? null }
}

export async function joinOrganizationRpc(inviteCode: string): Promise<{ data: Organization | null; error: string | null }> {
  const { data, error } = await supabase.rpc('join_organization', { p_invite_code: inviteCode }).single()
  return { data: (data as Organization | null) ?? null, error: error?.message ?? null }
}

export async function uploadOrgLogo(orgId: string, file: File): Promise<{ url: string | null; error: string | null }> {
  const path = `${orgId}/logo`
  const { error: uploadError } = await supabase.storage.from('org-logos').upload(path, file, { upsert: true })
  if (uploadError) return { url: null, error: uploadError.message }
  const { data } = supabase.storage.from('org-logos').getPublicUrl(path)
  return { url: `${data.publicUrl}?v=${Date.now()}`, error: null }
}

export async function updateOrgBranding(orgId: string, color: string, logoUrl: string | null): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_org_branding', { p_org_id: orgId, p_color: color, p_logo_url: logoUrl })
  return { error: error?.message ?? null }
}

export async function updateOrgGstSettings(
  orgId: string,
  gstState: string | null,
  gstin: string | null,
  legalName: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_org_gst_settings', {
    p_org_id: orgId,
    p_gst_state: gstState,
    p_gstin: gstin,
    p_legal_name: legalName,
  })
  return { error: error?.message ?? null }
}
