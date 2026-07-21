import { useSubscription } from '../hooks/useSubscription'
import { shouldShowTrialBadge, subscriptionChip } from '../lib/subscription'
import { T } from '../theme/tokens'

interface TrialBadgeProps {
  orgId: string
  onClick: () => void
}

const toneColor = { good: T.success, warn: T.warning, muted: T.muted } as const
const toneBg = { good: T.successWash, warn: T.warningWash, muted: T.bg } as const

// Always-visible trial/billing pill in the app header (ADR-0034 "loud trial"). Renders only while
// the subscription needs attention (trialing / past_due) so the countdown is never a surprise;
// clicking jumps to Billing. Active/paid orgs see nothing.
export default function TrialBadge({ orgId, onClick }: TrialBadgeProps) {
  const { data: sub } = useSubscription(orgId)
  if (!shouldShowTrialBadge(sub)) return null

  const chip = subscriptionChip(sub ?? null)
  return (
    <button
      type="button"
      onClick={onClick}
      title="Go to Billing"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
        fontSize: 12,
        fontWeight: 600,
        color: toneColor[chip.tone],
        background: toneBg[chip.tone],
        border: `1px solid ${chip.tone === 'warn' ? T.warningBorder : T.border}`,
        padding: '6px 12px',
        borderRadius: 20,
        cursor: 'pointer',
      }}
    >
      ● {chip.label}
    </button>
  )
}
