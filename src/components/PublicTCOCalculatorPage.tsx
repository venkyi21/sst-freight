import { useState } from 'react'
import { AMC_RATE, COMPETITOR_BASELINES, competitorTcoInr, formatInr, sstTcoInr, SST_LICENSE_ONE_TIME_INR } from '../lib/tcoCalculator'
import { BRAND } from '../theme/brand'
import { T } from '../theme/tokens'

const cardStyle = {
  width: '100%',
  maxWidth: 720,
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 16,
  padding: 40,
  boxShadow: T.shadowModal,
}

const inputStyle = {
  width: '100%',
  background: T.bg,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 15,
  color: T.text,
  fontFamily: "'IBM Plex Mono', monospace",
}

const labelStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: T.muted,
  display: 'block',
  marginBottom: 6,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
}

const YEARS = 10

export default function PublicTCOCalculatorPage() {
  const [seats, setSeats] = useState('30')
  const [branches, setBranches] = useState('3')

  const seatsN = Math.max(0, parseInt(seats, 10) || 0)
  const branchesN = Math.max(0, parseInt(branches, 10) || 0)

  const sstTotal = sstTcoInr(YEARS)
  const rows = COMPETITOR_BASELINES.map((c) => ({
    ...c,
    total: competitorTcoInr(c, seatsN, YEARS),
  })).sort((a, b) => a.total - b.total)
  const maxTotal = Math.max(sstTotal, ...rows.map((r) => r.total))
  const cheapestCompetitor = rows[0]
  const savings = cheapestCompetitor ? cheapestCompetitor.total - sstTotal : 0

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        // Deliberate literal gradient (ADR-0031): subtle light wash behind the public card.
        background: 'radial-gradient(circle at 20% 10%, #eef0f7 0%, #ffffff 55%)',
      }}
    >
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: BRAND.markBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 17,
              color: BRAND.markFg,
              flexShrink: 0,
            }}
          >
            S
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0.2, color: BRAND.wordmark }}>SST Freight</div>
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 28 }}>
          {YEARS}-Year Total Cost of Ownership — one-time buyout vs. per-seat SaaS
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
          <div>
            <label style={labelStyle}>Seats (users)</label>
            <input type="number" min="0" value={seats} onChange={(e) => setSeats(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Branches</label>
            <input type="number" min="0" value={branches} onChange={(e) => setBranches(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div
          style={{
            background: T.accentWash,
            border: `1px solid ${T.focusRing}`,
            borderRadius: 10,
            padding: '16px 18px',
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 11, color: T.info, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            SST Freight — one-time buyout
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: T.info, fontFamily: "'IBM Plex Mono', monospace" }}>
              {formatInr(sstTotal)}
            </div>
            <div style={{ fontSize: 12, color: T.faint }}>
              over {YEARS} years — {formatInr(SST_LICENSE_ONE_TIME_INR)} license + {(AMC_RATE * 100).toFixed(0)}% AMC/yr
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: T.info, marginTop: 8 }}>
            Flat regardless of seats or branches — {branchesN > 3 ? `even at ${branchesN} branches, ` : ''}this number doesn't move.
          </div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            vs. per-seat SaaS at {seatsN} seats
          </div>
          {rows.map((r) => (
            <div key={r.name} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: T.text }}>{r.name}</span>
                <span style={{ color: r.color, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{formatInr(r.total)}</span>
              </div>
              <div style={{ height: 8, background: T.border, borderRadius: 4, position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: '0 auto 0 0',
                    width: `${Math.min(100, (r.total / maxTotal) * 100)}%`,
                    background: r.color,
                    borderRadius: 4,
                  }}
                />
              </div>
            </div>
          ))}
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: T.ink, fontWeight: 600 }}>SST Freight</span>
              <span style={{ color: T.info, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{formatInr(sstTotal)}</span>
            </div>
            <div style={{ height: 8, background: T.border, borderRadius: 4, position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  inset: '0 auto 0 0',
                  width: `${Math.min(100, (sstTotal / maxTotal) * 100)}%`,
                  background: T.info,
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
        </div>

        {savings > 0 && (
          <div style={{ fontSize: 13.5, color: T.success, fontWeight: 600, marginTop: 18 }}>
            ≈ {formatInr(savings)} saved vs. the cheapest SaaS option compared here, over {YEARS} years.
          </div>
        )}

        <div
          style={{
            marginTop: 24,
            paddingTop: 18,
            borderTop: `1px solid ${T.border}`,
            fontSize: 11,
            color: T.faint,
            lineHeight: 1.6,
          }}
        >
          <b style={{ color: T.muted }}>How these numbers are built:</b> the SST figure is derived from a stated 18%/yr
          AMC rate against a proposed one-time license price — a working estimate, not a finalized quote. Competitor
          figures are linear estimates from each vendor's single published comparison point, not sourced from their own
          pricing pages or a verified quote. Treat every number here as illustrative, and confirm real pricing directly
          with SST Freight and each vendor before deciding.
        </div>
      </div>
    </div>
  )
}
