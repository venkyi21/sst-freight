import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { MODE_META, STATUS_SEQUENCE, statusMeta, type Shipment, type StatusHistoryEntry } from '../types'

interface ShipmentDetailModalProps {
  shipment: Shipment
  onClose: () => void
  onUpdated: (shipment: Shipment) => void
}

export default function ShipmentDetailModal({ shipment, onClose, onUpdated }: ShipmentDetailModalProps) {
  const [history, setHistory] = useState<StatusHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const currentIndex = STATUS_SEQUENCE.indexOf(shipment.status)
  const nextStatus = STATUS_SEQUENCE[currentIndex + 1]

  useEffect(() => {
    let cancelled = false
    setHistoryLoading(true)
    setHistoryError(null)
    supabase
      .rpc('list_shipment_status_history', { p_shipment_id: shipment.id })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setHistoryError(error.message)
        } else if (data) {
          setHistory(data as StatusHistoryEntry[])
        }
        setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [shipment.id])

  async function handleAdvance() {
    setBusy(true)
    setActionError(null)
    const { data, error } = await supabase.rpc('advance_shipment_status', { p_shipment_id: shipment.id }).single()
    if (error || !data) {
      setActionError(error?.message ?? 'Could not update status')
      setBusy(false)
      return
    }
    onUpdated(data as Shipment)
    setBusy(false)
  }

  const mode = MODE_META[shipment.mode]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4,8,16,0.7)',
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
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 14,
          padding: 26,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', fontFamily: "'IBM Plex Mono', monospace" }}>
            {shipment.ref}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <div style={{ fontSize: 12.5, color: mode.color, fontWeight: 600, marginBottom: 18 }}>{mode.label}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22, fontSize: 13 }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>Client</div>
            <div style={{ color: '#e2e8f0' }}>{shipment.client}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>Route</div>
            <div style={{ color: '#e2e8f0' }}>
              {shipment.origin} → {shipment.destination}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                        background: done || current ? meta.color : '#1e293b',
                        border: current ? `2px solid ${meta.color}` : 'none',
                      }}
                    />
                    <div style={{ fontSize: 10.5, color: done || current ? meta.color : '#5b6b82', fontWeight: current ? 700 : 500, whiteSpace: 'nowrap' }}>
                      {s}
                    </div>
                  </div>
                  {i < STATUS_SEQUENCE.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: done ? meta.color : '#1e293b', margin: '0 4px 16px' }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {actionError && (
          <div
            style={{
              marginBottom: 16,
              background: 'rgba(244,63,94,0.1)',
              border: '1px solid rgba(244,63,94,0.3)',
              color: '#fb7185',
              fontSize: 12.5,
              borderRadius: 8,
              padding: '9px 12px',
            }}
          >
            {actionError}
          </div>
        )}

        {nextStatus ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleAdvance()}
            style={{
              width: '100%',
              padding: 11,
              borderRadius: 8,
              border: 'none',
              background: busy ? '#1e293b' : '#2563eb',
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: busy ? 'not-allowed' : 'pointer',
              marginBottom: 22,
            }}
          >
            {busy ? 'Updating…' : `Mark as ${nextStatus}`}
          </button>
        ) : (
          <div style={{ textAlign: 'center', color: '#4ade80', fontSize: 12.5, fontWeight: 600, marginBottom: 22 }}>
            Shipment delivered — no further status changes
          </div>
        )}

        <div>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            History
          </div>
          {historyLoading && <div style={{ fontSize: 12.5, color: '#5b6b82' }}>Loading history…</div>}
          {historyError && <div style={{ fontSize: 12.5, color: '#fb7185' }}>Couldn't load history: {historyError}</div>}
          {!historyLoading && !historyError && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((h, i) => (
                <div key={i} style={{ fontSize: 12, color: '#94a3b8', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span>
                    {h.from_status ? `${h.from_status} → ${h.to_status}` : `Created as ${h.to_status}`}
                    <span style={{ color: '#5b6b82' }}> · {h.changed_by_email}</span>
                  </span>
                  <span style={{ color: '#5b6b82', whiteSpace: 'nowrap' }}>{new Date(h.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
