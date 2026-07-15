import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchShipmentsWithContacts, type ShipmentWithContacts } from '../api/shipments'
import { fetchHsCodes, insertCustomsFiling } from '../api/customs'
import FieldError from './FieldError'
import InfoTooltip from './InfoTooltip'
import { isCheckViolation } from '../lib/formErrors'
import { CUSTOMS_FILING_TYPE_META, type CustomsFiling, type CustomsFilingType, type HsCode } from '../types'

interface CustomsFilingWizardProps {
  orgId: string
  onClose: () => void
  onCreated: (filing: CustomsFiling) => void
}

const STEPS = ['Filing', 'Goods & HS Code', 'Duty', 'Review'] as const

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

const filingTypes: CustomsFilingType[] = ['bill_of_entry', 'shipping_bill']

export default function CustomsFilingWizard({ orgId, onClose, onCreated }: CustomsFilingWizardProps) {
  const { user } = useAuth()
  const [step, setStep] = useState(0)

  const [filingType, setFilingType] = useState<CustomsFilingType>('bill_of_entry')
  const [shipments, setShipments] = useState<ShipmentWithContacts[]>([])
  const [shipmentId, setShipmentId] = useState('')
  const [shipperName, setShipperName] = useState('')
  const [consigneeName, setConsigneeName] = useState('')

  const [hsCodes, setHsCodes] = useState<HsCode[]>([])
  const [goodsDescription, setGoodsDescription] = useState('')
  const [hsSearch, setHsSearch] = useState('')
  const [hsCode, setHsCode] = useState<HsCode | null>(null)
  const [assessableValue, setAssessableValue] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    shipmentId?: string
    goodsDescription?: string
    hsCode?: string
    assessableValue?: string
  }>({})

  useEffect(() => {
    let cancelled = false
    fetchShipmentsWithContacts(orgId).then((data) => {
      if (!cancelled) setShipments(data)
    })
    fetchHsCodes().then((data) => {
      if (!cancelled) setHsCodes(data)
    })
    return () => {
      cancelled = true
    }
  }, [orgId])

  function handleShipmentSelect(id: string) {
    setShipmentId(id)
    const shipment = shipments.find((s) => s.id === id)
    setShipperName(shipment?.shipper_contact?.name ?? '')
    setConsigneeName(shipment?.consignee_contact?.name ?? shipment?.client ?? '')
  }

  const hsMatches = useMemo(() => {
    const q = hsSearch.trim().toLowerCase()
    if (!q) return hsCodes.slice(0, 8)
    return hsCodes.filter((h) => h.hs_code.toLowerCase().includes(q) || h.description.toLowerCase().includes(q)).slice(0, 8)
  }, [hsCodes, hsSearch])

  const assessableValueN = Math.max(0, parseFloat(assessableValue) || 0)
  const bcdAmount = hsCode ? (assessableValueN * hsCode.basic_customs_duty_pct) / 100 : 0
  const swsAmount = hsCode ? (bcdAmount * hsCode.social_welfare_surcharge_pct) / 100 : 0
  const igstAmount = hsCode ? ((assessableValueN + bcdAmount + swsAmount) * hsCode.igst_pct) / 100 : 0
  const totalDuty = bcdAmount + swsAmount + igstAmount

  function goNext() {
    if (step === 0 && !shipmentId) {
      setFieldErrors({ shipmentId: 'Select a shipment' })
      return
    }
    if (step === 1) {
      const errs: typeof fieldErrors = {}
      if (!goodsDescription.trim()) errs.goodsDescription = 'Goods description is required'
      if (!hsCode) errs.hsCode = 'Select an HS code'
      if (assessableValueN <= 0) errs.assessableValue = 'Assessable value must be greater than 0'
      if (Object.keys(errs).length > 0) {
        setFieldErrors(errs)
        return
      }
    }
    setFieldErrors({})
    setError(null)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function goBack() {
    setError(null)
    setStep((s) => Math.max(s - 1, 0))
  }

  async function handleSubmit() {
    if (!user || !hsCode) return
    setBusy(true)
    setError(null)

    const base = {
      org_id: orgId,
      filing_type: filingType,
      shipment_id: shipmentId || null,
      shipper_name: shipperName.trim() || null,
      consignee_name: consigneeName.trim() || null,
      goods_description: goodsDescription.trim(),
      hs_code: hsCode.hs_code,
      assessable_value_inr: assessableValueN,
      bcd_amount_inr: bcdAmount,
      sws_amount_inr: swsAmount,
      igst_amount_inr: igstAmount,
      total_duty_inr: totalDuty,
      status: 'filed',
      filed_at: new Date().toISOString(),
      created_by: user.id,
    }

    const { data, error: lastError } = await insertCustomsFiling(base, filingType)
    if (data) {
      onCreated(data)
      setBusy(false)
      return
    }

    if (lastError && isCheckViolation(lastError, 'customs_filings_assessable_value_inr_check')) {
      setFieldErrors({ assessableValue: 'Assessable value must be greater than 0' })
      setStep(1)
    } else {
      setError(lastError?.message ?? 'Could not create filing')
    }
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
          maxWidth: 620,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 14,
          padding: 26,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>New Customs Filing</div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: busy ? 'not-allowed' : 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
          {STEPS.map((label, i) => (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: i <= step ? '#2563eb' : '#1e293b',
                  marginBottom: 6,
                }}
              />
              <div style={{ fontSize: 10.5, fontWeight: 600, color: i === step ? '#e2e8f0' : '#5b6b82' }}>
                {i + 1}. {label}
              </div>
            </div>
          ))}
        </div>

        {step === 0 && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Filing Type</label>
              <div
                style={{
                  background: '#0b1220',
                  border: '1px solid #1e293b',
                  borderRadius: 9,
                  padding: 3,
                  display: 'flex',
                  gap: 2,
                }}
              >
                {filingTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFilingType(t)}
                    style={{
                      flex: 1,
                      padding: 8,
                      borderRadius: 6,
                      border: 'none',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: filingType === t ? '#2563eb' : 'transparent',
                      color: filingType === t ? '#fff' : '#8291a6',
                    }}
                  >
                    {CUSTOMS_FILING_TYPE_META[t].label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Shipment</label>
              <select value={shipmentId} onChange={(e) => handleShipmentSelect(e.target.value)} style={inputStyle}>
                <option value="">— Select a shipment —</option>
                {shipments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.ref} — {s.origin} → {s.destination}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.shipmentId} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Shipper</label>
                <input type="text" value={shipperName} onChange={(e) => setShipperName(e.target.value)} style={inputStyle} placeholder="Auto-filled from shipment" />
              </div>
              <div>
                <label style={labelStyle}>Consignee</label>
                <input type="text" value={consigneeName} onChange={(e) => setConsigneeName(e.target.value)} style={inputStyle} placeholder="Auto-filled from shipment" />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Goods Description</label>
              <textarea
                value={goodsDescription}
                onChange={(e) => setGoodsDescription(e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="e.g. Cotton knitted T-shirts, men's"
              />
              <FieldError message={fieldErrors.goodsDescription} />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={labelStyle}>
                HS Code
                <InfoTooltip text="Search by code or keyword. Duty rates for every match are shown before you pick — so you can see the tax impact of a classification instead of guessing, then finding out later." />
              </label>
              <input
                type="text"
                value={hsSearch}
                onChange={(e) => setHsSearch(e.target.value)}
                style={inputStyle}
                placeholder="Search by HS code or goods keyword (e.g. 'mobile', 'cotton', '8517')"
              />
            </div>

            <div
              style={{
                border: '1px solid #1e293b',
                borderRadius: 9,
                overflow: 'hidden',
                marginBottom: 8,
                maxHeight: 220,
                overflowY: 'auto',
              }}
            >
              {hsMatches.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: '#475569', fontSize: 12.5 }}>No matching HS codes.</div>
              )}
              {hsMatches.map((h) => (
                <button
                  key={h.hs_code}
                  type="button"
                  onClick={() => setHsCode(h)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    border: 'none',
                    borderBottom: '1px solid #172033',
                    background: hsCode?.hs_code === h.hs_code ? 'rgba(37,99,235,0.14)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 12.5, color: '#f1f5f9' }}>
                      {h.hs_code}
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      BCD {h.basic_customs_duty_pct}% · IGST {h.igst_pct}%
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{h.description}</div>
                </button>
              ))}
            </div>
            <FieldError message={fieldErrors.hsCode} />

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Assessable Value (INR)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={assessableValue}
                onChange={(e) => setAssessableValue(e.target.value)}
                style={inputStyle}
              />
              <FieldError message={fieldErrors.assessableValue} />
            </div>
          </div>
        )}

        {step === 2 && hsCode && (
          <div>
            <div style={{ fontSize: 12.5, color: '#94a3b8', marginBottom: 14 }}>
              {hsCode.hs_code} — {hsCode.description}
            </div>
            <DutyRow
              label="Basic Customs Duty (BCD)"
              tooltip={`Assessable value × ${hsCode.basic_customs_duty_pct}% BCD rate for this HS code.`}
              value={bcdAmount}
            />
            <DutyRow
              label="Social Welfare Surcharge (SWS)"
              tooltip={`BCD amount × ${hsCode.social_welfare_surcharge_pct}% — levied on the BCD, not the assessable value.`}
              value={swsAmount}
            />
            <DutyRow
              label="IGST"
              tooltip={`${hsCode.igst_pct}% applied on (assessable value + BCD + SWS) — the real Indian customs duty stacking order.`}
              value={igstAmount}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#0b1220',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: '12px 14px',
                marginTop: 8,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>Total Duty Payable</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#4ade80', fontFamily: "'IBM Plex Mono', monospace" }}>
                ₹{totalDuty.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: '#5b6b82' }}>
              Simulated duty estimate — illustrative only, not a substitute for actual CBIC/ICEGATE assessment.
            </div>
          </div>
        )}

        {step === 3 && hsCode && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14, fontSize: 12.5 }}>
              <ReviewField label="Filing Type" value={CUSTOMS_FILING_TYPE_META[filingType].label} />
              <ReviewField label="Shipment" value={shipments.find((s) => s.id === shipmentId)?.ref ?? '—'} />
              <ReviewField label="Shipper" value={shipperName || '—'} />
              <ReviewField label="Consignee" value={consigneeName || '—'} />
              <ReviewField label="HS Code" value={`${hsCode.hs_code} — ${hsCode.description}`} />
              <ReviewField label="Assessable Value" value={`₹${assessableValueN.toLocaleString('en-IN')}`} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Goods Description</div>
              <div style={{ fontSize: 12.5, color: '#e2e8f0' }}>{goodsDescription}</div>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#0b1220',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: '12px 14px',
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>Total Duty Payable</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#4ade80', fontFamily: "'IBM Plex Mono', monospace" }}>
                ₹{totalDuty.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div
              style={{
                background: 'rgba(251,191,36,0.08)',
                border: '1px solid rgba(251,191,36,0.25)',
                color: '#fbbf24',
                fontSize: 11.5,
                borderRadius: 8,
                padding: '9px 12px',
                marginBottom: 14,
              }}
            >
              This is a simulated filing — no live submission is made to ICEGATE or any government system.
            </div>
          </div>
        )}

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
            onClick={step === 0 ? onClose : goBack}
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
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <button
            type="button"
            onClick={step === STEPS.length - 1 ? () => void handleSubmit() : goNext}
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
            {busy ? 'Filing…' : step === STEPS.length - 1 ? 'Submit Filing' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DutyRow({ label, tooltip, value }: { label: string; tooltip: string; value: number }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '9px 2px',
        borderBottom: '1px solid #172033',
      }}
    >
      <div style={{ fontSize: 12.5, color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
        {label}
        <InfoTooltip text={tooltip} />
      </div>
      <div style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: '#e2e8f0' }}>
        ₹{value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </div>
    </div>
  )
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: '#64748b', marginBottom: 2 }}>{label}</div>
      <div style={{ color: '#e2e8f0' }}>{value}</div>
    </div>
  )
}
