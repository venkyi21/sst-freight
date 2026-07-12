import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import ContactAutocomplete from './ContactAutocomplete'
import { generateRef } from '../lib/refGenerator'
import { RATE_BASIS_META, type Quote, type ShipmentMode, type Tariff } from '../types'

interface QuoteModalProps {
  orgId: string
  onClose: () => void
  onCreated: (quote: Quote) => void
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

export default function QuoteModal({ orgId, onClose, onCreated }: QuoteModalProps) {
  const { user } = useAuth()
  const [mode, setMode] = useState<ShipmentMode>('ocean')
  const [tariffs, setTariffs] = useState<Tariff[]>([])
  const [selectedTariffId, setSelectedTariffId] = useState<string>('')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [rate, setRate] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [shipper, setShipper] = useState('')
  const [shipperContactId, setShipperContactId] = useState<string | null>(null)
  const [consignee, setConsignee] = useState('')
  const [consigneeContactId, setConsigneeContactId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('tariffs')
      .select('*')
      .eq('org_id', orgId)
      .eq('mode', mode)
      .then(({ data }) => {
        if (!cancelled && data) setTariffs(data as Tariff[])
      })
    return () => {
      cancelled = true
    }
  }, [orgId, mode])

  const quantityN = Math.max(0, parseFloat(quantity) || 0)
  const rateN = Math.max(0, parseFloat(rate) || 0)
  const total = quantityN * rateN
  const valid = origin.trim() && destination.trim() && rateN > 0 && quantityN > 0 && shipper.trim() && consignee.trim()

  function handleTariffSelect(tariffId: string) {
    setSelectedTariffId(tariffId)
    const tariff = tariffs.find((t) => t.id === tariffId)
    if (tariff) {
      setOrigin(tariff.origin)
      setDestination(tariff.destination)
      setRate(String(tariff.rate))
    }
  }

  async function resolveContactId(
    existingId: string | null,
    kind: 'shipper' | 'consignee',
    name: string,
    userId: string,
  ): Promise<string | null> {
    if (existingId) return existingId
    const { data: existingMatch } = await supabase
      .from('contacts')
      .select('id')
      .eq('org_id', orgId)
      .eq('kind', kind)
      .ilike('name', name)
      .limit(1)
      .maybeSingle()
    if (existingMatch) return (existingMatch as { id: string }).id

    const { data, error: insertError } = await supabase
      .from('contacts')
      .insert({ org_id: orgId, kind, name, created_by: userId })
      .select('id')
      .single()
    if (insertError || !data) return null
    return (data as { id: string }).id
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || !user) return
    setBusy(true)
    setError(null)

    const shipperId = await resolveContactId(shipperContactId, 'shipper', shipper.trim(), user.id)
    const consigneeId = await resolveContactId(consigneeContactId, 'consignee', consignee.trim(), user.id)

    const base = {
      org_id: orgId,
      tariff_id: selectedTariffId || null,
      mode,
      origin: origin.trim(),
      destination: destination.trim(),
      shipper_contact_id: shipperId,
      shipper_name: shipper.trim(),
      consignee_contact_id: consigneeId,
      consignee_name: consignee.trim(),
      quantity: quantityN,
      rate: rateN,
      total,
      status: 'draft',
      created_by: user.id,
    }

    let lastError: string | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error: insertError } = await supabase
        .from('quotes')
        .insert({ ...base, ref: generateRef('QT') })
        .select()
        .single()

      if (!insertError && data) {
        onCreated(data as Quote)
        setBusy(false)
        return
      }

      lastError = insertError?.message ?? 'Could not create quote'
      if (insertError?.code !== '23505') break
    }

    setError(lastError)
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>New Quote</div>
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
                setSelectedTariffId('')
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
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Load from tariff (optional)</label>
            <select value={selectedTariffId} onChange={(e) => handleTariffSelect(e.target.value)} style={inputStyle}>
              <option value="">— Select a tariff —</option>
              {tariffs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.origin} → {t.destination} — ₹{t.rate}/{RATE_BASIS_META[mode].unit}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Shipper</label>
              <ContactAutocomplete
                orgId={orgId}
                kind="shipper"
                value={shipper}
                onChange={setShipper}
                onSelectContact={setShipperContactId}
                placeholder="Shipper name"
                inputStyle={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Consignee</label>
              <ContactAutocomplete
                orgId={orgId}
                kind="consignee"
                value={consignee}
                onChange={setConsignee}
                onSelectContact={setConsigneeContactId}
                placeholder="Consignee name"
                inputStyle={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Origin</label>
              <input type="text" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. Chennai Port (INMAA)" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Destination</label>
              <input type="text" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Rotterdam (NLRTM)" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Rate (INR / {RATE_BASIS_META[mode].unit})</label>
              <input type="number" min="0" step="any" value={rate} onChange={(e) => setRate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Quantity ({RATE_BASIS_META[mode].unit})</label>
              <input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#0b1220',
              border: '1px solid #1e293b',
              borderRadius: 8,
              padding: '11px 14px',
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 11, color: '#64748b' }}>Total</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#4ade80', fontFamily: "'IBM Plex Mono', monospace" }}>
              ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
          </div>

          {error && (
            <div
              style={{
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
              disabled={!valid || busy}
              style={{
                flex: 1,
                padding: 11,
                borderRadius: 8,
                border: 'none',
                background: valid && !busy ? '#2563eb' : '#1e293b',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: valid && !busy ? 'pointer' : 'not-allowed',
              }}
            >
              {busy ? 'Saving…' : 'Save Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
