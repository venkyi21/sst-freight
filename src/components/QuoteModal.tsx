import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { createQuote, fetchTariffsByMode } from '../api/quotes'
import ContactAutocomplete from './ContactAutocomplete'
import FieldError from './FieldError'
import { RATE_BASIS_META, type Quote, type ShipmentMode, type Tariff } from '../types'

interface QuoteModalProps {
  orgId: string
  onClose: () => void
  onCreated: (quote: Quote) => void
}

interface LineItemDraft {
  description: string
  sacCode: string
  quantity: string
  rate: string
}

function blankLineItem(description = ''): LineItemDraft {
  return { description, sacCode: '', quantity: '1', rate: '' }
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
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([blankLineItem('Freight')])
  const [shipper, setShipper] = useState('')
  const [shipperContactId, setShipperContactId] = useState<string | null>(null)
  const [consignee, setConsignee] = useState('')
  const [consigneeContactId, setConsigneeContactId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    origin?: string
    destination?: string
    lineItems?: string
    shipper?: string
    consignee?: string
  }>({})

  useEffect(() => {
    let cancelled = false
    fetchTariffsByMode(orgId, mode).then((data) => {
      if (!cancelled) setTariffs(data)
    })
    return () => {
      cancelled = true
    }
  }, [orgId, mode])

  const lineAmounts = lineItems.map((li) => Math.max(0, parseFloat(li.quantity) || 0) * Math.max(0, parseFloat(li.rate) || 0))
  const total = lineAmounts.reduce((sum, a) => sum + a, 0)
  const lineItemsValid = lineItems.length > 0 && lineItems.every((li, i) => li.description.trim() && parseFloat(li.quantity) > 0 && lineAmounts[i] >= 0 && parseFloat(li.rate) > 0)
  const valid = origin.trim() && destination.trim() && lineItemsValid && shipper.trim() && consignee.trim()

  function handleTariffSelect(tariffId: string) {
    setSelectedTariffId(tariffId)
    const tariff = tariffs.find((t) => t.id === tariffId)
    if (tariff) {
      setOrigin(tariff.origin)
      setDestination(tariff.destination)
      setLineItems((prev) => {
        const next = [...prev]
        next[0] = { ...next[0], rate: String(tariff.rate), sacCode: tariff.sac_code ?? '' }
        return next
      })
    }
  }

  function updateLineItem(index: number, patch: Partial<LineItemDraft>) {
    setLineItems((prev) => prev.map((li, i) => (i === index ? { ...li, ...patch } : li)))
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, blankLineItem()])
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!valid) {
      setFieldErrors({
        origin: origin.trim() ? undefined : 'Origin is required',
        destination: destination.trim() ? undefined : 'Destination is required',
        lineItems: lineItemsValid ? undefined : 'Every line needs a description, quantity, and rate greater than 0',
        shipper: shipper.trim() ? undefined : 'Shipper is required',
        consignee: consignee.trim() ? undefined : 'Consignee is required',
      })
      return
    }
    if (!user) return
    setFieldErrors({})
    setBusy(true)

    // ADR-0030: the whole creation workflow — contact resolution, ref generation, line-item
    // insert, and the AUTHORITATIVE amount/total math — runs in the quotes-service tier. The
    // `total` computed above is only the live preview shown in this form; the server recomputes
    // it from the raw quantities/rates and never trusts the client's number.
    const { data: quote, error: createError } = await createQuote({
      orgId,
      mode,
      tariffId: selectedTariffId || null,
      origin: origin.trim(),
      destination: destination.trim(),
      shipperContactId,
      shipperName: shipper.trim(),
      consigneeContactId,
      consigneeName: consignee.trim(),
      lineItems: lineItems.map((li) => ({
        description: li.description.trim(),
        sacCode: li.sacCode.trim() || null,
        quantity: Math.max(0, parseFloat(li.quantity) || 0),
        rate: Math.max(0, parseFloat(li.rate) || 0),
      })),
    })

    if (!quote) {
      if (createError?.toLowerCase().includes('line needs')) {
        setFieldErrors({ lineItems: createError })
      } else {
        setError(createError ?? 'Could not create quote')
      }
      setBusy(false)
      return
    }

    onCreated(quote)
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
          maxWidth: 640,
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
              <FieldError message={fieldErrors.shipper} />
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
              <FieldError message={fieldErrors.consignee} />
            </div>
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
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Line items</label>
              <button
                type="button"
                onClick={addLineItem}
                style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                + Add line
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lineItems.map((li, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 0.8fr 1fr auto', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={li.description}
                    onChange={(e) => updateLineItem(i, { description: e.target.value })}
                    placeholder={i === 0 ? 'Freight' : 'e.g. THC, Documentation'}
                    style={inputStyle}
                  />
                  <input
                    type="text"
                    value={li.sacCode}
                    onChange={(e) => updateLineItem(i, { sacCode: e.target.value })}
                    placeholder="SAC code"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={li.quantity}
                    onChange={(e) => updateLineItem(i, { quantity: e.target.value })}
                    placeholder="Qty"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={li.rate}
                    onChange={(e) => updateLineItem(i, { rate: e.target.value })}
                    placeholder="Rate"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => removeLineItem(i)}
                    disabled={lineItems.length === 1}
                    title="Remove line"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: lineItems.length === 1 ? '#334155' : '#fb7185',
                      fontSize: 16,
                      lineHeight: 1,
                      cursor: lineItems.length === 1 ? 'not-allowed' : 'pointer',
                      padding: '0 4px',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <FieldError message={fieldErrors.lineItems} />
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
              {busy ? 'Saving…' : 'Save Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
