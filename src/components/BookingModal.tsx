import { useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { resolveOrCreateContact } from '../api/contacts'
import { insertShipment } from '../api/shipments'
import { chargeableWeightKg, volumetricWeightKg } from '../lib/volumetric'
import ContactAutocomplete from './ContactAutocomplete'
import FieldError from './FieldError'
import InfoTooltip from './InfoTooltip'
import type { Shipment, ShipmentMode } from '../types'
import { T } from '../theme/tokens'

interface BookingModalProps {
  orgId: string
  defaultMode: ShipmentMode
  onClose: () => void
  onCreated: (shipment: Shipment) => void
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: T.bg,
  border: `1px solid ${T.border}`,
  borderRadius: 7,
  padding: '9px 11px',
  fontSize: 13,
  color: T.text,
}

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: T.muted,
  display: 'block',
  marginBottom: 5,
}

export default function BookingModal({ orgId, defaultMode, onClose, onCreated }: BookingModalProps) {
  const { user } = useAuth()
  const [mode, setMode] = useState<ShipmentMode>(defaultMode)
  const [shipper, setShipper] = useState('')
  const [shipperContactId, setShipperContactId] = useState<string | null>(null)
  const [consignee, setConsignee] = useState('')
  const [consigneeContactId, setConsigneeContactId] = useState<string | null>(null)
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
  const [fieldErrors, setFieldErrors] = useState<{ shipper?: string; consignee?: string; origin?: string; destination?: string }>({})

  const lengthN = Math.max(0, parseFloat(lengthCm) || 0)
  const widthN = Math.max(0, parseFloat(widthCm) || 0)
  const heightN = Math.max(0, parseFloat(heightCm) || 0)
  const grossN = Math.max(0, parseFloat(grossWeight) || 0)
  const volumetric = volumetricWeightKg(lengthN, widthN, heightN)
  const chargeable = chargeableWeightKg(grossN, volumetric)

  const valid = shipper.trim() && consignee.trim() && origin.trim() && destination.trim()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!valid) {
      setFieldErrors({
        shipper: shipper.trim() ? undefined : 'Shipper is required',
        consignee: consignee.trim() ? undefined : 'Consignee is required',
        origin: origin.trim() ? undefined : 'Origin is required',
        destination: destination.trim() ? undefined : 'Destination is required',
      })
      return
    }
    if (!user) return
    setFieldErrors({})
    setBusy(true)

    const shipperId = await resolveOrCreateContact(orgId, shipperContactId, 'shipper', shipper.trim(), user.id)
    const consigneeId = await resolveOrCreateContact(orgId, consigneeContactId, 'consignee', consignee.trim(), user.id)

    const base = {
      org_id: orgId,
      mode,
      client: consignee.trim(),
      shipper_contact_id: shipperId,
      consignee_contact_id: consigneeId,
      origin: origin.trim(),
      destination: destination.trim(),
      status: 'Booked' as const,
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

    const { data, error } = await insertShipment(base, mode)
    if (data) {
      onCreated(data)
      setBusy(false)
      return
    }
    setError(error)
    setBusy(false)
  }

  return (
    <div
      onClick={busy ? undefined : onClose}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>New Booking</div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              background: 'none',
              border: 'none',
              color: T.muted,
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
            background: T.bg,
            border: `1px solid ${T.border}`,
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
                background: mode === m ? T.accent : 'transparent',
                color: mode === m ? T.onAccent : T.muted,
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
              <input
                type="text"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="e.g. Chennai Port (INMAA)"
                style={inputStyle}
              />
              <FieldError message={fieldErrors.origin} />
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
              <FieldError message={fieldErrors.destination} />
            </div>
          </div>

          {mode === 'ocean' && (
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, marginTop: 4 }}>
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
                      border: `1px solid ${T.border}`,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: loadType === lt ? T.accent : 'transparent',
                      color: loadType === lt ? T.onAccent : T.muted,
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
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, marginTop: 4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Length (cm)</label>
                  <input type="number" min="0" step="any" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Width (cm)</label>
                  <input type="number" min="0" step="any" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Height (cm)</label>
                  <input type="number" min="0" step="any" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Gross Weight (kg)</label>
                <input type="number" min="0" step="any" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: 10, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: '11px 14px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 2 }}>
                    Volumetric Weight
                    <InfoTooltip text="IATA formula: (Length × Width × Height in cm) ÷ 6000." />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.modeAir, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {volumetric.toFixed(1)} kg
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 2 }}>
                    Chargeable Weight
                    <InfoTooltip text="Whichever is higher: gross weight or volumetric weight — the standard air-freight billing basis." />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.success, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {chargeable.toFixed(1)} kg
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === 'truck' && (
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, marginTop: 4 }}>
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
                background: T.dangerWash,
                border: `1px solid ${T.dangerBorder}`,
                color: T.danger,
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
              disabled={busy}
              style={{
                flex: 1,
                padding: 11,
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                background: 'transparent',
                color: T.muted,
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
                background: !busy ? T.accent : T.surfaceInset,
                color: T.onAccent,
                fontWeight: 600,
                fontSize: 13,
                cursor: !busy ? 'pointer' : 'not-allowed',
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
