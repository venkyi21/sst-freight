import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { generateRef } from '../lib/refGenerator'
import { fetchFxRateToInr } from '../lib/fxRates'
import { INVOICE_CURRENCIES, type Invoice, type MembershipRole, type Shipment } from '../types'

interface InvoiceModalProps {
  orgId: string
  currentRole: MembershipRole
  onClose: () => void
  onCreated: (invoice: Invoice) => void
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

export default function InvoiceModal({ orgId, currentRole, onClose, onCreated }: InvoiceModalProps) {
  const { user } = useAuth()
  const canEditRate = currentRole === 'owner' || currentRole === 'admin'

  const [shipments, setShipments] = useState<Shipment[]>([])
  const [shipmentId, setShipmentId] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [fxRate, setFxRate] = useState('1')
  const [fxFetching, setFxFetching] = useState(false)
  const [fxError, setFxError] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('shipments')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled && data) setShipments(data as Shipment[])
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  useEffect(() => {
    let cancelled = false
    if (currency === 'INR') {
      setFxRate('1')
      setFxError(null)
      return
    }
    setFxFetching(true)
    setFxError(null)
    fetchFxRateToInr(currency).then((rate) => {
      if (cancelled) return
      setFxFetching(false)
      if (rate === null) {
        setFxError('Could not fetch a live rate — enter it manually.')
        setFxRate('')
      } else {
        setFxRate(String(rate))
      }
    })
    return () => {
      cancelled = true
    }
  }, [currency])

  const amountN = Math.max(0, parseFloat(amount) || 0)
  const rateN = Math.max(0, parseFloat(fxRate) || 0)
  const amountInr = amountN * rateN
  const valid = shipmentId && amountN > 0 && rateN > 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || !user) return
    setBusy(true)
    setError(null)

    const shipment = shipments.find((s) => s.id === shipmentId)
    if (!shipment) {
      setError('Selected shipment not found')
      setBusy(false)
      return
    }

    const base = {
      org_id: orgId,
      shipment_id: shipment.id,
      client_contact_id: shipment.consignee_contact_id,
      client_name: shipment.client,
      currency,
      fx_rate: rateN,
      amount: amountN,
      amount_inr: amountInr,
      status: 'unpaid',
      due_date: dueDate || null,
      created_by: user.id,
    }

    let lastError: string | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error: insertError } = await supabase
        .from('invoices')
        .insert({ ...base, ref: generateRef('INV') })
        .select()
        .single()

      if (!insertError && data) {
        onCreated(data as Invoice)
        setBusy(false)
        return
      }

      lastError = insertError?.message ?? 'Could not create invoice'
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
          maxWidth: 520,
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
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>New Invoice</div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: busy ? 'not-allowed' : 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Shipment</label>
            <select value={shipmentId} onChange={(e) => setShipmentId(e.target.value)} style={inputStyle}>
              <option value="">— Select a shipment —</option>
              {shipments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ref} — {s.client}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle}>
                {INVOICE_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>FX Rate (→ INR)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={fxFetching ? '' : fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                placeholder={fxFetching ? 'Fetching…' : undefined}
                disabled={currency === 'INR' || fxFetching || !canEditRate}
                style={{ ...inputStyle, opacity: currency === 'INR' || !canEditRate ? 0.6 : 1 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Amount ({currency})</label>
              <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {fxError && (
            <div style={{ marginBottom: 14, fontSize: 12, color: '#fbbf24' }}>{fxError}</div>
          )}
          {!canEditRate && currency !== 'INR' && (
            <div style={{ marginBottom: 14, fontSize: 11.5, color: '#5b6b82' }}>
              Only an Owner or Admin can edit the FX rate — this invoice will use the fetched rate above.
            </div>
          )}

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
            <div style={{ fontSize: 11, color: '#64748b' }}>Amount in INR</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#4ade80', fontFamily: "'IBM Plex Mono', monospace" }}>
              ₹{amountInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
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
              {busy ? 'Creating…' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
