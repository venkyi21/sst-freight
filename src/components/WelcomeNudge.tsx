import { useState } from 'react'
import { useSubscription } from '../hooks/useSubscription'
import { trialDaysLeft } from '../lib/subscription'
import { T } from '../theme/tokens'

interface WelcomeNudgeProps {
  orgId: string
  onGoToBilling: () => void
}

// One-time welcome shown at the top of the Dashboard for a freshly-created (trialing) org (ADR-0034
// "loud trial") — the "start" signal, so a new user knows the trial began and how it works.
// Dismissal persists per org in localStorage; only ever shown while trialing.
export default function WelcomeNudge({ orgId, onGoToBilling }: WelcomeNudgeProps) {
  const storageKey = `sst-welcome-${orgId}`
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === '1'
    } catch {
      return false
    }
  })
  const { data: sub } = useSubscription(orgId)

  if (dismissed || sub?.status !== 'trialing') return null
  const days = trialDaysLeft(sub.trial_ends_at) ?? 14

  function dismiss() {
    try {
      localStorage.setItem(storageKey, '1')
    } catch {
      /* non-fatal — just won't persist */
    }
    setDismissed(true)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        background: T.accentWash,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 18,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 3 }}>
          Welcome to SST Freight 🎉
        </div>
        <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.5 }}>
          Your <strong>14-day free trial</strong> has started ({days} day{days === 1 ? '' : 's'} left) — explore every
          module, add real shipments, and invite your team. Add a plan anytime from{' '}
          <button
            type="button"
            onClick={onGoToBilling}
            style={{ background: 'none', border: 'none', padding: 0, color: T.info, fontWeight: 600, cursor: 'pointer', fontSize: 12.5 }}
          >
            Settings → Billing
          </button>
          .
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss welcome"
        style={{ background: 'none', border: 'none', color: T.muted, fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
      >
        ×
      </button>
    </div>
  )
}
