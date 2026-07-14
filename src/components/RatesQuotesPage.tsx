import { Fragment, useEffect, useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabaseClient'
import { generateRef, shipmentRefPrefix } from '../lib/refGenerator'
import TariffModal from './TariffModal'
import QuoteModal from './QuoteModal'
import EsignPanel from './EsignPanel'
import { renderQuoteHtml } from '../lib/documentHtml'
import { MODE_META, type Quote, type Shipment, type Tariff } from '../types'

type Tab = 'tariffs' | 'quotes'
type QuoteWithShipmentRef = Quote & { converted_shipment: { ref: string } | null }

const tabButtonStyle = (active: boolean): CSSProperties => ({
  padding: '6px 13px',
  borderRadius: 6,
  border: 'none',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  background: active ? '#1e293b' : 'transparent',
  color: active ? '#f1f5f9' : '#8291a6',
})

const headStyle: CSSProperties = {
  padding: '13px 20px',
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const cellStyle: CSSProperties = { padding: '14px 20px' }

const actionButtonStyle: CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid #1e293b',
  background: 'transparent',
  color: '#94a3b8',
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
}

interface RatesQuotesPageProps {
  orgId: string
  userId: string
  onBookingCreated: (shipment: Shipment) => void
}

export default function RatesQuotesPage({ orgId, userId, onBookingCreated }: RatesQuotesPageProps) {
  const [tab, setTab] = useState<Tab>('tariffs')

  const [tariffs, setTariffs] = useState<Tariff[]>([])
  const [tariffsLoading, setTariffsLoading] = useState(true)
  const [tariffsError, setTariffsError] = useState<string | null>(null)
  const [tariffModalOpen, setTariffModalOpen] = useState(false)
  const [editingTariff, setEditingTariff] = useState<Tariff | null>(null)

  const [quotes, setQuotes] = useState<QuoteWithShipmentRef[]>([])
  const [quotesLoading, setQuotesLoading] = useState(true)
  const [quotesError, setQuotesError] = useState<string | null>(null)
  const [quoteModalOpen, setQuoteModalOpen] = useState(false)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null)
  const [convertError, setConvertError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setTariffsLoading(true)
    setTariffsError(null)
    supabase
      .from('tariffs')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setTariffsError(error.message)
        else if (data) setTariffs(data as Tariff[])
        setTariffsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  useEffect(() => {
    let cancelled = false
    setQuotesLoading(true)
    setQuotesError(null)
    supabase
      .from('quotes')
      .select('*, converted_shipment:shipments!converted_shipment_id(ref)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setQuotesError(error.message)
        else if (data) setQuotes(data as unknown as QuoteWithShipmentRef[])
        setQuotesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  function handleTariffSaved(tariff: Tariff) {
    setTariffs((prev) => {
      const exists = prev.some((t) => t.id === tariff.id)
      return exists ? prev.map((t) => (t.id === tariff.id ? tariff : t)) : [tariff, ...prev]
    })
    setTariffModalOpen(false)
  }

  function handleQuoteCreated(quote: Quote) {
    setQuotes((prev) => [{ ...quote, converted_shipment: null }, ...prev])
    setQuoteModalOpen(false)
  }

  function handleAddClick() {
    if (tab === 'tariffs') {
      setEditingTariff(null)
      setTariffModalOpen(true)
    } else {
      setQuoteModalOpen(true)
    }
  }

  async function handleConvert(quote: Quote) {
    setConvertingId(quote.id)
    setConvertError(null)

    const base = {
      org_id: orgId,
      mode: quote.mode,
      client: quote.consignee_name,
      shipper_contact_id: quote.shipper_contact_id,
      consignee_contact_id: quote.consignee_contact_id,
      origin: quote.origin,
      destination: quote.destination,
      status: 'Booked',
      created_by: userId,
    }

    let newShipment: Shipment | null = null
    let lastError: string | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error: insertError } = await supabase
        .from('shipments')
        .insert({ ...base, ref: generateRef(shipmentRefPrefix(quote.mode)) })
        .select()
        .single()

      if (!insertError && data) {
        newShipment = data as Shipment
        break
      }
      lastError = insertError?.message ?? 'Could not create booking'
      if (insertError?.code !== '23505') break
    }

    if (!newShipment) {
      setConvertError(lastError)
      setConvertingId(null)
      return
    }

    const { data: updatedQuote, error: updateError } = await supabase
      .from('quotes')
      .update({ status: 'converted', converted_shipment_id: newShipment.id })
      .eq('id', quote.id)
      .select('*, converted_shipment:shipments!converted_shipment_id(ref)')
      .single()

    if (updateError || !updatedQuote) {
      setConvertError(updateError?.message ?? 'Booking created, but could not update the quote')
      setConvertingId(null)
      return
    }

    setQuotes((prev) => prev.map((q) => (q.id === quote.id ? (updatedQuote as unknown as QuoteWithShipmentRef) : q)))
    onBookingCreated(newShipment)
    setConvertingId(null)
  }

  return (
    <div style={{ padding: '28px 32px', flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 14 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>Rates &amp; Quotes</h1>
        <button
          type="button"
          onClick={handleAddClick}
          style={{
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            fontWeight: 600,
            fontSize: 13,
            padding: '9px 16px',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          {tab === 'tariffs' ? '+ Add Tariff' : '+ New Quote'}
        </button>
      </div>

      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 9, padding: 3, display: 'flex', gap: 2, marginBottom: 20, width: 'fit-content' }}>
        <button type="button" onClick={() => setTab('tariffs')} style={tabButtonStyle(tab === 'tariffs')}>
          Tariffs
        </button>
        <button type="button" onClick={() => setTab('quotes')} style={tabButtonStyle(tab === 'quotes')}>
          Quotes
        </button>
      </div>

      {tab === 'tariffs' && (
        <>
          {tariffsError ? (
            <ErrorBox message={tariffsError} />
          ) : (
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e293b', background: 'rgba(255,255,255,0.02)' }}>
                    <th style={headStyle}>Mode</th>
                    <th style={headStyle}>Route</th>
                    <th style={headStyle}>Rate</th>
                    <th style={headStyle}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {tariffs.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => {
                        setEditingTariff(t)
                        setTariffModalOpen(true)
                      }}
                      style={{ borderBottom: '1px solid #172033', cursor: 'pointer' }}
                    >
                      <td style={{ ...cellStyle, fontSize: 12.5, fontWeight: 600, color: MODE_META[t.mode].color }}>{MODE_META[t.mode].label}</td>
                      <td style={{ ...cellStyle, fontSize: 13, color: '#e2e8f0' }}>
                        {t.origin} → {t.destination}
                      </td>
                      <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: '#4ade80' }}>
                        ₹{t.rate.toLocaleString('en-IN')}
                      </td>
                      <td style={{ ...cellStyle, fontSize: 12.5, color: '#94a3b8' }}>{t.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!tariffsLoading && tariffs.length === 0 && <EmptyState label="No tariffs yet." />}
              {tariffsLoading && <EmptyState label="Loading tariffs…" />}
            </div>
          )}
        </>
      )}

      {tab === 'quotes' && (
        <>
          {convertError && <ErrorBox message={convertError} />}
          {quotesError ? (
            <ErrorBox message={quotesError} />
          ) : (
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e293b', background: 'rgba(255,255,255,0.02)' }}>
                    <th style={headStyle}>Ref</th>
                    <th style={headStyle}>Route</th>
                    <th style={headStyle}>Client</th>
                    <th style={headStyle}>Total</th>
                    <th style={headStyle}>Status</th>
                    <th style={headStyle}>E-Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => (
                    <Fragment key={q.id}>
                      <tr style={{ borderBottom: '1px solid #172033' }}>
                        <td style={{ ...cellStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13, color: '#f1f5f9' }}>{q.ref}</td>
                        <td style={{ ...cellStyle, fontSize: 12 }}>
                          <div style={{ fontWeight: 600, color: '#cbd5e1' }}>{q.origin}</div>
                          <div style={{ color: '#5b6b82' }}>→ {q.destination}</div>
                        </td>
                        <td style={{ ...cellStyle, fontSize: 13, color: '#94a3b8' }}>{q.consignee_name}</td>
                        <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: '#4ade80' }}>
                          ₹{q.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                        <td style={cellStyle}>
                          {q.status === 'draft' ? (
                            <button
                              type="button"
                              disabled={convertingId === q.id}
                              onClick={() => void handleConvert(q)}
                              style={actionButtonStyle}
                            >
                              {convertingId === q.id ? 'Converting…' : 'Convert to Booking'}
                            </button>
                          ) : (
                            <span style={{ fontSize: 11.5, color: '#4ade80', fontWeight: 600 }}>
                              ● Converted{q.converted_shipment ? ` — ${q.converted_shipment.ref}` : ''}
                            </span>
                          )}
                        </td>
                        <td style={cellStyle}>
                          <button type="button" onClick={() => setExpandedQuoteId((prev) => (prev === q.id ? null : q.id))} style={actionButtonStyle}>
                            {expandedQuoteId === q.id ? 'Hide' : 'E-Sign'}
                          </button>
                        </td>
                      </tr>
                      {expandedQuoteId === q.id && (
                        <tr style={{ borderBottom: '1px solid #172033', background: 'rgba(255,255,255,0.015)' }}>
                          <td colSpan={6} style={{ padding: '10px 20px 16px' }}>
                            <EsignPanel
                              orgId={orgId}
                              documentType="quote"
                              documentRef={q.ref}
                              documentLabel="Quote"
                              quoteId={q.id}
                              defaultRecipientName={q.consignee_name}
                              buildHtml={() => renderQuoteHtml(q)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {!quotesLoading && quotes.length === 0 && <EmptyState label="No quotes yet." />}
              {quotesLoading && <EmptyState label="Loading quotes…" />}
            </div>
          )}
        </>
      )}

      {tariffModalOpen && (
        <TariffModal orgId={orgId} tariff={editingTariff} onClose={() => setTariffModalOpen(false)} onSaved={handleTariffSaved} />
      )}

      {quoteModalOpen && <QuoteModal orgId={orgId} onClose={() => setQuoteModalOpen(false)} onCreated={handleQuoteCreated} />}
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      style={{
        background: 'rgba(244,63,94,0.08)',
        border: '1px solid rgba(244,63,94,0.3)',
        borderRadius: 12,
        padding: 24,
        textAlign: 'center',
        marginBottom: 16,
      }}
    >
      <div style={{ color: '#fb7185', fontSize: 13.5 }}>{message}</div>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 13 }}>{label}</div>
}
