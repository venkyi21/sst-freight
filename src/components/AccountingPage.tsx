import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchShipmentRefs } from '../api/shipments'
import { fetchAuditLogForRecord, fetchPlatformRevenueForOrg } from '../api/accounting'
import { costsQueryKey, invoicesQueryKey, useArchiveInvoice, useCosts, useInvoices, useMarkCostInstantPayout, useMarkInvoicePaid } from '../hooks/useInvoices'
import InvoiceModal from './InvoiceModal'
import CostModal from './CostModal'
import InfoTooltip from './InfoTooltip'
import { computeInvoiceAging, daysOverdue } from '../lib/invoiceAging'
import {
  PLATFORM_RAKE_META,
  type AuditLogEntry,
  type BillingModel,
  type Invoice,
  type MembershipRole,
  type PlatformRevenueEntry,
  type ShipmentCost,
} from '../types'
import { T } from '../theme/tokens'

// Deliberate literal (ADR-0031): the middle step of the 3-step invoice-aging severity ramp
// (warning amber → THIS orange → danger red). It sits between two existing tokens on purpose;
// darkened from the old #f97316 for contrast on light surfaces.
const SEVERITY_MID = '#c2410c'

type Tab = 'invoices' | 'pnl'

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

const statCardStyle: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  padding: '16px 18px',
}

interface AccountingPageProps {
  orgId: string
  currentRole: MembershipRole
  billingModel: BillingModel
}

