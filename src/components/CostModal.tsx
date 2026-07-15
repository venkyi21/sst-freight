import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchShipments } from '../api/shipments'
import { insertCost } from '../api/accounting'
import ContactAutocomplete from './ContactAutocomplete'
import FieldError from './FieldError'
import { isCheckViolation } from '../lib/formErrors'
import type { Shipment, ShipmentCost } from '../types'

interface CostModalProps {
  orgId: string
  onClose: () => void
  onCreated: (cost: ShipmentCost) => void
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

export default function CostModal({ orgId, onClose, onCreated }: CostModalProps) {
  const { user } = useAuth()
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [shipmentId, setShipmentId] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [vendorContactId, setVendorContactId] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ shipmentId?: string; description?: string; amount?: string }>({})

  useEffect(() => {
    let cancelled = false
    fetchShipments(orgId).then(({ data }) => {
      if (!cancelled && data) setShipments(data)
    })
    return () => {
      cancelled = true
    }
  }, [orgId])

  const amountN = Math.max(0, parseFloat(amount) || 0)
  const valid = shipmentId && description.trim() && amountN > 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!valid) {
      setFieldErrors({
        shipmentId: shipmentId ? undefined : 'Select a shipment',
        description: description.trim() ? undefined : 'Description is required',
        amount: amountN > 0 ? undefined : 'Amount must be greater than 0',
      })
      return
    }
    if (!user) return
    setFieldErrors({})
    setBusy(true)

    const { data, error: insertError } = await insertCost({
      org_id: orgId,
      shipment_id: shipmentId,
      vendor_contact_id: vendorContactId,
      vendor_name: vendorName.trim() || null,
      description: description.trim(),
      amount: amountN,
      created_by: user.id,
    })

    if (insertError || !data) {
      if (isCheckViolation(insertError!, 'shipment_costs_amount_check')) {
        setFieldErrors({ amount: 'Amount must be greater than 0' })
      } else {
        setError(insertError?.message ?? 'Could not add cost')
      }
      setBusy(false)
      return
    }

    onCreated(data)
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
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Add Cost</div>
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
            <FieldError message={fieldErrors.shipmentId} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Vendor</label>
            <ContactAutocomplete
              orgId={orgId}
              kind="vendor"
              value={vendorName}
              onChange={setVendorName}
              onSelectContact={setVendorContactId}
              placeholder="Vendor name"
              inputStyle={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Description</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Trucking charges" style={inputStyle} />
              <FieldError message={fieldErrors.description} />
            </div>
            <div>
              <label style={labelStyle}>Amount (INR)</label>
              <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
              <FieldError message={fieldErrors.amount} />
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
              {busy ? 'Saving…' : 'Add Cost'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
