import { useState, type CSSProperties } from 'react'
import { useCustomsFilings, useInvalidateCustomsFilings } from '../hooks/useCustomsFilings'
import CustomsFilingWizard from './CustomsFilingWizard'
import { CUSTOMS_FILING_STATUS_META, CUSTOMS_FILING_TYPE_META, type CustomsFiling } from '../types'
import { T } from '../theme/tokens'

const headStyle: CSSProperties = {
  padding: '13px 20px',
  fontSize: 11,
  fontWeight: 600,
  color: T.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const cellStyle: CSSProperties = { padding: '14px 20px' }

interface CustomsFilingsPageProps {
  orgId: string
}

export default function CustomsFilingsPage({ orgId }: CustomsFilingsPageProps) {
  const { data: filings = [], isLoading: loading, error: errorObj } = useCustomsFilings(orgId)
  const error = errorObj instanceof Error ? errorObj.message : null
  const invalidateFilings = useInvalidateCustomsFilings(orgId)
  const [wizardOpen, setWizardOpen] = useState(false)

  function handleCreated(_filing: CustomsFiling) {
    invalidateFilings()
    setWizardOpen(false)
  }

  return (
    <div style={{ padding: '28px 32px', flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 14 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: T.ink }}>Customs Filings</h1>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          style={{
            background: T.accent,
            color: T.onAccent,
            border: 'none',
            fontWeight: 600,
            fontSize: 13,
            padding: '9px 16px',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          + New Filing
        </button>
      </div>
      <div style={{ fontSize: 12.5, color: T.faint, marginBottom: 20 }}>
        Simulated Bill of Entry / Shipping Bill filings — HS-code duty lookup and calculation only, no live ICEGATE submission.
      </div>

      {error ? (
        <div
          style={{
            background: T.dangerWash,
            border: `1px solid ${T.dangerBorder}`,
            borderRadius: 12,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ color: T.danger, fontSize: 13.5 }}>{error}</div>
        </div>
      ) : (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.rowStripe }}>
                <th style={headStyle}>Ref</th>
                <th style={headStyle}>Type</th>
                <th style={headStyle}>Goods</th>
                <th style={headStyle}>HS Code</th>
                <th style={headStyle}>Total Duty</th>
                <th style={headStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filings.map((f) => (
                <tr key={f.id} style={{ borderBottom: `1px solid ${T.surfaceRaised}` }}>
                  <td style={{ ...cellStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13, color: T.ink }}>
                    {f.ref}
                  </td>
                  <td style={{ ...cellStyle, fontSize: 12.5, color: T.muted }}>{CUSTOMS_FILING_TYPE_META[f.filing_type].shortLabel}</td>
                  <td style={{ ...cellStyle, fontSize: 12.5, color: T.text, maxWidth: 240 }}>{f.goods_description}</td>
                  <td style={{ ...cellStyle, fontSize: 12.5, fontFamily: "'IBM Plex Mono', monospace", color: T.muted }}>{f.hs_code ?? '—'}</td>
                  <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: T.success }}>
                    ₹{f.total_duty_inr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                  <td style={cellStyle}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '3px 9px',
                        borderRadius: 20,
                        color: CUSTOMS_FILING_STATUS_META[f.status].color,
                        background: CUSTOMS_FILING_STATUS_META[f.status].background,
                      }}
                    >
                      {CUSTOMS_FILING_STATUS_META[f.status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filings.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: T.placeholder, fontSize: 13 }}>No customs filings yet.</div>
          )}
          {loading && <div style={{ padding: 40, textAlign: 'center', color: T.placeholder, fontSize: 13 }}>Loading filings…</div>}
        </div>
      )}

      {wizardOpen && <CustomsFilingWizard orgId={orgId} onClose={() => setWizardOpen(false)} onCreated={handleCreated} />}
    </div>
  )
}
