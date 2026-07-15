import { useEffect, useState, type CSSProperties } from 'react'
import { dismissOnboarding, fetchOnboardingCounts, fetchOnboardingState } from '../api/onboarding'
import type { NavPage } from '../types'

interface OnboardingChecklistProps {
  orgId: string
  userId: string
  onNavigate: (page: NavPage) => void
}

interface Step {
  key: string
  label: string
  done: boolean
  targetPage: NavPage
  cta: string
}

const cardStyle: CSSProperties = {
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: 12,
  padding: '20px 24px',
  marginBottom: 20,
}

// GAP 03 (ADR-0024): step "done" state is derived from whether the org actually has real data in
// each table — not a self-reported checkbox — so this reflects genuine progress, not clicks.
export default function OnboardingChecklist({ orgId, userId, onNavigate }: OnboardingChecklistProps) {
  const [rowId, setRowId] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<boolean | null>(null) // null = still loading
  const [counts, setCounts] = useState<{
    contacts: number
    quotes: number
    shipments: number
    invoices: number
    customsFilings: number
  } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchOnboardingState(orgId, userId).then((data) => {
      if (cancelled) return
      setRowId(data?.id ?? null)
      setDismissed(data?.dismissed ?? false)
    })
    return () => {
      cancelled = true
    }
  }, [orgId, userId])

  useEffect(() => {
    let cancelled = false
    fetchOnboardingCounts(orgId).then((data) => {
      if (!cancelled) setCounts(data)
    })
    return () => {
      cancelled = true
    }
  }, [orgId])

  async function handleDismiss() {
    setBusy(true)
    const id = await dismissOnboarding(orgId, userId, rowId)
    setRowId(id)
    setDismissed(true)
    setBusy(false)
  }

  if (dismissed !== false || !counts) return null

  const steps: Step[] = [
    { key: 'contact', label: 'Add your first contact', done: counts.contacts > 0, targetPage: 'directory', cta: 'Go to Directory' },
    { key: 'quote', label: 'Create a quote', done: counts.quotes > 0, targetPage: 'quotes', cta: 'Go to Quotes' },
    { key: 'booking', label: 'Create your first booking', done: counts.shipments > 0, targetPage: 'quotes', cta: 'Go to Quotes' },
    { key: 'invoice', label: 'Generate an invoice', done: counts.invoices > 0, targetPage: 'accounting', cta: 'Go to Accounting' },
    { key: 'customs', label: 'Try the SCMTR compliance check', done: counts.customsFilings > 0, targetPage: 'customs', cta: 'Go to Customs Filings' },
  ]
  const doneCount = steps.filter((s) => s.done).length
  if (doneCount === steps.length) return null // everything genuinely done — nothing left to nudge

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 3 }}>Getting Started</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{doneCount} of {steps.length} done</div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleDismiss()}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            fontSize: 12,
            cursor: busy ? 'not-allowed' : 'pointer',
            fontWeight: 600,
          }}
        >
          Hide this
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((s) => (
          <div
            key={s.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '9px 12px',
              borderRadius: 8,
              background: s.done ? 'rgba(34,197,94,0.06)' : '#0b1220',
              border: `1px solid ${s.done ? 'rgba(34,197,94,0.2)' : '#1e293b'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: s.done ? '#4ade80' : 'transparent',
                  border: s.done ? 'none' : '1.5px solid #334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  color: '#0b1220',
                  flexShrink: 0,
                }}
              >
                {s.done ? '✓' : ''}
              </div>
              <span style={{ fontSize: 13, color: s.done ? '#86efac' : '#cbd5e1', textDecoration: s.done ? 'line-through' : 'none' }}>
                {s.label}
              </span>
            </div>
            {!s.done && (
              <button
                type="button"
                onClick={() => onNavigate(s.targetPage)}
                style={{
                  background: 'none',
                  border: '1px solid #1e293b',
                  borderRadius: 6,
                  color: '#94a3b8',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '4px 9px',
                  cursor: 'pointer',
                }}
              >
                {s.cta}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
