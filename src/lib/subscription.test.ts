import { describe, expect, it } from 'vitest'
import { isSubscriptionActive, mapRazorpayEventToStatus, subscriptionChip, trialDaysLeft } from './subscription'
import type { Subscription } from '../types/billing'

const NOW = new Date('2026-07-18T12:00:00Z')
const future = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()

function sub(overrides: Partial<Subscription>): Subscription {
  return {
    id: 's1',
    org_id: 'o1',
    status: 'trialing',
    plan_tier: 'starter',
    seats: 1,
    razorpay_customer_id: null,
    razorpay_subscription_id: null,
    trial_ends_at: future(14),
    current_period_end: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  }
}

describe('isSubscriptionActive (mirrors the DB subscription_active predicate)', () => {
  it('active status is always active regardless of trial date', () => {
    expect(isSubscriptionActive('active', null, NOW)).toBe(true)
  })
  it('trialing is active while the trial is in the future', () => {
    expect(isSubscriptionActive('trialing', future(1), NOW)).toBe(true)
  })
  it('trialing is INACTIVE once the trial has passed', () => {
    expect(isSubscriptionActive('trialing', future(-1), NOW)).toBe(false)
  })
  it('trialing with no trial date is inactive', () => {
    expect(isSubscriptionActive('trialing', null, NOW)).toBe(false)
  })
  it('past_due and cancelled are inactive', () => {
    expect(isSubscriptionActive('past_due', future(30), NOW)).toBe(false)
    expect(isSubscriptionActive('cancelled', null, NOW)).toBe(false)
  })
  it('missing subscription is inactive', () => {
    expect(isSubscriptionActive(null, null, NOW)).toBe(false)
    expect(isSubscriptionActive(undefined, null, NOW)).toBe(false)
  })
})

describe('trialDaysLeft', () => {
  it('rounds up partial days and floors at 0 once expired', () => {
    expect(trialDaysLeft(future(13.2), NOW)).toBe(14)
    expect(trialDaysLeft(future(-2), NOW)).toBe(0)
    expect(trialDaysLeft(null, NOW)).toBeNull()
  })
})

describe('subscriptionChip', () => {
  it('labels active, trial (with day count), payment-due, and cancelled', () => {
    expect(subscriptionChip(sub({ status: 'active' }), NOW)).toEqual({ label: 'Active', tone: 'good' })
    expect(subscriptionChip(sub({ status: 'trialing', trial_ends_at: future(10) }), NOW)).toEqual({
      label: 'Trial · 10 days left',
      tone: 'good',
    })
    expect(subscriptionChip(sub({ status: 'trialing', trial_ends_at: future(2) }), NOW).tone).toBe('warn')
    expect(subscriptionChip(sub({ status: 'trialing', trial_ends_at: future(-1) }), NOW)).toEqual({
      label: 'Trial ended',
      tone: 'warn',
    })
    expect(subscriptionChip(sub({ status: 'past_due' }), NOW).label).toBe('Payment due')
    expect(subscriptionChip(null, NOW)).toEqual({ label: 'No subscription', tone: 'muted' })
  })
})

describe('mapRazorpayEventToStatus (must match the razorpay-webhook Edge Function)', () => {
  it('maps charge/activate/resume to active', () => {
    expect(mapRazorpayEventToStatus('subscription.activated')).toBe('active')
    expect(mapRazorpayEventToStatus('subscription.charged')).toBe('active')
  })
  it('maps halt/pending to past_due and cancel/complete to cancelled', () => {
    expect(mapRazorpayEventToStatus('subscription.halted')).toBe('past_due')
    expect(mapRazorpayEventToStatus('subscription.cancelled')).toBe('cancelled')
    expect(mapRazorpayEventToStatus('subscription.completed')).toBe('cancelled')
  })
  it('ignores unknown events', () => {
    expect(mapRazorpayEventToStatus('subscription.updated')).toBeNull()
    expect(mapRazorpayEventToStatus('payment.captured')).toBeNull()
  })
})
