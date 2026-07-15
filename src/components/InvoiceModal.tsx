import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchContactState } from '../api/contacts'
import { fetchQuoteByConvertedShipmentId, fetchQuoteLineItems } from '../api/quotes'
import { fetchShipments } from '../api/shipments'
import { fetchOrgGstState, insertInvoice, insertInvoiceLineItems } from '../api/accounting'
import FieldError from './FieldError'
import InfoTooltip from './InfoTooltip'
import { isCheckViolation } from '../lib/formErrors'
import { fetchFxRateToInr } from '../lib/fxRates'
import { determineSupplyType, computeGstAmounts } from '../lib/gst'
import { INVOICE_CURRENCIES, type Invoice, type InvoiceLineItem, type MembershipRole, type Shipment } from '../types'

interface InvoiceModalProps {
  orgId: string
  currentRole: MembershipRole
  onClose: () => void
  onCreated: (invoice: Invoice) => void
}

interface LineItemDraft {
  description: string
  sacCode: string
  quantity: string
  rate: string
  gstRate: string
}

function blankLineItem(description = ''): LineItemDraft {
  return { description, sacCode: '', quantity: '1', rate: '', gstRate: '18' }
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
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([blankLineItem('Freight')])
  const [orgGstState, setOrgGstState] = useState<string | null>(null)
  const [contactState, setContactState] = useState<string | null>(null)
  const [carryoverNote, setCarryoverNote] = useState<string | null>(null)
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ shipmentId?: string; lineItems?: string; fxRate?: string }>({})

  useEffect(() => {
    let cancelled = false
    fetchShipments(orgId).then(({ data }) => {
      if (!cancelled && data) setShipments(data)
    })
    return () => {
      cancelled = true
    }
  }, [orgId])

  useEffect(() => {
    let cancelled = false
    fetchOrgGstState(orgId).then((state) => {
      if (!cancelled) setOrgGstState(state)
    })
    return () => {
      cancelled = true
    }
  }, [orgId])

  // Week 14 (ADR-0021): picking a shipment does two things — looks up the billed contact's state
  // (for the CGST/SGST-vs-IGST split below) and checks whether this shipment came from a
  // converted quote, carrying that quote's line items over 1:1 (zero re-entry) if so.
  useEffect(() => {
    let cancelled = false
    if (!shipmentId) {
      setContactState(null)
      setCarryoverNote(null)
      return
    }
    const shipment = shipments.find((s) => s.id === shipmentId)
    ;(async () => {
      if (shipment?.consignee_contact_id) {
        const state = await fetchContactState(shipment.consignee_contact_id)
        if (!cancelled) setContactState(state)
      } else if (!cancelled) {
        setContactState(null)
      }

      const quote = await fetchQuoteByConvertedShipmentId(shipmentId)
      if (quote) {
        const quoteItems = await fetchQuoteLineItems(quote.id)
        if (!cancelled && quoteItems.length > 0) {
          setLineItems(
            quoteItems.map((qi) => ({
              description: qi.description,
              sacCode: qi.sac_code ?? '',
              quantity: String(qi.quantity),
              rate: String(qi.rate),
              gstRate: '18',
            })),
          )
          setCarryoverNote(`Line items carried over from quote ${quote.ref} — nothing retyped.`)
          return
        }
      }
      if (!cancelled) {
        setLineItems([blankLineItem('Freight')])
        setCarryoverNote(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [shipmentId, shipments])

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

  const rateN = Math.max(0, parseFloat(fxRate) || 0)
  const supplyType = determineSupplyType(orgGstState, contactState)
  const lineComputed = lineItems.map((li) => {
    const quantityN = Math.max(0, parseFloat(li.quantity) || 0)
    const unitRateN = Math.max(0, parseFloat(li.rate) || 0)
    const gstRateN = Math.max(0, parseFloat(li.gstRate) || 0)
    const taxableValue = quantityN * unitRateN
    const { cgstAmount, sgstAmount, igstAmount } = computeGstAmounts(taxableValue, gstRateN, supplyType)
    return { quantityN, unitRateN, gstRateN, taxableValue, cgstAmount, sgstAmount, igstAmount, lineTotal: taxableValue + cgstAmount + sgstAmount + igstAmount }
  })
  const totalTaxable = lineComputed.reduce((sum, l) => sum + l.taxableValue, 0)
  const totalCgst = lineComputed.reduce((sum, l) => sum + l.cgstAmount, 0)
  const totalSgst = lineComputed.reduce((sum, l) => sum + l.sgstAmount, 0)
  const totalIgst = lineComputed.reduce((sum, l) => sum + l.igstAmount, 0)
  const amountN = lineComputed.reduce((sum, l) => sum + l.lineTotal, 0)
  const amountInr = amountN * rateN
  const lineItemsValid = lineItems.length > 0 && lineItems.every((li, i) => li.description.trim() && lineComputed[i].quantityN > 0 && lineComputed[i].unitRateN > 0)
  const valid = shipmentId && lineItemsValid && rateN > 0

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
        shipmentId: shipmentId ? undefined : 'Select a shipment',
        lineItems: lineItemsValid ? undefined : 'Every line needs a description, quantity, and rate greater than 0',
        fxRate: rateN > 0 ? undefined : 'FX rate must be greater than 0',
      })
      return
    }
    if (!user) return
    setFieldErrors({})
    setBusy(true)

    const shipment = shipments.find((s) => s.id === shipmentId)
    if (!shipment) {
      setError('Selected shipment not found')
      setBusy(false)
      return
    }

    // Line item #1 also backfills nothing on invoices (unlike quotes, there's no legacy
    // rate/quantity column here) — amount/amount_inr already are the stored, authoritative
    // totals (ADR-0007's existing precedent), now sourced from summed line items.
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

    const { data: invoice, error: lastError } = await insertInvoice(base)

    if (!invoice) {
      if (lastError && isCheckViolation(lastError, 'invoices_amount_check')) {
        setFieldErrors({ lineItems: 'Every line needs a rate and quantity greater than 0' })
      } else if (lastError && isCheckViolation(lastError, 'invoices_fx_rate_check')) {
        setFieldErrors({ fxRate: 'FX rate must be greater than 0' })
      } else {
        setError(lastError?.message ?? 'Could not create invoice')
      }
      setBusy(false)
      return
    }

    const lineItemRows: Omit<InvoiceLineItem, 'id' | 'created_at'>[] = lineItems.map((li, i) => ({
      org_id: orgId,
      invoice_id: invoice.id,
      description: li.description.trim(),
      sac_code: li.sacCode.trim() || null,
      quantity: lineComputed[i].quantityN,
      rate: lineComputed[i].unitRateN,
      currency,
      taxable_value: lineComputed[i].taxableValue,
      gst_rate: lineComputed[i].gstRateN,
      cgst_amount: lineComputed[i].cgstAmount,
      sgst_amount: lineComputed[i].sgstAmount,
      igst_amount: lineComputed[i].igstAmount,
      line_total: lineComputed[i].lineTotal,
      created_by: user.id,
    }))

    const { error: lineItemsError } = await insertInvoiceLineItems(lineItemRows)
    if (lineItemsError) {
      // Same accepted non-atomicity as QuoteModal's line-item insert — the invoice row itself is
      // real and onCreated below closes this modal regardless, so it's logged, not surfaced.
      console.error(`Invoice ${invoice.ref} line items failed to save:`, lineItemsError)
    }

    onCreated(invoice)
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
          maxWidth: 660,
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
            <FieldError message={fieldErrors.shipmentId} />
            {carryoverNote && <div style={{ marginTop: 6, fontSize: 11.5, color: '#4ade80' }}>✓ {carryoverNote}</div>}
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
              <label style={labelStyle}>
                FX Rate (→ INR)
                <InfoTooltip text="Live-fetched from a public exchange-rate API the moment you pick a non-INR currency. Only an Owner or Admin can edit it, and only at creation — it's locked afterward (ADR-0007)." />
              </label>
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
              <FieldError message={fieldErrors.fxRate} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Due Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }} />
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
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.8fr 0.9fr 0.6fr 0.8fr 0.6fr auto', gap: 6, alignItems: 'center' }}>
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
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={li.gstRate}
                    onChange={(e) => updateLineItem(i, { gstRate: e.target.value })}
                    placeholder="GST %"
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
              background: '#0b1220',
              border: '1px solid #1e293b',
              borderRadius: 8,
              padding: '12px 14px',
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 11.5, marginBottom: 10, color: supplyType.stateUnknown ? '#fbbf24' : '#5b6b82' }}>
              {supplyType.stateUnknown
                ? '⚠ Set this client\'s state (Directory → Contacts) for an accurate CGST/SGST-vs-IGST split — defaulting to inter-state (IGST) for now.'
                : supplyType.isSameState
                  ? 'Same state as your business → CGST + SGST'
                  : 'Different state from your business → IGST, auto-computed'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 6, fontSize: 12.5, color: '#94a3b8' }}>
              <div>Taxable value</div>
              <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{currency} {totalTaxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
              {totalCgst > 0 || totalSgst > 0 ? (
                <>
                  <div>CGST</div>
                  <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{currency} {totalCgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                  <div>SGST</div>
                  <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{currency} {totalSgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                </>
              ) : (
                <>
                  <div>IGST</div>
                  <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{currency} {totalIgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                </>
              )}
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
            <div style={{ fontSize: 11, color: '#64748b' }}>
              Amount in INR
              <InfoTooltip text="Sum of line items (incl. GST) × FX Rate, calculated live and stored on the invoice at creation — never recomputed later, even if the FX rate is edited afterward." />
            </div>
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
              {busy ? 'Creating…' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
