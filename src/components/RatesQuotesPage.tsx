import { Fragment, useState, type CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { quotesQueryKey, tariffsQueryKey, useArchiveQuote, useConvertQuote, useQuotes, useTariffs, useUpdateQuoteStatus } from '../hooks/useQuotes'
import TariffModal from './TariffModal'
import QuoteModal from './QuoteModal'
import EsignPanel from './EsignPanel'
import { fetchQuoteLineItems, renderQuoteHtml } from '../lib/documentHtml'
import { MODE_META, QUOTE_STATUS_META, type Quote, type QuoteStatus, type Shipment, type Tariff } from '../types'
import { T } from '../theme/tokens'

type Tab = 'tariffs' | 'quotes'

const tabButtonStyle = (active: boolean): CSSProperties => ({
  padding: '6px 13px',
  borderRadius: 6,
  border: 'none',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  background: active ? T.surfaceInset : 'transparent',
  color: active ? T.ink : T.muted,
})

const headStyle: CSSProperties = {
  padding: '13px 20px',
  fontSize: 11,
  fontWeight: 600,
  color: T.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const cellStyle: CSSProperties = { padding: '14px 20px' }

const actionButtonStyle: CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  border: `1px solid ${T.border}`,
  background: 'transparent',
  color: T.muted,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
}

interface RatesQuotesPageProps {
  orgId: string
  onBookingCreated: (shipment: Shipment) => void
}

// userId prop dropped in ADR-0030 — created_by attribution now happens server-side in the
// quotes-service tier / convert RPC via auth.uid(), not from a client-supplied value.
export default function RatesQuotesPage({ orgId, onBookingCreated }: RatesQuotesPageProps) {
  const [tab, setTab] = useState<Tab>('tariffs')
  const queryClient = useQueryClient()

  const { data: tariffs = [], isLoading: tariffsLoading, error: tariffsErrorObj } = useTariffs(orgId)
  const tariffsError = tariffsErrorObj instanceof Error ? tariffsErrorObj.message : null
  const [tariffModalOpen, setTariffModalOpen] = useState(false)
  const [editingTariff, setEditingTariff] = useState<Tariff | null>(null)

  const { data: quotes = [], isLoading: quotesLoading, error: quotesErrorObj } = useQuotes(orgId)
  const quotesError = quotesErrorObj instanceof Error ? quotesErrorObj.message : null
  const [quoteModalOpen, setQuoteModalOpen] = useState(false)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectionDraft, setRejectionDraft] = useState('')
  const [showArchivedQuotes, setShowArchivedQuotes] = useState(false)

  const convertMutation = useConvertQuote(orgId)
  const statusMutation = useUpdateQuoteStatus(orgId)
  const archiveMutation = useArchiveQuote(orgId)

  function handleTariffSaved(_tariff: Tariff) {
    void queryClient.invalidateQueries({ queryKey: tariffsQueryKey(orgId) })
    setTariffModalOpen(false)
  }

  function handleQuoteCreated(_quote: Quote) {
    void queryClient.invalidateQueries({ queryKey: quotesQueryKey(orgId) })
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

    // ADR-0030: the shipment payload is built server-side from the quote row itself, inside
    // one transaction (convert_quote_to_shipment via the quotes-service tier) — a second
    // concurrent click gets a clean "already converted" error with zero rows written.
    const result = await convertMutation.mutateAsync(quote)

    if (!result.newShipment) {
      setConvertError(result.error ?? 'Could not convert quote')
      setConvertingId(null)
      return
    }

    onBookingCreated(result.newShipment)
    setConvertingId(null)
  }

  // Week 15 (ADR-0022): a plain client update — validate_quote_status_transition() on the DB
  // side is the real enforcement (rejects anything not in the allowed-pairs set), so this stays a
  // simple call with no client-side state-machine logic to keep in sync with the server.
  async function handleStatusUpdate(quote: Quote, newStatus: QuoteStatus, rejectionReason?: string) {
    setStatusBusyId(quote.id)
    setConvertError(null)
    const { data, error } = await statusMutation.mutateAsync({ quote, status: newStatus, reason: rejectionReason })
    if (error || !data) {
      setConvertError(error ?? 'Could not update quote status')
    } else {
      setRejectingId(null)
      setRejectionDraft('')
    }
    setStatusBusyId(null)
  }

  async function handleArchiveToggle(quote: Quote) {
    setStatusBusyId(quote.id)
    await archiveMutation.mutateAsync(quote)
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
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: T.ink }}>Rates &amp; Quotes</h1>
        <button
          type="button"
          onClick={handleAddClick}
          style={{
            background: T.accent,
            color: T.onAccent,
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

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 9, padding: 3, display: 'flex', gap: 2, marginBottom: 20, width: 'fit-content' }}>
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
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.rowStripe }}>
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
                      style={{ borderBottom: `1px solid ${T.surfaceRaised}`, cursor: 'pointer' }}
                    >
                      <td style={{ ...cellStyle, fontSize: 12.5, fontWeight: 600, color: MODE_META[t.mode].color }}>{MODE_META[t.mode].label}</td>
                      <td style={{ ...cellStyle, fontSize: 13, color: T.text }}>
                        {t.origin} → {t.destination}
                      </td>
                      <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: T.success }}>
                        ₹{t.rate.toLocaleString('en-IN')}
                      </td>
                      <td style={{ ...cellStyle, fontSize: 12.5, color: T.muted }}>{t.notes ?? '—'}</td>
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
              <div key={s} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '11px 14px' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: QUOTE_STATUS_META[s].color, fontFamily: "'IBM Plex Mono', monospace" }}>
                  {pipelineCounts[s] ?? 0}
                </div>
                <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {QUOTE_STATUS_META[s].label}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: T.muted, cursor: 'pointer' }}>
              <input type="checkbox" checked={showArchivedQuotes} onChange={(e) => setShowArchivedQuotes(e.target.checked)} />
              Show archived
            </label>
          </div>

          {quotesError ? (
            <ErrorBox message={quotesError} />
          ) : (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.rowStripe }}>
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
                      <tr style={{ borderBottom: `1px solid ${T.surfaceRaised}`, opacity: q.archived ? 0.55 : 1 }}>
                        <td style={{ ...cellStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13, color: T.ink }}>{q.ref}</td>
                        <td style={{ ...cellStyle, fontSize: 12 }}>
                          <div style={{ fontWeight: 600, color: T.text }}>{q.origin}</div>
                          <div style={{ color: T.faint }}>→ {q.destination}</div>
                        </td>
                        <td style={{ ...cellStyle, fontSize: 13, color: T.muted }}>{q.consignee_name}</td>
                        <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: T.success }}>
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
                                  background: T.bg,
                                  border: `1px solid ${T.border}`,
                                  borderRadius: 6,
                                  padding: '5px 8px',
                                  fontSize: 11.5,
                                  color: T.text,
                                  width: 140,
                                }}
                              />
                              <button
                                type="button"
                                disabled={statusBusyId === q.id}
                                onClick={() => void handleStatusUpdate(q, 'rejected', rejectionDraft.trim() || undefined)}
                                style={{ ...actionButtonStyle, color: T.danger, borderColor: T.dangerBorder }}
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
                                <span style={{ fontSize: 10.5, color: T.muted }}>“{q.rejection_reason}”</span>
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
                                      style={{ ...actionButtonStyle, color: T.success, borderColor: T.successBorder }}
                                    >
                                      Mark Accepted
                                    </button>
                                    <button
                                      type="button"
                                      disabled={statusBusyId === q.id}
                                      onClick={() => setRejectingId(q.id)}
                                      style={{ ...actionButtonStyle, color: T.danger, borderColor: T.dangerBorder }}
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
                        <tr style={{ borderBottom: `1px solid ${T.surfaceRaised}`, background: T.rowStripe }}>
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
        background: T.dangerWash,
        border: `1px solid ${T.dangerBorder}`,
        borderRadius: 12,
        padding: 24,
        textAlign: 'center',
        marginBottom: 16,
      }}
    >
      <div style={{ color: T.danger, fontSize: 13.5 }}>{message}</div>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return <div style={{ padding: 40, textAlign: 'center', color: T.placeholder, fontSize: 13 }}>{label}</div>
}
