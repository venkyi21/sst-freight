import type { CSSProperties } from 'react'
import { useContactHistory } from '../hooks/useContacts'
import { MODE_META, statusMeta, type Contact } from '../types'
import { T } from '../theme/tokens'

interface ContactHistoryModalProps {
  orgId: string
  contact: Contact
  onClose: () => void
}

const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: T.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 10,
}

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  background: T.bg,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: '11px 14px',
}

const refStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: T.ink,
  fontFamily: "'IBM Plex Mono', monospace",
}

export default function ContactHistoryModal({ orgId, contact, onClose }: ContactHistoryModalProps) {
  const { data, isLoading, error: errorObj } = useContactHistory(orgId, contact.id)
  const error = errorObj instanceof Error ? errorObj.message : null
  const shipments = data?.shipments ?? []
  const invoices = data?.invoices ?? []

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: T.overlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '88vh',
          overflowY: 'auto',
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 14,
          padding: 26,
          boxShadow: T.shadowModal,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{contact.name}</div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: T.muted, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <div style={{ fontSize: 12.5, color: T.faint, marginBottom: 20 }}>
          Every shipment and invoice linked to this contact — live from this org's records.
        </div>

        {isLoading && <div style={{ color: T.muted, fontSize: 13 }}>Loading history…</div>}
        {error && <div style={{ color: T.danger, fontSize: 13 }}>{error}</div>}

        {!isLoading && !error && (
          <>
            <div style={{ marginBottom: invoices.length > 0 ? 24 : 0 }}>
              <div style={sectionLabelStyle}>Shipments ({shipments.length})</div>
              {shipments.length === 0 && <div style={{ fontSize: 12.5, color: T.faint }}>No shipments yet for this contact.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {shipments.map((s) => {
                  const meta = statusMeta(s.status)
                  return (
                    <div key={s.id} style={rowStyle}>
                      <div style={{ minWidth: 0 }}>
                        <div style={refStyle}>{s.ref}</div>
                        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>
                          <span style={{ color: MODE_META[s.mode].color, fontWeight: 600 }}>{MODE_META[s.mode].label}</span>
                          {' · '}
                          {s.origin} → {s.destination}
                          {' · '}
                          {new Date(s.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: meta.color, whiteSpace: 'nowrap' }}>● {s.status}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {invoices.length > 0 && (
              <div>
                <div style={sectionLabelStyle}>Invoices ({invoices.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {invoices.map((inv) => (
                    <div key={inv.id} style={rowStyle}>
                      <div>
                        <div style={refStyle}>{inv.ref}</div>
                        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>
                          {inv.currency} {inv.amount.toLocaleString('en-IN')}
                          {' · '}Due {inv.due_date ?? 'N/A'}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: inv.status === 'paid' ? T.success : T.warning, whiteSpace: 'nowrap' }}>
                        ● {inv.status === 'paid' ? 'Paid' : 'Unpaid'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
