import { useSubscription } from '../hooks/useSubscription'
import { isSubscriptionActive } from '../lib/subscription'
import type { OrganizationWithRole } from '../types'
import { T } from '../theme/tokens'

interface SubscriptionBannerProps {
  org: OrganizationWithRole
  onGoToBilling: () => void
}

// Soft-block banner (ADR-0034): shows only when the org's subscription is inactive (trial ended or
// payment failed). Mirrors the DB trigger — the app still works read-only, but creating new records
// is blocked, so this bar tells the user why and (for an owner/admin) how to fix it.
export default function SubscriptionBanner({ org, onGoToBilling }: SubscriptionBannerProps) {
  const { data: sub } = useSubscription(org.id)
  if (sub === undefined) return null // still loading — don't flash the bar
  if (isSubscriptionActive(sub?.status, sub?.trial_ends_at ?? null)) return null

  const canManage = org.role === 'owner' || org.role === 'admin'
  const reason = sub?.status === 'past_due' ? 'A payment failed' : 'Your free trial has ended'

  return (
    <div
      role="status"
      style={{
        flexShrink: 0,
        background: T.warningWash,
        borderBottom: `1px solid ${T.warningBorder}`,
        color: T.warning,
        padding: '10px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      <span>
        <strong>{reason}.</strong>{' '}
        {canManage
          ? 'Subscribe to keep creating bookings, quotes and invoices — your existing data stays visible.'
          : 'Ask your organization owner to subscribe. You can still view existing data.'}
      </span>
      {canManage && (
        <button
          type="button"
          onClick={onGoToBilling}
          style={{
            flexShrink: 0,
            background: T.warning,
            color: T.onAccent ?? '#fff',
            border: 'none',
            borderRadius: 7,
            padding: '7px 14px',
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Go to Billing
        </button>
      )}
    </div>
  )
}
