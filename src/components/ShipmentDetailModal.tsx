import { useEffect, useState } from 'react'
import { advanceShipmentStatus, fetchShipmentStatusHistory, optInCargoInsurance, registerCarrierTracking } from '../api/shipments'
import InfoTooltip from './InfoTooltip'
import ShipmentDocumentsPanel from './ShipmentDocumentsPanel'
import { MODE_META, STATUS_SEQUENCE, statusMeta, type BillingModel, type Shipment, type StatusHistoryEntry } from '../types'
import { T } from '../theme/tokens'

interface ShipmentDetailModalProps {
  shipment: Shipment
  billingModel: BillingModel
  onClose: () => void
  onUpdated: (shipment: Shipment) => void
}

export default function ShipmentDetailModal({ shipment, billingModel, onClose, onUpdated }: ShipmentDetailModalProps) {
  const [history, setHistory] = useState<StatusHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [insuranceBusy, setInsuranceBusy] = useState(false)
  const [insured, setInsured] = useState(false)
  const [scacInput, setScacInput] = useState('')
  const [requestNumberInput, setRequestNumberInput] = useState('')
  const [trackingBusy, setTrackingBusy] = useState(false)
  const [trackingError, setTrackingError] = useState<string | null>(null)

  const currentIndex = STATUS_SEQUENCE.indexOf(shipment.status)
  const nextStatus = STATUS_SEQUENCE[currentIndex + 1]

  useEffect(() => {
    let cancelled = false
    setHistoryLoading(true)
    setHistoryError(null)
    fetchShipmentStatusHistory(shipment.id).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setHistoryError(error)
      } else if (data) {
        setHistory(data)
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
    const { data, error } = await advanceShipmentStatus(shipment.id)
    if (error || !data) {
      setActionError(error ?? 'Could not update status')
      setBusy(false)
      return
    }
    onUpdated(data)
    setBusy(false)
  }

  async function handleInsure() {
    setInsuranceBusy(true)
    const { error } = await optInCargoInsurance(shipment.id)
    if (!error) setInsured(true)
    setInsuranceBusy(false)
  }

  async function handleRegisterTracking() {
    if (!scacInput.trim() || !requestNumberInput.trim()) {
      setTrackingError('Enter both a carrier SCAC and a booking/BL/container number')
      return
    }
    setTrackingBusy(true)
    setTrackingError(null)
    const { data, error } = await registerCarrierTracking(shipment.id, scacInput.trim(), requestNumberInput.trim())
    if (error || !data) {
      setTrackingError(error ?? 'Could not register tracking')
      setTrackingBusy(false)
      return
    }
    onUpdated(data)
    setTrackingBusy(false)
  }

  async function handleCopyTrackingLink() {
    const url = `${window.location.origin}${window.location.pathname}?track=${shipment.tracking_token}`
    await navigator.clipboard.writeText(url)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  const mode = MODE_META[shipment.mode]

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, fontFamily: "'IBM Plex Mono', monospace" }}>
            {shipment.ref}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: T.muted, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 12.5, color: mode.color, fontWeight: 600 }}>{mode.label}</div>
          <button
            type="button"
            onClick={() => void handleCopyTrackingLink()}
            style={{
              background: 'transparent',
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              padding: '5px 10px',
              color: linkCopied ? T.success : T.muted,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {linkCopied ? 'Copied!' : 'Copy Tracking Link'}
          </button>
        </div>

        {billingModel === 'model_2' && (
          <div style={{ marginBottom: 18 }}>
            <button
              type="button"
              disabled={insuranceBusy || insured}
              onClick={() => void handleInsure()}
              title="Simulated — no real funds move yet"
              style={{
                background: 'transparent',
                border: `1px solid ${T.border}`,
                borderRadius: 6,
                padding: '5px 10px',
                color: insured ? T.success : T.muted,
                fontSize: 11.5,
                fontWeight: 600,
                cursor: insured ? 'default' : 'pointer',
              }}
            >
              {insured ? '● Insured (simulated)' : 'Insure this shipment (0.8%, simulated)'}
            </button>
            <InfoTooltip text="0.8% of this shipment's total invoiced amount, recorded as a simulated platform-revenue entry. No real insurance policy exists and no funds move (ADR-0013)." />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22, fontSize: 13 }}>
          <div>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 3 }}>Client</div>
            <div style={{ color: T.text }}>{shipment.client}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 3 }}>Route</div>
            <div style={{ color: T.text }}>
              {shipment.origin} → {shipment.destination}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
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

        <ShipmentDocumentsPanel shipment={shipment} />

        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Carrier Tracking
          </div>
          {shipment.carrier_tracking_request_id ? (
            <div style={{ fontSize: 12.5, color: T.muted }}>
              <div style={{ color: T.success, fontWeight: 600, marginBottom: 4 }}>
                ● Registered — {shipment.carrier_scac} / {shipment.carrier_request_number}
              </div>
              <div style={{ marginBottom: 8 }}>
                Live status isn't readable in-app on Terminal49's free plan (write-only API access)
                — view it on their dashboard directly.
              </div>
              <a
                href="https://app.terminal49.com"
                target="_blank"
                rel="noreferrer"
                style={{ color: T.info, fontSize: 12, fontWeight: 600 }}
              >
                Open Terminal49 dashboard ↗
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={scacInput}
                  onChange={(e) => setScacInput(e.target.value)}
                  placeholder="Carrier SCAC (e.g. HLCU)"
                  style={{ flex: 1, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: '7px 10px', color: T.text, fontSize: 12.5 }}
                />
                <input
                  type="text"
                  value={requestNumberInput}
                  onChange={(e) => setRequestNumberInput(e.target.value)}
                  placeholder="Booking / BL / container #"
                  style={{ flex: 1.5, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: '7px 10px', color: T.text, fontSize: 12.5 }}
                />
              </div>
              {trackingError && <div style={{ fontSize: 12, color: T.danger }}>{trackingError}</div>}
              <button
                type="button"
                disabled={trackingBusy}
                onClick={() => void handleRegisterTracking()}
                style={{
                  alignSelf: 'flex-start',
                  background: 'transparent',
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  padding: '6px 12px',
                  color: T.muted,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: trackingBusy ? 'not-allowed' : 'pointer',
                }}
              >
                {trackingBusy ? 'Registering…' : 'Track via Carrier'}
              </button>
            </div>
          )}
        </div>

        {actionError && (
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
              background: busy ? T.surfaceInset : T.accent,
              color: T.onAccent,
              fontWeight: 600,
              fontSize: 13,
              cursor: busy ? 'not-allowed' : 'pointer',
              marginBottom: 22,
            }}
          >
            {busy ? 'Updating…' : `Mark as ${nextStatus}`}
          </button>
        ) : (
          <div style={{ textAlign: 'center', color: T.success, fontSize: 12.5, fontWeight: 600, marginBottom: 22 }}>
            Shipment delivered — no further status changes
          </div>
        )}

        <div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            History
          </div>
          {historyLoading && <div style={{ fontSize: 12.5, color: T.faint }}>Loading history…</div>}
          {historyError && <div style={{ fontSize: 12.5, color: T.danger }}>Couldn't load history: {historyError}</div>}
          {!historyLoading && !historyError && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((h, i) => (
                <div key={i} style={{ fontSize: 12, color: T.muted, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span>
                    {h.from_status ? `${h.from_status} → ${h.to_status}` : `Created as ${h.to_status}`}
                    <span style={{ color: T.faint }}> · {h.changed_by_email}</span>
                  </span>
                  <span style={{ color: T.faint, whiteSpace: 'nowrap' }}>{new Date(h.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
