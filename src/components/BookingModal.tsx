import { useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { chargeableWeightKg, volumetricWeightKg } from '../lib/volumetric'
import type { Shipment, ShipmentMode } from '../types'

interface BookingModalProps {
  orgId: string
  defaultMode: ShipmentMode
  onClose: () => void
  onCreated: (shipment: Shipment) => void
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

function refPrefix(mode: ShipmentMode): string {
  if (mode === 'ocean') return 'BKG'
  if (mode === 'air') return 'AWB'
  return 'TRK'
}

function generateRef(mode: ShipmentMode): string {
  const year = new Date().getFullYear()
  const suffix = Math.floor(100 + Math.random() * 899)
  return `${refPrefix(mode)}-${year}-${suffix}`
}

export default function BookingModal({ orgId, defaultMode, onClose, onCreated }: BookingModalProps) {
  const { user } = useAuth()
  const [mode, setMode] = useState<ShipmentMode>(defaultMode)
  const [shipper, setShipper] = useState('')
  const [consignee, setConsignee] = useState('')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [loadType, setLoadType] = useState<'FCL' | 'LCL'>('FCL')
  const [containerSize, setContainerSize] = useState('20ft')
  const [vesselName, setVesselName] = useState('')
  const [voyageNo, setVoyageNo] = useState('')
  const [lengthCm, setLengthCm] = useState('')
  const [widthCm, setWidthCm] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [grossWeight, setGrossWeight] = useState('')
  const [vehicleType, setVehicleType] = useState('20ft-open')
  const [driverPhone, setDriverPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lengthN = parseFloat(lengthCm) || 0
  const widthN = parseFloat(widthCm) || 0
  const heightN = parseFloat(heightCm) || 0
  const grossN = parseFloat(grossWeight) || 0
  const volumetric = volumetricWeightKg(lengthN, widthN, heightN)
  const chargeable = chargeableWeightKg(grossN, volumetric)

  const valid = shipper.trim() && consignee.trim() && origin.trim() && destination.trim()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || !user) return
    setBusy(true)
    setError(null)

    const status = mode === 'truck' ? 'Loading' : 'Booked'
    const base = {
      org_id: orgId,
      mode,
      client: consignee.trim(),
      origin: origin.trim(),
      destination: destination.trim(),
      status,
      created_by: user.id,
      load_type: mode === 'ocean' ? loadType : null,
      container_size: mode === 'ocean' ? containerSize : null,
      vessel_name: mode === 'ocean' ? vesselName.trim() || null : null,
      voyage_no: mode === 'ocean' ? voyageNo.trim() || null : null,
      length_cm: mode === 'air' ? lengthN || null : null,
      width_cm: mode === 'air' ? widthN || null : null,
      height_cm: mode === 'air' ? heightN || null : null,
      gross_weight_kg: mode === 'air' ? grossN || null : null,
      vehicle_type: mode === 'truck' ? vehicleType : null,
      driver_phone: mode === 'truck' ? driverPhone.trim() || null : null,
    }

    let lastError: string | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error: insertError } = await supabase
        .from('shipments')
        .insert({ ...base, ref: generateRef(mode) })
        .select()
        .single()

      if (!insertError && data) {
        onCreated(data as Shipment)
        setBusy(false)
        return
      }

      lastError = insertError?.message ?? 'Could not create booking'
      // 23505 = unique_violation on (org_id, ref) — regenerate and retry.
      if (insertError?.code !== '23505') break
    }

    setError(lastError)
    setBusy(false)
  }

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>New Booking</div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
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
          {(['ocean', 'air', 'truck'] as ShipmentMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
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
              {m === 'ocean' ? 'Ocean (FCL/LCL)' : m === 'air' ? 'Air' : 'Truck'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Shipper</label>
              <input type="text" value={shipper} onChange={(e) => setShipper(e.target.value)} placeholder="Shipper name" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Consignee</label>
              <input type="text" value={consignee} onChange={(e) => setConsignee(e.target.value)} placeholder="Consignee name" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Origin</label>
              <input
                type="text"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="e.g. Chennai Port (INMAA)"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Destination</label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Rotterdam (NLRTM)"
                style={inputStyle}
              />
            </div>
          </div>

          {mode === 'ocean' && (
            <div style={{ borderTop: '1px solid #1e293b', paddingTop: 14, marginTop: 4 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {(['FCL', 'LCL'] as const).map((lt) => (
                  <button
                    key={lt}
                    type="button"
                    onClick={() => setLoadType(lt)}
                    style={{
                      flex: 1,
                      padding: 8,
                      borderRadius: 7,
                      border: '1px solid #1e293b',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: loadType === lt ? '#2563eb' : 'transparent',
                      color: loadType === lt ? '#fff' : '#8291a6',
                    }}
                  >
                    {lt}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Container Size</label>
                  <select value={containerSize} onChange={(e) => setContainerSize(e.target.value)} style={inputStyle}>
                    <option value="20ft">20ft Standard</option>
                    <option value="40ft">40ft Standard</option>
                    <option value="40hc">40ft High Cube</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Vessel Name</label>
                  <input type="text" value={vesselName} onChange={(e) => setVesselName(e.target.value)} placeholder="e.g. MSC Aurora" style={inputStyle} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Voyage No.</label>
                  <input type="text" value={voyageNo} onChange={(e) => setVoyageNo(e.target.value)} placeholder="e.g. VG-2244" style={inputStyle} />
                </div>
              </div>
            </div>
          )}

          {mode === 'air' && (
            <div style={{ borderTop: '1px solid #1e293b', paddingTop: 14, marginTop: 4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Length (cm)</label>
                  <input type="number" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Width (cm)</label>
                  <input type="number" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Height (cm)</label>
                  <input type="number" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Gross Weight (kg)</label>
                <input type="number" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: 10, background: '#0b1220', border: '1px solid #1e293b', borderRadius: 8, padding: '11px 14px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10.5, color: '#64748b', marginBottom: 2 }}>Volumetric Weight</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#c4b5fd', fontFamily: "'IBM Plex Mono', monospace" }}>
                    {volumetric.toFixed(1)} kg
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10.5, color: '#64748b', marginBottom: 2 }}>Chargeable Weight</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#4ade80', fontFamily: "'IBM Plex Mono', monospace" }}>
                    {chargeable.toFixed(1)} kg
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === 'truck' && (
            <div style={{ borderTop: '1px solid #1e293b', paddingTop: 14, marginTop: 4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Vehicle Type</label>
                  <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} style={inputStyle}>
                    <option value="20ft-open">20ft Open Truck</option>
                    <option value="close-body">Close-Body Container</option>
                    <option value="multi-axle">Multi-Axle Trailer</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Driver Phone</label>
                  <input
                    type="text"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    placeholder="+91 9xxxxxxxxx"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                marginTop: 16,
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

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: 11,
                borderRadius: 8,
                border: '1px solid #1e293b',
                background: 'transparent',
                color: '#94a3b8',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
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
              {busy ? 'Creating…' : 'Create Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
