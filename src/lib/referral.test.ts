import { describe, expect, it } from 'vitest'
import { referralReward, walletBalance } from './referral'
import type { WalletTransaction } from '../types/referral'

describe('referralReward — 15% of referee plan, capped at referrer plan', () => {
  it('applies the full 15% when it is below the referrer cap', () => {
    expect(referralReward(2000, 2000)).toBe(300) // 15% of 2000
    expect(referralReward(4000, 4000)).toBe(600)
  })
  it('caps at the referrer own plan when 15% would exceed it', () => {
    expect(referralReward(100000, 2000)).toBe(2000) // 15% = 15000, capped to 2000
  })
  it("anti-cannibalization: a big referrer referring a small account earns only 15% of the SMALL plan", () => {
    // the mockup's ₹3,750 referee / ₹75,000 referrer case — reward is small, not 15% of the big bill
    expect(referralReward(3750, 75000)).toBe(562.5)
  })
})

describe('walletBalance — credits minus debits', () => {
  const txn = (type: 'credit' | 'debit', amount_inr: number): WalletTransaction => ({
    id: crypto.randomUUID(),
    org_id: 'o1',
    type,
    amount_inr,
    reason: type === 'credit' ? 'referral_reward' : 'applied_to_invoice',
    referral_id: null,
    created_at: '2026-07-21T00:00:00Z',
  })
  it('sums credits and subtracts debits', () => {
    expect(walletBalance([txn('credit', 300), txn('credit', 300), txn('debit', 200)])).toBe(400)
  })
  it('is 0 for an empty ledger', () => {
    expect(walletBalance([])).toBe(0)
  })
})
