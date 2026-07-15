import { useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { saveTariff } from '../api/quotes'
import FieldError from './FieldError'
import { isCheckViolation } from '../lib/formErrors'
import { RATE_BASIS_META, type ShipmentMode, type Tariff } from '../types'

interface TariffModalProps {
  orgId: string
  tariff: Tariff | null
  onClose: () => void
  onSaved: (tariff: Tariff) => void
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: '#0b1220',
  border: '1px solid #1e293b',
  borderRadius: 7,
  padding: '9px 11px',
  fontSize: 13,
  color: '#e2e8f0',
}

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  display: 'block',
  marginBottom: 5,
}

const MODES: ShipmentMode[] = ['ocean', 'air', 'truck']

export default function TariffModal({ orgId, tariff, onClose, onSaved }: TariffModalProps) {
  const { user } = useAuth()
  const [mode, setMode] = useState<ShipmentMode>(tariff?.mode ?? 'ocean')
  const [origin, setOrigin] = useState(tariff?.origin ?? '')
  const [destination, setDestination] = useState(tariff?.destination ?? '')
  const [rate, setRate] = useState(tariff ? String(tariff.rate) : '')
  const [notes, setNotes] = useState(tariff?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ origin?: string; destination?: string; rate?: string }>({})

  const rateN = parseFloat(rate)
  const valid = origin.trim() && destination.trim() && rateN > 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!valid) {
      setFieldErrors({
        origin: origin.trim() ? undefined : 'Origin is required',
        destination: destination.trim() ? undefined : 'Destination is required',
        rate: rateN > 0 ? undefined : 'Rate must be greater than 0',
      })
      return
    }
    if (!user) return
    setFieldErrors({})
    setBusy(true)

    const payload = {
      org_id: orgId,
      mode,
      origin: origin.trim(),
      destination: destination.trim(),
      rate: rateN,
      notes: notes.trim() || null,
    }

    const { data, error: saveError } = await saveTariff(payload, tariff?.id ?? null, user.id)

    if (saveError || !data) {
      if (isCheckViolation(saveError!, 'tariffs_rate_check')) {
        setFieldErrors({ rate: 'Rate must be greater than 0' })
      } else {
        setError(saveError?.message ?? 'Could not save tariff')
      }
      setBusy(false)
      return
    }

    onSaved(data)
    setBusy(false)
  }

  return (
    <div
      onClick={busy ? undefined : onClose}
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
          maxWidth: 480,
          maxHeight: '88vh',
          overflowY: 'auto',
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 14,
          padding: 26,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{tariff ? 'Edit Tariff' : 'Add Tariff'}</div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: 20,
              cursor: busy ? 'not-allowed' : 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            background: '#0b1220',
            border: '1px solid #1e293b',
            borderRadius: 9,
            padding: 3,
            display: 'flex',
            gap: 2,
            marginBottom: 20,
          }}
        >
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                setError(null)
              }}
              style={{
                flex: 1,
                padding: 8,
                borderRadius: 6,
                border: 'none',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                background: mode === m ? '#2563eb' : 'transparent',
                color: mode === m ? '#fff' : '#8291a6',
              }}
            >
              {m === 'ocean' ? 'Ocean' : m === 'air' ? 'Air' : 'Truck'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Origin</label>
              <input type="text" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. Chennai Port (INMAA)" style={inputStyle} />
              <FieldError message={fieldErrors.origin} />
            </div>
            <div>
              <label style={labelStyle}>Destination</label>
              <input type="text" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Rotterdam (NLRTM)" style={inputStyle} />
              <FieldError message={fieldErrors.destination} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Rate ({RATE_BASIS_META[mode].label}) — INR</label>
              <input type="number" min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={`Rate per ${RATE_BASIS_META[mode].unit}`} style={inputStyle} />
              <FieldError message={fieldErrors.rate} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Notes</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {error && (
            <div
              style={{
                marginTop: 4,
                marginBottom: 14,
                background: 'rgba(244,63,94,0.1)',
                border: '1px solid rgba(244,63,94,0.3)',
                color: '#fb7185',
                fontSize: 12.5,
                borderRadius: 8,
                padding: '9px 12px',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              style={{
                flex: 1,
                padding: 11,
                borderRadius: 8,
                border: '1px solid #1e293b',
                background: 'transparent',
                color: '#94a3b8',
                fontWeight: 600,
                fontSize: 13,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              style={{
                flex: 1,
                padding: 11,
                borderRadius: 8,
                border: 'none',
                background: !busy ? '#2563eb' : '#1e293b',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: !busy ? 'pointer' : 'not-allowed',
              }}
            >
              {busy ? 'Saving…' : tariff ? 'Save Changes' : 'Add Tariff'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
