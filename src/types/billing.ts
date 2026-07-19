// SaaS subscription billing (ADR-0034). One subscription row per org, read-only to the client
// (written only by create_organization, the billing-service definer RPCs, and the webhook).

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled'

export interface Subscription {
  id: string
  org_id: string
  status: SubscriptionStatus
  plan_tier: string
  seats: number
  razorpay_customer_id: string | null
  razorpay_subscription_id: string | null
  trial_ends_at: string | null
  current_period_end: string | null
  created_at: string
  updated_at: string
}

// The single launch plan (ADR-0034: "one plan now"). Price is display-only — the authoritative
// amount lives in the Razorpay Plan referenced by RAZORPAY_PLAN_ID.
export const STARTER_PLAN = {
  tier: 'starter',
  label: 'Starter',
  priceInr: 2000,
  perLabel: 'per seat / month',
} as const
