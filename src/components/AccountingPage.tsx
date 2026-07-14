import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabaseClient'
import InvoiceModal from './InvoiceModal'
import CostModal from './CostModal'
import InfoTooltip from './InfoTooltip'
import {
  PLATFORM_RAKE_META,
  type AuditLogEntry,
  type BillingModel,
  type Invoice,
  type MembershipRole,
  type PlatformRevenueEntry,
  type ShipmentCost,
} from '../types'

type Tab = 'invoices' | 'pnl'

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

const statCardStyle: CSSProperties = {
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: 12,
  padding: '16px 18px',
}

interface AccountingPageProps {
  orgId: string
  currentRole: MembershipRole
  billingModel: BillingModel
}

function daysOverdue(dueDate: string | null): number | null {
  if (!dueDate) return null
  const due = new Date(dueDate)
  const today = new Date()
  due.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
  return diff > 0 ? diff : 0
}

export default function AccountingPage({ orgId, currentRole, billingModel }: AccountingPageProps) {
  const [tab, setTab] = useState<Tab>('invoices')

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(true)
  const [invoicesError, setInvoicesError] = useState<string | null>(null)
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false)
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null)

  const [costs, setCosts] = useState<ShipmentCost[]>([])
  const [costsLoading, setCostsLoading] = useState(true)
  const [costsError, setCostsError] = useState<string | null>(null)
  const [costModalOpen, setCostModalOpen] = useState(false)
  const [instantPayoutBusyId, setInstantPayoutBusyId] = useState<string | null>(null)
  const [instantPayoutDoneIds, setInstantPayoutDoneIds] = useState<Set<string>>(new Set())

  const [dnaInvoiceId, setDnaInvoiceId] = useState<string | null>(null)
  const [dnaLoading, setDnaLoading] = useState(false)
  const [dnaRakes, setDnaRakes] = useState<PlatformRevenueEntry[]>([])
  const [dnaHistory, setDnaHistory] = useState<AuditLogEntry[]>([])

  // Week 14 (ADR-0021): id -> ref only, just for display in the profitability table below —
  // invoices/shipment_costs already carry shipment_id, this is a lightweight lookup, not a join.
  const [shipmentRefs, setShipmentRefs] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let cancelled = false
    setInvoicesLoading(true)
    setInvoicesError(null)
    supabase
      .from('invoices')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setInvoicesError(error.message)
        else if (data) setInvoices(data as Invoice[])
        setInvoicesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  useEffect(() => {
    let cancelled = false
    setCostsLoading(true)
    setCostsError(null)
    supabase
      .from('shipment_costs')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setCostsError(error.message)
        else if (data) setCosts(data as ShipmentCost[])
        setCostsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('shipments')
      .select('id, ref')
      .eq('org_id', orgId)
      .then(({ data }) => {
        if (!cancelled && data) setShipmentRefs(new Map((data as { id: string; ref: string }[]).map((s) => [s.id, s.ref])))
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  const aging = useMemo(() => {
    const unpaid = invoices.filter((i) => i.status === 'unpaid')
    const outstanding = unpaid.reduce((sum, i) => sum + i.amount_inr, 0)
    const buckets = { d0_30: { count: 0, amount: 0 }, d31_60: { count: 0, amount: 0 }, d61: { count: 0, amount: 0 } }
    for (const inv of unpaid) {
      const overdue = daysOverdue(inv.due_date)
      if (overdue === null || overdue === 0) continue
      if (overdue <= 30) {
        buckets.d0_30.count++
        buckets.d0_30.amount += inv.amount_inr
      } else if (overdue <= 60) {
        buckets.d31_60.count++
        buckets.d31_60.amount += inv.amount_inr
      } else {
        buckets.d61.count++
        buckets.d61.amount += inv.amount_inr
      }
    }
    return { outstanding, buckets }
  }, [invoices])

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

  function handleInvoiceCreated(invoice: Invoice) {
    setInvoices((prev) => [invoice, ...prev])
    setInvoiceModalOpen(false)
  }

  function handleCostCreated(cost: ShipmentCost) {
    setCosts((prev) => [cost, ...prev])
    setCostModalOpen(false)
  }

  async function handleMarkPaid(invoice: Invoice) {
    setMarkingPaidId(invoice.id)
    const { data, error } = await supabase
      .from('invoices')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', invoice.id)
      .select()
      .single()
    if (!error && data) {
      setInvoices((prev) => prev.map((i) => (i.id === invoice.id ? (data as Invoice) : i)))
    }
    setMarkingPaidId(null)
  }

  async function handleInstantPayout(cost: ShipmentCost) {
    setInstantPayoutBusyId(cost.id)
    const { error } = await supabase.rpc('mark_cost_instant_payout', { p_shipment_cost_id: cost.id })
    if (!error) {
      setInstantPayoutDoneIds((prev) => new Set(prev).add(cost.id))
    }
    setInstantPayoutBusyId(null)
  }

  async function toggleRevenueDna(invoice: Invoice) {
    if (dnaInvoiceId === invoice.id) {
      setDnaInvoiceId(null)
      return
    }
    setDnaInvoiceId(invoice.id)
    setDnaLoading(true)
    const [{ data: rakes }, { data: history }] = await Promise.all([
      supabase.rpc('list_platform_revenue', { p_org_id: orgId }),
      supabase.rpc('list_audit_log', { p_org_id: orgId, p_table_name: 'invoices', p_record_id: invoice.id }),
    ])
    setDnaRakes(((rakes as PlatformRevenueEntry[]) ?? []).filter((r) => r.invoice_id === invoice.id))
    setDnaHistory((history as AuditLogEntry[]) ?? [])
    setDnaLoading(false)
  }

  function fmt(n: number): string {
    return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  }

  return (
    <div style={{ padding: '28px 32px', flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 14 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>Accounting</h1>
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

      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 9, padding: 3, display: 'flex', gap: 2, marginBottom: 20, width: 'fit-content' }}>
        <button type="button" onClick={() => setTab('invoices')} style={tabButtonStyle(tab === 'invoices')}>
          Invoices
        </button>
        <button type="button" onClick={() => setTab('pnl')} style={tabButtonStyle(tab === 'pnl')}>
          P&amp;L
        </button>
      </div>

      {tab === 'invoices' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={statCardStyle}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>Total Outstanding</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(aging.outstanding)}</div>
            </div>
            <div style={{ ...statCardStyle, borderColor: 'rgba(251,191,36,0.3)' }}>
              <div style={{ fontSize: 11, color: '#fbbf24', marginBottom: 6 }}>0–30 Days Overdue</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fbbf24', fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(aging.buckets.d0_30.amount)}</div>
              <div style={{ fontSize: 11, color: '#5b6b82', marginTop: 4 }}>{aging.buckets.d0_30.count} invoice(s)</div>
            </div>
            <div style={{ ...statCardStyle, borderColor: 'rgba(249,115,22,0.3)' }}>
              <div style={{ fontSize: 11, color: '#f97316', marginBottom: 6 }}>31–60 Days Overdue</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#f97316', fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(aging.buckets.d31_60.amount)}</div>
              <div style={{ fontSize: 11, color: '#5b6b82', marginTop: 4 }}>{aging.buckets.d31_60.count} invoice(s)</div>
            </div>
            <div style={{ ...statCardStyle, borderColor: 'rgba(239,68,68,0.3)' }}>
              <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 6 }}>61+ Days Overdue</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444', fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(aging.buckets.d61.amount)}</div>
              <div style={{ fontSize: 11, color: '#5b6b82', marginTop: 4 }}>{aging.buckets.d61.count} invoice(s)</div>
            </div>
          </div>

          {invoicesError ? (
            <ErrorBox message={invoicesError} />
          ) : (
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e293b', background: 'rgba(255,255,255,0.02)' }}>
                    <th style={headStyle}>Ref</th>
                    <th style={headStyle}>Client</th>
                    <th style={headStyle}>Amount</th>
                    <th style={headStyle}>Amount (INR)</th>
                    <th style={headStyle}>Due</th>
                    <th style={headStyle}>Status</th>
                    <th style={headStyle}>Revenue DNA</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const overdue = inv.status === 'unpaid' ? daysOverdue(inv.due_date) : null
                    const dnaOpen = dnaInvoiceId === inv.id
                    return (
                      <Fragment key={inv.id}>
                      <tr style={{ borderBottom: '1px solid #172033' }}>
                        <td style={{ ...cellStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13, color: '#f1f5f9' }}>{inv.ref}</td>
                        <td style={{ ...cellStyle, fontSize: 13, color: '#94a3b8' }}>{inv.client_name}</td>
                        <td style={{ ...cellStyle, fontSize: 13, color: '#e2e8f0' }}>
                          {inv.currency} {inv.amount.toLocaleString('en-IN')}
                        </td>
                        <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: '#4ade80' }}>{fmt(inv.amount_inr)}</td>
                        <td style={{ ...cellStyle, fontSize: 12.5, color: '#94a3b8' }}>{inv.due_date ?? '—'}</td>
                        <td style={cellStyle}>
                          {inv.status === 'paid' ? (
                            <span style={{ fontSize: 11.5, color: '#4ade80', fontWeight: 600 }}>● Paid</span>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {overdue !== null && overdue > 0 ? (
                                <span style={{ fontSize: 11, fontWeight: 600, color: overdue > 60 ? '#ef4444' : overdue > 30 ? '#f97316' : '#fbbf24' }}>
                                  {overdue}d overdue
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: '#5b6b82' }}>Not due</span>
                              )}
                              <button
                                type="button"
                                disabled={markingPaidId === inv.id}
                                onClick={() => void handleMarkPaid(inv)}
                                style={{
                                  padding: '4px 9px',
                                  borderRadius: 6,
                                  border: '1px solid #1e293b',
                                  background: 'transparent',
                                  color: '#94a3b8',
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
                      </tr>
                      {dnaOpen && (
                        <tr style={{ borderBottom: '1px solid #172033', background: 'rgba(255,255,255,0.015)' }}>
                          <td colSpan={7} style={{ padding: '10px 20px 16px' }}>
                            {dnaLoading ? (
                              <div style={{ fontSize: 12, color: '#5b6b82' }}>Loading trace…</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
                                <div style={{ color: '#94a3b8' }}>
                                  Shipment <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#e2e8f0' }}>{inv.shipment_id ?? '—'}</span>
                                  {' → '}Invoice <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#e2e8f0' }}>{inv.ref}</span>
                                  {' · '}
                                  {inv.currency} {inv.amount.toLocaleString('en-IN')} @ fx {inv.fx_rate} = {fmt(inv.amount_inr)}
                                </div>
                                <div>
                                  <div style={{ color: '#64748b', marginBottom: 4 }}>
                                    Platform rake breakdown (simulated)
                                    <InfoTooltip text="Model 2 orgs only. Each rake is a fixed % computed from a real amount on this invoice/shipment (e.g. 2% FX spread) — no real funds move (ADR-0013)." />
                                  </div>
                                  {dnaRakes.length === 0 ? (
                                    <div style={{ color: '#475569' }}>No platform rake recorded for this invoice.</div>
                                  ) : (
                                    dnaRakes.map((r) => (
                                      <div key={r.id} style={{ color: '#4ade80' }}>
                                        {PLATFORM_RAKE_META[r.rake_type].label} — {r.rate_pct}% of {fmt(r.base_amount_inr)} = {fmt(r.rake_amount_inr)}
                                      </div>
                                    ))
                                  )}
                                </div>
                                <div>
                                  <div style={{ color: '#64748b', marginBottom: 4 }}>Audit history</div>
                                  {dnaHistory.length === 0 ? (
                                    <div style={{ color: '#475569' }}>No changes recorded.</div>
                                  ) : (
                                    dnaHistory.map((h) => (
                                      <div key={h.id} style={{ color: '#94a3b8' }}>
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
              {!invoicesLoading && invoices.length === 0 && <EmptyState label="No invoices yet." />}
              {invoicesLoading && <EmptyState label="Loading invoices…" />}
            </div>
          )}
        </>
      )}

      {tab === 'pnl' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={statCardStyle}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>Total Revenue</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#4ade80', fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(pnl.revenue)}</div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>Total Cost</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fb7185', fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(pnl.cost)}</div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>Profit</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: pnl.profit >= 0 ? '#4ade80' : '#fb7185', fontFamily: "'IBM Plex Mono', monospace" }}>
                {fmt(pnl.profit)}
              </div>
            </div>
          </div>

          {profitability.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Profitability by shipment</div>
                <div style={{ fontSize: 11.5, color: '#5b6b82' }}>See margin the moment you invoice — not at month-end.</div>
              </div>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e293b', background: 'rgba(255,255,255,0.02)' }}>
                      <th style={headStyle}>Shipment</th>
                      <th style={headStyle}>Revenue</th>
                      <th style={headStyle}>Cost</th>
                      <th style={headStyle}>Margin</th>
                      <th style={headStyle}>Margin %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitability.map((p) => (
                      <tr key={p.shipmentId} style={{ borderBottom: '1px solid #172033' }}>
                        <td style={{ ...cellStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13, color: '#f1f5f9' }}>{p.ref}</td>
                        <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: '#4ade80' }}>{fmt(p.revenue)}</td>
                        <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: '#fb7185' }}>{fmt(p.cost)}</td>
                        <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: p.margin >= 0 ? '#4ade80' : '#fb7185' }}>
                          {fmt(p.margin)}
                        </td>
                        <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: p.margin >= 0 ? '#4ade80' : '#fb7185' }}>
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
            <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e293b', background: 'rgba(255,255,255,0.02)' }}>
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
                    <tr key={c.id} style={{ borderBottom: '1px solid #172033' }}>
                      <td style={{ ...cellStyle, fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{c.vendor_name ?? '—'}</td>
                      <td style={{ ...cellStyle, fontSize: 13, color: '#94a3b8' }}>{c.description}</td>
                      <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: '#fb7185' }}>{fmt(c.amount)}</td>
                      <td style={{ ...cellStyle, fontSize: 12, color: '#5b6b82' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                      {billingModel === 'model_2' && (
                        <td style={cellStyle}>
                          {instantPayoutDoneIds.has(c.id) ? (
                            <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>● Settled (simulated)</span>
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
  border: '1px solid #1e293b',
  background: 'transparent',
  color: '#94a3b8',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
}

const primaryButtonStyle: CSSProperties = {
  background: '#2563eb',
  color: '#fff',
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
