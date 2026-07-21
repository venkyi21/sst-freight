import { supabase } from '../lib/supabaseClient'
import type { Referral, WalletTransaction } from '../types/referral'

export async function fetchReferrals(orgId: string): Promise<{ data: Referral[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('referrals')
    .select('*')
    .eq('referrer_org_id', orgId)
    .order('created_at', { ascending: false })
  return { data: (data as Referral[] | null) ?? null, error: error?.message ?? null }
}

export async function fetchWalletTransactions(orgId: string): Promise<{ data: WalletTransaction[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  return { data: (data as WalletTransaction[] | null) ?? null, error: error?.message ?? null }
}

export async function fetchWalletBalance(orgId: string): Promise<number> {
  const { data } = await supabase.rpc('wallet_balance', { p_org_id: orgId })
  return Number(data) || 0
}

// Records a debit against the wallet (the ledger's debit side, ADR-0036 MVP). Owner/Admin only.
export async function applyWalletCredit(orgId: string, amount: number): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('apply_wallet_credit', { p_org_id: orgId, p_amount: amount })
  return { error: error?.message ?? null }
}
