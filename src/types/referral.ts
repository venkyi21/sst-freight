// Referral program + wallet (ADR-0036). A referral_code (on organizations) links a new org
// (referee) back to a referrer. All rows are read-only to the client — written only by definer RPCs.

export type ReferralStatus = 'pending' | 'released' | 'blocked'

export interface Referral {
  id: string
  referrer_org_id: string
  referee_org_id: string
  status: ReferralStatus
  paid_cycles: number
  reward_amount_inr: number | null
  created_at: string
  released_at: string | null
}

export type WalletTxnType = 'credit' | 'debit'
export type WalletTxnReason = 'referral_reward' | 'applied_to_invoice' | 'adjustment'

export interface WalletTransaction {
  id: string
  org_id: string
  type: WalletTxnType
  amount_inr: number
  reason: WalletTxnReason
  referral_id: string | null
  created_at: string
}

// The referral terms (ADR-0036), for display. The reward % and cap are enforced server-side in
// record_referral_cycle; these constants keep the UI copy in one place.
export const REFERRAL_TERMS = {
  rewardPct: 15,
  refereeTrialBonusDays: 30,
  releaseAfterCycles: 2,
} as const
