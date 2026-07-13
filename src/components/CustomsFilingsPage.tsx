import { useEffect, useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabaseClient'
import CustomsFilingWizard from './CustomsFilingWizard'
import { CUSTOMS_FILING_STATUS_META, CUSTOMS_FILING_TYPE_META, type CustomsFiling } from '../types'

const headStyle: CSSProperties = {
  padding: '13px 20px',
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const cellStyle: CSSProperties = { padding: '14px 20px' }

interface CustomsFilingsPageProps {
  orgId: string
}

export default function CustomsFilingsPage({ orgId }: CustomsFilingsPageProps) {
  const [filings, setFilings] = useState<CustomsFiling[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .from('customs_filings')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) setError(fetchError.message)
        else if (data) setFilings(data as CustomsFiling[])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  function handleCreated(filing: CustomsFiling) {
    setFilings((prev) => [filing, ...prev])
    setWizardOpen(false)
  }

  return (
    <div style={{ padding: '28px 32px', flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 14 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>Customs Filings</h1>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          style={{
            background: '#2563eb',
            color: '#fff',
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
      <div style={{ fontSize: 12.5, color: '#5b6b82', marginBottom: 20 }}>
        Simulated Bill of Entry / Shipping Bill filings — HS-code duty lookup and calculation only, no live ICEGATE submission.
      </div>

      {error ? (
        <div
          style={{
            background: 'rgba(244,63,94,0.08)',
            border: '1px solid rgba(244,63,94,0.3)',
            borderRadius: 12,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ color: '#fb7185', fontSize: 13.5 }}>{error}</div>
        </div>
      ) : (
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', background: 'rgba(255,255,255,0.02)' }}>
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
                <tr key={f.id} style={{ borderBottom: '1px solid #172033' }}>
                  <td style={{ ...cellStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13, color: '#f1f5f9' }}>
                    {f.ref}
                  </td>
                  <td style={{ ...cellStyle, fontSize: 12.5, color: '#94a3b8' }}>{CUSTOMS_FILING_TYPE_META[f.filing_type].shortLabel}</td>
                  <td style={{ ...cellStyle, fontSize: 12.5, color: '#cbd5e1', maxWidth: 240 }}>{f.goods_description}</td>
                  <td style={{ ...cellStyle, fontSize: 12.5, fontFamily: "'IBM Plex Mono', monospace", color: '#94a3b8' }}>{f.hs_code ?? '—'}</td>
                  <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: '#4ade80' }}>
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
            <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 13 }}>No customs filings yet.</div>
          )}
          {loading && <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 13 }}>Loading filings…</div>}
        </div>
      )}

      {wizardOpen && <CustomsFilingWizard orgId={orgId} onClose={() => setWizardOpen(false)} onCreated={handleCreated} />}
    </div>
  )
}
