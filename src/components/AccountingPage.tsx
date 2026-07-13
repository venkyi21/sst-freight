import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabaseClient'
import InvoiceModal from './InvoiceModal'
import CostModal from './CostModal'
import type { Invoice, MembershipRole, ShipmentCost } from '../types'

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

export default function AccountingPage({ orgId, currentRole }: AccountingPageProps) {
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
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const overdue = inv.status === 'unpaid' ? daysOverdue(inv.due_date) : null
                    return (
                      <tr key={inv.id} style={{ borderBottom: '1px solid #172033' }}>
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
                      </tr>
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
                  </tr>
                </thead>
                <tbody>
                  {costs.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #172033' }}>
                      <td style={{ ...cellStyle, fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{c.vendor_name ?? '—'}</td>
                      <td style={{ ...cellStyle, fontSize: 13, color: '#94a3b8' }}>{c.description}</td>
                      <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: '#fb7185' }}>{fmt(c.amount)}</td>
                      <td style={{ ...cellStyle, fontSize: 12, color: '#5b6b82' }}>{new Date(c.created_at).toLocaleDateString()}</td>
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
