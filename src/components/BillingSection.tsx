import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { subscriptionQueryKey, useSubscription } from '../hooks/useSubscription'
import { cancelSubscription, createSubscription } from '../api/billing'
import { subscriptionChip } from '../lib/subscription'
import { STARTER_PLAN, type OrganizationWithRole } from '../types'
import { T } from '../theme/tokens'

interface BillingSectionProps {
  org: OrganizationWithRole
  canEdit: boolean
}

const chipColor = { good: T.success, warn: T.warning, muted: T.muted } as const
const chipBg = { good: T.successWash, warn: T.warningWash, muted: T.bg } as const

// Billing (ADR-0034): shows the org's subscription state and the one launch plan. Owner/Admin can
// start (or cancel) the Razorpay subscription; the hosted-authorization page opens in this tab.
export default function BillingSection({ org, canEdit }: BillingSectionProps) {
  const { data: sub, isLoading } = useSubscription(org.id)
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chip = subscriptionChip(sub ?? null)
  const isActivePaid = sub?.status === 'active'

  async function handleSubscribe() {
    setError(null)
    setBusy(true)
    const { shortUrl, error: err } = await createSubscription(org.id)
    setBusy(false)
    if (err || !shortUrl) {
      setError(err ?? 'Could not start the subscription. Please try again.')
      return
    }
    // Redirect the owner to Razorpay's hosted page to approve the recurring mandate.
    window.location.href = shortUrl
  }

  async function handleCancel() {
    setError(null)
    setBusy(true)
    const { error: err } = await cancelSubscription(org.id)
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    void queryClient.invalidateQueries({ queryKey: subscriptionQueryKey(org.id) })
  }

  return (
    <div style={{ marginTop: 36, paddingTop: 24, borderTop: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: T.ink }}>Billing</h2>
        {!isLoading && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: chipColor[chip.tone],
              background: chipBg[chip.tone],
              border: `1px solid ${chip.tone === 'muted' ? T.border : 'transparent'}`,
              padding: '3px 9px',
              borderRadius: 20,
            }}
          >
            ● {chip.label}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: T.faint, marginBottom: 18 }}>
        {STARTER_PLAN.label} plan — ₹{STARTER_PLAN.priceInr.toLocaleString('en-IN')} {STARTER_PLAN.perLabel}. 14-day free
        trial, then monthly. Your data always stays visible; only creating new records needs an active subscription.
      </div>

      {sub && (
        <div
          style={{
            background: T.bg,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: '12px 14px',
            marginBottom: 16,
            fontSize: 12.5,
            color: T.text,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}
        >
          <div><span style={{ color: T.faint }}>Seats</span><br />{sub.seats}</div>
          <div>
            <span style={{ color: T.faint }}>{isActivePaid ? 'Renews' : 'Trial ends'}</span>
            <br />
            {(isActivePaid ? sub.current_period_end : sub.trial_ends_at)?.slice(0, 10) ?? '—'}
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: 16,
            background: T.dangerWash,
            border: `1px solid ${T.dangerBorder}`,
            color: T.danger,
            fontSize: 12.5,
            borderRadius: 8,
            padding: '9px 12px',
          }}
        >
          {error}
        </div>
      )}

      {!canEdit && (
        <div style={{ fontSize: 11.5, color: T.faint }}>Only an Owner or Admin can manage billing.</div>
      )}

      {canEdit && !isActivePaid && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSubscribe()}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            background: busy ? T.surfaceInset : T.accent,
            color: T.onAccent,
            fontWeight: 600,
            fontSize: 13,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Starting…' : 'Subscribe now'}
        </button>
      )}

      {canEdit && isActivePaid && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleCancel()}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            background: 'transparent',
            color: T.muted,
            fontWeight: 600,
            fontSize: 13,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Cancelling…' : 'Cancel subscription'}
        </button>
      )}
    </div>
  )
}
