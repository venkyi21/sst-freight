import { Fragment, useEffect, useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabaseClient'
import { generateRef, shipmentRefPrefix } from '../lib/refGenerator'
import TariffModal from './TariffModal'
import QuoteModal from './QuoteModal'
import EsignPanel from './EsignPanel'
import { fetchQuoteLineItems, renderQuoteHtml } from '../lib/documentHtml'
import { MODE_META, QUOTE_STATUS_META, type Quote, type QuoteStatus, type Shipment, type Tariff } from '../types'

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
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectionDraft, setRejectionDraft] = useState('')
  const [showArchivedQuotes, setShowArchivedQuotes] = useState(false)

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

  // Week 15 (ADR-0022): a plain client update — validate_quote_status_transition() on the DB
  // side is the real enforcement (rejects anything not in the allowed-pairs set), so this stays a
  // simple call with no client-side state-machine logic to keep in sync with the server.
  async function handleStatusUpdate(quote: Quote, newStatus: QuoteStatus, rejectionReason?: string) {
    setStatusBusyId(quote.id)
    setConvertError(null)
    const { data, error } = await supabase
      .from('quotes')
      .update({ status: newStatus, rejection_reason: rejectionReason ?? null })
      .eq('id', quote.id)
      .select('*, converted_shipment:shipments!converted_shipment_id(ref)')
      .single()
    if (error || !data) {
      setConvertError(error?.message ?? 'Could not update quote status')
    } else {
      setQuotes((prev) => prev.map((q) => (q.id === quote.id ? (data as unknown as QuoteWithShipmentRef) : q)))
      setRejectingId(null)
      setRejectionDraft('')
    }
    setStatusBusyId(null)
  }

  async function handleArchiveToggle(quote: Quote) {
    setStatusBusyId(quote.id)
    const { data, error } = await supabase
      .from('quotes')
      .update({ archived: !quote.archived })
      .eq('id', quote.id)
      .select('*, converted_shipment:shipments!converted_shipment_id(ref)')
      .single()
    if (!error && data) {
      setQuotes((prev) => prev.map((q) => (q.id === quote.id ? (data as unknown as QuoteWithShipmentRef) : q)))
    }
    setStatusBusyId(null)
  }

  const visibleQuotes = quotes.filter((q) => showArchivedQuotes || !q.archived)
  const pipelineCounts = visibleQuotes.reduce(
    (acc, q) => ({ ...acc, [q.status]: (acc[q.status] ?? 0) + 1 }),
    {} as Partial<Record<QuoteStatus, number>>,
  )

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

          {/* Week 15 (ADR-0022): pipeline visibility — every non-terminal quote used to just say
              "draft," this makes the whole funnel visible at a glance, computed client-side from
              the quotes already fetched below, no new query. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
            {(['draft', 'sent', 'accepted', 'rejected', 'converted'] as const).map((s) => (
              <div key={s} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: '11px 14px' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: QUOTE_STATUS_META[s].color, fontFamily: "'IBM Plex Mono', monospace" }}>
                  {pipelineCounts[s] ?? 0}
                </div>
                <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {QUOTE_STATUS_META[s].label}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#94a3b8', cursor: 'pointer' }}>
              <input type="checkbox" checked={showArchivedQuotes} onChange={(e) => setShowArchivedQuotes(e.target.checked)} />
              Show archived
            </label>
          </div>

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
                    <th style={headStyle}>Archive</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleQuotes.map((q) => (
                    <Fragment key={q.id}>
                      <tr style={{ borderBottom: '1px solid #172033', opacity: q.archived ? 0.55 : 1 }}>
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
                          {rejectingId === q.id ? (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <input
                                type="text"
                                value={rejectionDraft}
                                onChange={(e) => setRejectionDraft(e.target.value)}
                                placeholder="Reason (optional)"
                                style={{
                                  background: '#0b1220',
                                  border: '1px solid #1e293b',
                                  borderRadius: 6,
                                  padding: '5px 8px',
                                  fontSize: 11.5,
                                  color: '#e2e8f0',
                                  width: 140,
                                }}
                              />
                              <button
                                type="button"
                                disabled={statusBusyId === q.id}
                                onClick={() => void handleStatusUpdate(q, 'rejected', rejectionDraft.trim() || undefined)}
                                style={{ ...actionButtonStyle, color: '#fb7185', borderColor: 'rgba(244,63,94,0.3)' }}
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectingId(null)
                                  setRejectionDraft('')
                                }}
                                style={actionButtonStyle}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
                              <span
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  color: QUOTE_STATUS_META[q.status].color,
                                  background: QUOTE_STATUS_META[q.status].bg,
                                  padding: '2px 8px',
                                  borderRadius: 20,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {QUOTE_STATUS_META[q.status].label}
                                {q.status === 'converted' && q.converted_shipment ? ` — ${q.converted_shipment.ref}` : ''}
                              </span>
                              {q.status === 'rejected' && q.rejection_reason && (
                                <span style={{ fontSize: 10.5, color: '#64748b' }}>“{q.rejection_reason}”</span>
                              )}
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {q.status === 'draft' && (
                                  <button
                                    type="button"
                                    disabled={statusBusyId === q.id}
                                    onClick={() => void handleStatusUpdate(q, 'sent')}
                                    style={actionButtonStyle}
                                  >
                                    Send
                                  </button>
                                )}
                                {q.status === 'sent' && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={statusBusyId === q.id}
                                      onClick={() => void handleStatusUpdate(q, 'accepted')}
                                      style={{ ...actionButtonStyle, color: '#4ade80', borderColor: 'rgba(34,197,94,0.3)' }}
                                    >
                                      Mark Accepted
                                    </button>
                                    <button
                                      type="button"
                                      disabled={statusBusyId === q.id}
                                      onClick={() => setRejectingId(q.id)}
                                      style={{ ...actionButtonStyle, color: '#fb7185', borderColor: 'rgba(244,63,94,0.3)' }}
                                    >
                                      Mark Rejected
                                    </button>
                                  </>
                                )}
                                {(q.status === 'draft' || q.status === 'sent' || q.status === 'accepted') && (
                                  <button
                                    type="button"
                                    disabled={convertingId === q.id}
                                    onClick={() => void handleConvert(q)}
                                    style={actionButtonStyle}
                                  >
                                    {convertingId === q.id ? 'Converting…' : 'Convert to Booking'}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                        <td style={cellStyle}>
                          <button type="button" onClick={() => setExpandedQuoteId((prev) => (prev === q.id ? null : q.id))} style={actionButtonStyle}>
                            {expandedQuoteId === q.id ? 'Hide' : 'E-Sign'}
                          </button>
                        </td>
                        <td style={cellStyle}>
                          <button
                            type="button"
                            disabled={statusBusyId === q.id}
                            onClick={() => void handleArchiveToggle(q)}
                            style={actionButtonStyle}
                          >
                            {q.archived ? 'Unarchive' : 'Archive'}
                          </button>
                        </td>
                      </tr>
                      {expandedQuoteId === q.id && (
                        <tr style={{ borderBottom: '1px solid #172033', background: 'rgba(255,255,255,0.015)' }}>
                          <td colSpan={7} style={{ padding: '10px 20px 16px' }}>
                            <EsignPanel
                              orgId={orgId}
                              documentType="quote"
                              documentRef={q.ref}
                              documentLabel="Quote"
                              quoteId={q.id}
                              defaultRecipientName={q.consignee_name}
                              buildHtml={async () => renderQuoteHtml(q, await fetchQuoteLineItems(q.id))}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {!quotesLoading && visibleQuotes.length === 0 && <EmptyState label="No quotes yet." />}
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
