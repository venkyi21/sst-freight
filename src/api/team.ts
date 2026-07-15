import { supabase } from '../lib/supabaseClient'
import type { MembershipRole, OrgMember } from '../types'

export async function fetchOrgMembers(orgId: string): Promise<{ data: OrgMember[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_org_members', { p_org_id: orgId })
  return { data: (data as OrgMember[] | null) ?? null, error: error?.message ?? null }
}

export async function updateMemberRole(membershipId: string, newRole: MembershipRole): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('update_member_role', { p_membership_id: membershipId, p_new_role: newRole })
  return { error: error?.message ?? null }
}

export async function removeMember(membershipId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('remove_member', { p_membership_id: membershipId })
  return { error: error?.message ?? null }
}
