import { useEffect, useState } from 'react'
import { fetchPublicTracking } from '../api/tracking'
import { MODE_META, SHIPMENT_DOCUMENT_TYPE_META, STATUS_SEQUENCE, statusMeta, type PublicTrackingData } from '../types'
import { BRAND } from '../theme/brand'
import { T } from '../theme/tokens'

interface PublicTrackingPageProps {
  token: string
}

const cardStyle = {
  width: '100%',
  maxWidth: 560,
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 16,
  padding: 40,
  boxShadow: T.shadowModal,
}

export default function PublicTrackingPage({ token }: PublicTrackingPageProps) {
  const [data, setData] = useState<PublicTrackingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPublicTracking(token).then(({ data: result, error: hasError }) => {
      if (cancelled) return
      if (hasError || !result) {
        setError("We couldn't find a shipment for this tracking link.")
      } else {
        setData(result)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [token])

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
        {/* White-label (benchmark-gap sprint): the agency's own brand when the payload carries
            it; the SST brand only as the pre-data / error / older-database fallback. */}
        {!loading && <BrandHeader org={data?.org ?? null} />}

        {loading && <div style={{ color: T.muted, fontSize: 13 }}>Loading tracking details…</div>}

        {error && (
          <div style={{ color: T.muted, fontSize: 13.5, lineHeight: 1.6 }}>
            {error} Please double-check the link, or contact the sender for a new one.
          </div>
        )}

        {data && <TrackingContent data={data} />}

        {data?.org && (
          <div style={{ marginTop: 28, paddingTop: 14, borderTop: `1px solid ${T.border}`, fontSize: 11, color: T.faint, textAlign: 'center' }}>
            Powered by SST Freight
          </div>
        )}
      </div>
    </div>
  )
}

function BrandHeader({ org }: { org: { name: string; color: string | null; logo_url: string | null } | null }) {
  const markBg = org ? org.color ?? BRAND.markBg : BRAND.markBg
  const name = org?.name ?? 'SST Freight'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
      {org?.logo_url ? (
        <img
          src={org.logo_url}
          alt={`${name} logo`}
          style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'contain', flexShrink: 0 }}
        />
      ) : (
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: markBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 17,
            color: org ? '#ffffff' : BRAND.markFg,
            flexShrink: 0,
          }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0.2, color: BRAND.wordmark }}>{name}</div>
    </div>
  )
}

function TrackingContent({ data }: { data: PublicTrackingData }) {
  const mode = MODE_META[data.mode]
  const currentIndex = STATUS_SEQUENCE.indexOf(data.status)

  return (
    <div>
      <div style={{ fontSize: 13, color: T.muted, marginBottom: 4 }}>Tracking for {data.client_name}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: T.ink, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 4 }}>
        {data.ref}
      </div>
      <div style={{ fontSize: 12.5, color: mode.color, fontWeight: 600, marginBottom: 18 }}>{mode.label}</div>

      <div style={{ fontSize: 13, color: T.text, marginBottom: 24 }}>
        {data.origin} → {data.destination}
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Status
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {STATUS_SEQUENCE.map((s, i) => {
            const done = i < currentIndex
            const current = i === currentIndex
            const meta = statusMeta(s)
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STATUS_SEQUENCE.length - 1 ? 1 : 'none' }}>
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      margin: '0 auto 6px',
                      background: done || current ? meta.color : T.surfaceInset,
                      border: current ? `2px solid ${meta.color}` : 'none',
                    }}
                  />
                  <div style={{ fontSize: 10.5, color: done || current ? meta.color : T.faint, fontWeight: current ? 700 : 500, whiteSpace: 'nowrap' }}>
                    {s}
                  </div>
                </div>
                {i < STATUS_SEQUENCE.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: done ? meta.color : T.surfaceInset, margin: '0 4px 16px' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ marginBottom: data.invoices.length > 0 ? 8 : 0 }}>
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          History
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.history.map((h, i) => (
            <div key={i} style={{ fontSize: 12, color: T.muted, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span>{h.from_status ? `${h.from_status} → ${h.to_status}` : `Created as ${h.to_status}`}</span>
              <span style={{ color: T.faint, whiteSpace: 'nowrap' }}>{new Date(h.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {data.documents.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Documents
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.documents.map((d, i) => (
              <div key={i} style={{ fontSize: 12, color: T.muted, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span>
                  {SHIPMENT_DOCUMENT_TYPE_META[d.document_type].label}
                  {d.ref && <span style={{ color: T.faint }}> · {d.ref}</span>}
                </span>
                <span style={{ color: T.faint, whiteSpace: 'nowrap' }}>{new Date(d.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.invoices.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Invoices
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.invoices.map((inv) => (
              <div
                key={inv.ref}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  padding: '11px 14px',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: "'IBM Plex Mono', monospace" }}>{inv.ref}</div>
                  <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>
                    {inv.currency} {inv.amount.toLocaleString('en-IN')} · Due {inv.due_date ?? 'N/A'}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: inv.status === 'paid' ? T.success : T.warning,
                  }}
                >
                  ● {inv.status === 'paid' ? 'Paid' : 'Unpaid'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