export default function AccountingPage({ orgId, currentRole, billingModel }: AccountingPageProps) {
  const [tab, setTab] = useState<Tab>('invoices')
  const queryClient = useQueryClient()

  const { data: invoices = [], isLoading: invoicesLoading, error: invoicesErrorObj } = useInvoices(orgId)
  const invoicesError = invoicesErrorObj instanceof Error ? invoicesErrorObj.message : null
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false)
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null)
  const [archivingInvoiceId, setArchivingInvoiceId] = useState<string | null>(null)
  const [showArchivedInvoices, setShowArchivedInvoices] = useState(false)
  const markPaidMutation = useMarkInvoicePaid(orgId)
  const archiveInvoiceMutation = useArchiveInvoice(orgId)

  const { data: costs = [], isLoading: costsLoading, error: costsErrorObj } = useCosts(orgId)
  const costsError = costsErrorObj instanceof Error ? costsErrorObj.message : null
  const [costModalOpen, setCostModalOpen] = useState(false)
  const [instantPayoutBusyId, setInstantPayoutBusyId] = useState<string | null>(null)
  const [instantPayoutDoneIds, setInstantPayoutDoneIds] = useState<Set<string>>(new Set())
  const instantPayoutMutation = useMarkCostInstantPayout(orgId)

  const [dnaInvoiceId, setDnaInvoiceId] = useState<string | null>(null)
  const [dnaLoading, setDnaLoading] = useState(false)
  const [dnaRakes, setDnaRakes] = useState<PlatformRevenueEntry[]>([])
  const [dnaHistory, setDnaHistory] = useState<AuditLogEntry[]>([])

  // Week 14 (ADR-0021): id -> ref only, just for display in the profitability table below —
  // invoices/shipment_costs already carry shipment_id, this is a lightweight lookup, not a join.
  const [shipmentRefs, setShipmentRefs] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let cancelled = false
    fetchShipmentRefs(orgId).then((data) => {
      if (!cancelled) setShipmentRefs(new Map(data.map((s) => [s.id, s.ref])))
    })
    return () => {
      cancelled = true
    }
  }, [orgId])

  const aging = useMemo(() => computeInvoiceAging(invoices), [invoices])

  const pnl = useMemo(() => {
    const revenue = invoices.reduce((sum, i) => sum + i.amount_inr, 0)
    const cost = costs.reduce((sum, c) => sum + c.amount, 0)
    return { revenue, cost, profit: revenue - cost }
  }, [invoices, costs])

  // Week 14 (ADR-0021): "shipment_costs already has shipment_id on every row, so a per-shipment
  // view is a query away, just not built" (tech-debt.md, verbatim) — this is that view, grouping
  // the same invoices/costs arrays already fetched above, no new query. Worst-margin-first so the
  // shipment that needs attention is the one on top.
  const profitability = useMemo(() => {
    const byShipment = new Map<string, { revenue: number; cost: number }>()
    for (const inv of invoices) {
      const entry = byShipment.get(inv.shipment_id) ?? { revenue: 0, cost: 0 }
      entry.revenue += inv.amount_inr
      byShipment.set(inv.shipment_id, entry)
    }
    for (const c of costs) {
      const entry = byShipment.get(c.shipment_id) ?? { revenue: 0, cost: 0 }
      entry.cost += c.amount
      byShipment.set(c.shipment_id, entry)
    }
    return Array.from(byShipment.entries())
      .map(([shipmentId, { revenue, cost }]) => ({
        shipmentId,
        ref: shipmentRefs.get(shipmentId) ?? shipmentId,
        revenue,
        cost,
        margin: revenue - cost,
        marginPct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
      }))
      .sort((a, b) => a.margin - b.margin)
  }, [invoices, costs, shipmentRefs])

  // Week 15 (ADR-0022): archived invoices still count toward aging/P&L/profitability above —
  // archiving is a "hide from the working list" UX concept, not "this revenue didn't happen."
  // Only the visible table rows are filtered.
  const visibleInvoices = invoices.filter((i) => showArchivedInvoices || !i.archived)

  function handleInvoiceCreated(_invoice: Invoice) {
    void queryClient.invalidateQueries({ queryKey: invoicesQueryKey(orgId) })
    setInvoiceModalOpen(false)
  }

  function handleCostCreated(_cost: ShipmentCost) {
    void queryClient.invalidateQueries({ queryKey: costsQueryKey(orgId) })
    setCostModalOpen(false)
  }

  async function handleMarkPaid(invoice: Invoice) {
    setMarkingPaidId(invoice.id)
    await markPaidMutation.mutateAsync(invoice)
    setMarkingPaidId(null)
  }

  // Week 15 (ADR-0022): plain client update, same shape as handleMarkPaid above — archive is
  // just a flag flip, not a privileged/ordering concern, so no RPC.
  async function handleArchiveToggle(invoice: Invoice) {
    setArchivingInvoiceId(invoice.id)
    await archiveInvoiceMutation.mutateAsync(invoice)
    setArchivingInvoiceId(null)
  }

  async function handleInstantPayout(cost: ShipmentCost) {
    setInstantPayoutBusyId(cost.id)
    await instantPayoutMutation.mutateAsync(cost)
    setInstantPayoutDoneIds((prev) => new Set(prev).add(cost.id))
    setInstantPayoutBusyId(null)
  }

  async function toggleRevenueDna(invoice: Invoice) {
    if (dnaInvoiceId === invoice.id) {
      setDnaInvoiceId(null)
      return
    }
    setDnaInvoiceId(invoice.id)
    setDnaLoading(true)
    const [rakes, history] = await Promise.all([
      fetchPlatformRevenueForOrg(orgId),
      fetchAuditLogForRecord(orgId, 'invoices', invoice.id),
    ])
    setDnaRakes(rakes.filter((r) => r.invoice_id === invoice.id))
    setDnaHistory(history)
    setDnaLoading(false)
  }

  function fmt(n: number): string {
    return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  }

  return (
    <div style={{ padding: '28px 32px', flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 14 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: T.ink }}>Accounting</h1>
        {tab === 'invoices' ? (
          <button type="button" onClick={() => setInvoiceModalOpen(true)} style={primaryButtonStyle}>
            + New Invoice
          </button>
        ) : (
          <button type="button" onClick={() => setCostModalOpen(true)} style={primaryButtonStyle}>
            + Add Cost
          </button>
        )}
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 9, padding: 3, display: 'flex', gap: 2, marginBottom: 20, width: 'fit-content' }}>
        <button type="button" onClick={() => setTab('invoices')} style={tabButtonStyle(tab === 'invoices')}>
          Invoices
        </button>
        <button type="button" onClick={() => setTab('pnl')} style={tabButtonStyle(tab === 'pnl')}>
          P&amp;L
        </button>
      </div>

      {tab === 'invoices' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: T.muted, cursor: 'pointer' }}>
              <input type="checkbox" checked={showArchivedInvoices} onChange={(e) => setShowArchivedInvoices(e.target.checked)} />
              Show archived
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={statCardStyle}>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Total Outstanding</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.text, fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(aging.outstanding)}</div>
            </div>
            <div style={{ ...statCardStyle, borderColor: T.warningBorder }}>
              <div style={{ fontSize: 11, color: T.warning, marginBottom: 6 }}>0–30 Days Overdue</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.warning, fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(aging.buckets.d0_30.amount)}</div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 4 }}>{aging.buckets.d0_30.count} invoice(s)</div>
            </div>
            <div style={{ ...statCardStyle, borderColor: T.warningBorder }}>
              <div style={{ fontSize: 11, color: SEVERITY_MID, marginBottom: 6 }}>31–60 Days Overdue</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: SEVERITY_MID, fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(aging.buckets.d31_60.amount)}</div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 4 }}>{aging.buckets.d31_60.count} invoice(s)</div>
            </div>
            <div style={{ ...statCardStyle, borderColor: T.dangerBorder }}>
              <div style={{ fontSize: 11, color: T.danger, marginBottom: 6 }}>61+ Days Overdue</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.danger, fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(aging.buckets.d61.amount)}</div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 4 }}>{aging.buckets.d61.count} invoice(s)</div>
            </div>
          </div>

          {invoicesError ? (
            <ErrorBox message={invoicesError} />
          ) : (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.rowStripe }}>
                    <th style={headStyle}>Ref</th>
                    <th style={headStyle}>Client</th>
                    <th style={headStyle}>Amount</th>
                    <th style={headStyle}>Amount (INR)</th>
                    <th style={headStyle}>Due</th>
                    <th style={headStyle}>Status</th>
                    <th style={headStyle}>Revenue DNA</th>
                    <th style={headStyle}>Archive</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleInvoices.map((inv) => {
                    const overdue = inv.status === 'unpaid' ? daysOverdue(inv.due_date) : null
                    const dnaOpen = dnaInvoiceId === inv.id
                    return (
                      <Fragment key={inv.id}>
                      <tr style={{ borderBottom: `1px solid ${T.surfaceRaised}`, opacity: inv.archived ? 0.55 : 1 }}>
                        <td style={{ ...cellStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13, color: T.ink }}>{inv.ref}</td>
                        <td style={{ ...cellStyle, fontSize: 13, color: T.muted }}>{inv.client_name}</td>
                        <td style={{ ...cellStyle, fontSize: 13, color: T.text }}>
                          {inv.currency} {inv.amount.toLocaleString('en-IN')}
                        </td>
                        <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: T.success }}>{fmt(inv.amount_inr)}</td>
                        <td style={{ ...cellStyle, fontSize: 12.5, color: T.muted }}>{inv.due_date ?? '—'}</td>
                        <td style={cellStyle}>
                          {inv.status === 'paid' ? (
                            <span style={{ fontSize: 11.5, color: T.success, fontWeight: 600 }}>● Paid</span>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {overdue !== null && overdue > 0 ? (
                                <span style={{ fontSize: 11, fontWeight: 600, color: overdue > 60 ? T.danger : overdue > 30 ? SEVERITY_MID : T.warning }}>
                                  {overdue}d overdue
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: T.faint }}>Not due</span>
                              )}
                              <button
                                type="button"
                                disabled={markingPaidId === inv.id}
                                onClick={() => void handleMarkPaid(inv)}
                                style={{
                                  padding: '4px 9px',
                                  borderRadius: 6,
                                  border: `1px solid ${T.border}`,
                                  background: 'transparent',
                                  color: T.muted,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Mark Paid
                              </button>
                            </div>
                          )}
                        </td>
                        <td style={cellStyle}>
                          <button type="button" onClick={() => void toggleRevenueDna(inv)} style={dnaButtonStyle}>
                            {dnaOpen ? 'Hide' : 'Trace'}
                          </button>
                        </td>
                        <td style={cellStyle}>
                          <button
                            type="button"
                            disabled={archivingInvoiceId === inv.id}
                            onClick={() => void handleArchiveToggle(inv)}
                            style={dnaButtonStyle}
                          >
                            {inv.archived ? 'Unarchive' : 'Archive'}
                          </button>
                        </td>
                      </tr>
                      {dnaOpen && (
                        <tr style={{ borderBottom: `1px solid ${T.surfaceRaised}`, background: T.rowStripe }}>
                          <td colSpan={8} style={{ padding: '10px 20px 16px' }}>
                            {dnaLoading ? (
                              <div style={{ fontSize: 12, color: T.faint }}>Loading trace…</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
                                <div style={{ color: T.muted }}>
                                  Shipment <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.text }}>{inv.shipment_id ?? '—'}</span>
                                  {' → '}Invoice <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.text }}>{inv.ref}</span>
                                  {' · '}
                                  {inv.currency} {inv.amount.toLocaleString('en-IN')} @ fx {inv.fx_rate} = {fmt(inv.amount_inr)}
                                </div>
                                <div>
                                  <div style={{ color: T.muted, marginBottom: 4 }}>
                                    Platform rake breakdown (simulated)
                                    <InfoTooltip text="Model 2 orgs only. Each rake is a fixed % computed from a real amount on this invoice/shipment (e.g. 2% FX spread) — no real funds move (ADR-0013)." />
                                  </div>
                                  {dnaRakes.length === 0 ? (
                                    <div style={{ color: T.placeholder }}>No platform rake recorded for this invoice.</div>
                                  ) : (
                                    dnaRakes.map((r) => (
                                      <div key={r.id} style={{ color: T.success }}>
                                        {PLATFORM_RAKE_META[r.rake_type].label} — {r.rate_pct}% of {fmt(r.base_amount_inr)} = {fmt(r.rake_amount_inr)}
                                      </div>
                                    ))
                                  )}
                                </div>
                                <div>
                                  <div style={{ color: T.muted, marginBottom: 4 }}>Audit history</div>
                                  {dnaHistory.length === 0 ? (
                                    <div style={{ color: T.placeholder }}>No changes recorded.</div>
                                  ) : (
                                    dnaHistory.map((h) => (
                                      <div key={h.id} style={{ color: T.muted }}>
                                        {h.operation} by {h.changed_by_email ?? '—'} · {new Date(h.changed_at).toLocaleString()}
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
              {!invoicesLoading && visibleInvoices.length === 0 && <EmptyState label="No invoices yet." />}
              {invoicesLoading && <EmptyState label="Loading invoices…" />}
            </div>
          )}
        </>
      )}

      {tab === 'pnl' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={statCardStyle}>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Total Revenue</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.success, fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(pnl.revenue)}</div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Total Cost</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.danger, fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(pnl.cost)}</div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Profit</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: pnl.profit >= 0 ? T.success : T.danger, fontFamily: "'IBM Plex Mono', monospace" }}>
                {fmt(pnl.profit)}
              </div>
            </div>
          </div>

          {profitability.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Profitability by shipment</div>
                <div style={{ fontSize: 11.5, color: T.faint }}>See margin the moment you invoice — not at month-end.</div>
              </div>
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.rowStripe }}>
                      <th style={headStyle}>Shipment</th>
                      <th style={headStyle}>Revenue</th>
                      <th style={headStyle}>Cost</th>
                      <th style={headStyle}>Margin</th>
                      <th style={headStyle}>Margin %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitability.map((p) => (
                      <tr key={p.shipmentId} style={{ borderBottom: `1px solid ${T.surfaceRaised}` }}>
                        <td style={{ ...cellStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13, color: T.ink }}>{p.ref}</td>
                        <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: T.success }}>{fmt(p.revenue)}</td>
                        <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: T.danger }}>{fmt(p.cost)}</td>
                        <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: p.margin >= 0 ? T.success : T.danger }}>
                          {fmt(p.margin)}
                        </td>
                        <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: p.margin >= 0 ? T.success : T.danger }}>
                          {p.marginPct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {costsError ? (
            <ErrorBox message={costsError} />
          ) : (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.rowStripe }}>
                    <th style={headStyle}>Vendor</th>
                    <th style={headStyle}>Description</th>
                    <th style={headStyle}>Amount</th>
                    <th style={headStyle}>Added</th>
                    {billingModel === 'model_2' && (
                      <th style={headStyle}>
                        Instant Payout
                        <InfoTooltip text="1% of this cost's amount, recorded as a simulated platform-revenue entry for settling a vendor faster than normal terms. No real payout rail exists and no funds move (ADR-0013)." />
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {costs.map((c) => (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${T.surfaceRaised}` }}>
                      <td style={{ ...cellStyle, fontSize: 13, fontWeight: 600, color: T.ink }}>{c.vendor_name ?? '—'}</td>
                      <td style={{ ...cellStyle, fontSize: 13, color: T.muted }}>{c.description}</td>
                      <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: T.danger }}>{fmt(c.amount)}</td>
                      <td style={{ ...cellStyle, fontSize: 12, color: T.faint }}>{new Date(c.created_at).toLocaleDateString()}</td>
                      {billingModel === 'model_2' && (
                        <td style={cellStyle}>
                          {instantPayoutDoneIds.has(c.id) ? (
                            <span style={{ fontSize: 11, color: T.success, fontWeight: 600 }}>● Settled (simulated)</span>
                          ) : (
                            <button
                              type="button"
                              disabled={instantPayoutBusyId === c.id}
                              onClick={() => void handleInstantPayout(c)}
                              style={dnaButtonStyle}
                              title="Simulated — no real funds move yet"
                            >
                              Settle instantly (1%, simulated)
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!costsLoading && costs.length === 0 && <EmptyState label="No costs recorded yet." />}
              {costsLoading && <EmptyState label="Loading costs…" />}
            </div>
          )}
        </>
      )}

      {invoiceModalOpen && (
        <InvoiceModal orgId={orgId} currentRole={currentRole} onClose={() => setInvoiceModalOpen(false)} onCreated={handleInvoiceCreated} />
      )}
      {costModalOpen && <CostModal orgId={orgId} onClose={() => setCostModalOpen(false)} onCreated={handleCostCreated} />}
    </div>
  )
}

const dnaButtonStyle: CSSProperties = {
  padding: '4px 9px',
  borderRadius: 6,
  border: `1px solid ${T.border}`,
  background: 'transparent',
  color: T.muted,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
}

const primaryButtonStyle: CSSProperties = {
  background: T.accent,
  color: T.onAccent,
  border: 'none',
  fontWeight: 600,
  fontSize: 13,
  padding: '9px 16px',
  borderRadius: 8,
  cursor: 'pointer',
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
