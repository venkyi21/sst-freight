import type { WalletTransaction } from '../types/referral'

// Pure referral/wallet math (ADR-0036), extracted for unit testing (ADR-0026). These mirror the
// server-side computations (record_referral_cycle / wallet_balance) so the UI can show the same
// numbers without a round-trip. The server remains the source of truth.

// The referrer earns 15% of the referee's plan, capped at the referrer's own monthly plan — the
// cap is the exact anti-cannibalization guard from the design (a big account can't shave 15% off a
// huge bill by referring a tiny one).
export function referralReward(refereePlanInr: number, referrerPlanInr: number): number {
  return Math.round(Math.min(refereePlanInr * 0.15, referrerPlanInr) * 100) / 100
}

// Wallet balance = sum of credits minus sum of debits.
export function walletBalance(txns: WalletTransaction[]): number {
  return txns.reduce((bal, t) => bal + (t.type === 'credit' ? t.amount_inr : -t.amount_inr), 0)
}
