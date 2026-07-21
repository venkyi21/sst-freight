import type { Subscription, SubscriptionStatus } from '../types/billing'

// Pure subscription logic (ADR-0034), extracted for unit testing (ADR-0026) — this is the exact
// predicate the DB's subscription_active() enforces, mirrored client-side so the UI can gate
// buttons and show the banner without a round-trip. Keep the two in sync.

export function isSubscriptionActive(
  status: SubscriptionStatus | null | undefined,
  trialEndsAt: string | null,
  now: Date = new Date(),
): boolean {
  if (status === 'active') return true
  if (status === 'trialing') return trialEndsAt != null && now.getTime() < new Date(trialEndsAt).getTime()
  return false
}

// Whole calendar days remaining in a trial (0 once it has passed). Null when there's no trial date.
export function trialDaysLeft(trialEndsAt: string | null, now: Date = new Date()): number | null {
  if (!trialEndsAt) return null
  const ms = new Date(trialEndsAt).getTime() - now.getTime()
  return ms <= 0 ? 0 : Math.ceil(ms / (1000 * 60 * 60 * 24))
}

export interface SubscriptionChip {
  label: string
  tone: 'good' | 'warn' | 'muted'
}

export function subscriptionChip(sub: Subscription | null, now: Date = new Date()): SubscriptionChip {
  if (!sub) return { label: 'No subscription', tone: 'muted' }
  if (sub.status === 'active') return { label: 'Active', tone: 'good' }
  if (sub.status === 'trialing') {
    const days = trialDaysLeft(sub.trial_ends_at, now) ?? 0
    return days > 0
      ? { label: `Trial · ${days} day${days === 1 ? '' : 's'} left`, tone: days <= 3 ? 'warn' : 'good' }
      : { label: 'Trial ended', tone: 'warn' }
  }
  if (sub.status === 'past_due') return { label: 'Payment due', tone: 'warn' }
  return { label: 'Cancelled', tone: 'warn' }
}

// Whether to show the always-visible trial/billing badge (ADR-0034 "loud trial"): only when the
// subscription needs attention — trialing (show the countdown) or past_due (show "Payment due").
// An active/paid org (or a cancelled one) gets no header nag.
export function shouldShowTrialBadge(sub: Subscription | null | undefined): boolean {
  return sub?.status === 'trialing' || sub?.status === 'past_due'
}

// Razorpay subscription event -> our status. Kept in sync with the razorpay-webhook Edge Function's
// mapEventToStatus (they must agree). Unknown/untracked events map to null (ignored).
export function mapRazorpayEventToStatus(event: string): SubscriptionStatus | null {
  switch (event) {
    case 'subscription.activated':
    case 'subscription.charged':
    case 'subscription.resumed':
      return 'active'
    case 'subscription.pending':
    case 'subscription.halted':
      return 'past_due'
    case 'subscription.cancelled':
    case 'subscription.completed':
      return 'cancelled'
    default:
      return null
  }
}
