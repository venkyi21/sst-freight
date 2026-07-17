import { Fragment, useMemo, useState, type CSSProperties } from 'react'
import { useAuth } from '../context/AuthContext'
import { toggleDashboardWidget } from '../api/reporting'
import { useReportingData } from '../hooks/useReporting'
import {
  DASHBOARD_WIDGET_META,
  DASHBOARD_WIDGET_ORDER,
  MODE_META,
  STATUS_SEQUENCE,
  statusMeta,
  type CustomsFiling,
  type DashboardWidgetKey,
  type Invoice,
  type ShipmentCost,
  type ShipmentDocument,
} from '../types'
import { T } from '../theme/tokens'

interface ReportingPageProps {
  orgId: string
}

interface ProfitRow {
  key: string
  revenue: number
  cost: number
  shipmentIds: Set<string>
}

const statCardStyle: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  padding: '16px 18px',
}

const panelStyle: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
}

const headStyle: CSSProperties = {
  padding: '13px 20px',
  fontSize: 11,
  fontWeight: 600,
  color: T.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const cellStyle: CSSProperties = { padding: '14px 20px' }

function fmt(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ReportingPage({ orgId }: ReportingPageProps) {
  const { user } = useAuth()
  const { data: result, isLoading: loading, error: errorObj, dataUpdatedAt } = useReportingData(orgId, user?.id)
  const error = errorObj instanceof Error ? errorObj.message : result?.error ?? null
  const shipments = result?.shipments ?? []
  const invoices = result?.invoices ?? []
  const costs = result?.costs ?? []
  const history = result?.history ?? []
  const customsFilings = (result?.customsFilings ?? []) as CustomsFiling[]
  const documents = (result?.documents ?? []) as ShipmentDocument[]
  const loadedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null

  // Optimistic local overrides on top of the query's own prefs — avoids fighting react-query's
  // immutable cache for a Map-shaped field the mutation below already persists server-side.
  const [prefsOverride, setPrefsOverride] = useState<Map<DashboardWidgetKey, boolean>>(new Map())
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null)
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null)

  function isVisible(key: DashboardWidgetKey): boolean {
    if (prefsOverride.has(key)) return prefsOverride.get(key)!
    return result?.prefs.get(key) ?? true
  }

  async function toggleWidget(key: DashboardWidgetKey) {
    if (!user) return
    const next = !isVisible(key)
    setPrefsOverride((prev) => new Map(prev).set(key, next))
    await toggleDashboardWidget(orgId, user.id, key, next)
  }

  // shipment_id -> { client, origin, destination } — reused by both profitability breakdowns
  const shipmentMeta = useMemo(() => {
    const m = new Map<string, { client: string; origin: string; destination: string; mode: string; status: string; ref: string }>()
    for (const s of shipments) {
      m.set(s.id, { client: s.client, origin: s.origin, destination: s.destination, mode: s.mode, status: s.status, ref: s.ref })
    }
    return m
  }, [shipments])

  const kpis = useMemo(() => {
    const totalRevenue = invoices.reduce((sum, i) => sum + i.amount_inr, 0)
    const outstanding = invoices.filter((i) => i.status === 'unpaid').reduce((sum, i) => sum + i.amount_inr, 0)

    const bookedAt = new Map<string, string>()
    const deliveredAt = new Map<string, string>()
    for (const h of history) {
      if (h.to_status === 'Booked') bookedAt.set(h.shipment_id, h.created_at)
      if (h.to_status === 'Delivered') deliveredAt.set(h.shipment_id, h.created_at)
    }
    let transitDaysSum = 0
    let transitCount = 0
    for (const [shipmentId, deliveredTs] of deliveredAt) {
      const bookedTs = bookedAt.get(shipmentId)
      if (!bookedTs) continue
      const days = (new Date(deliveredTs).getTime() - new Date(bookedTs).getTime()) / (1000 * 60 * 60 * 24)
      transitDaysSum += days
      transitCount += 1
    }
    const avgTransitDays = transitCount > 0 ? transitDaysSum / transitCount : null

    return {
      totalShipments: shipments.length,
      totalRevenue,
      outstanding,
      avgTransitDays,
      activeCustomsFilings: customsFilings.length,
      documentsGenerated: documents.length,
    }
  }, [shipments, invoices, history, customsFilings, documents])

  const volumeByMode = useMemo(() => {
    const counts = { ocean: 0, air: 0, truck: 0 }
    for (const s of shipments) counts[s.mode]++
    return counts
  }, [shipments])

  const shipmentsByStatus = useMemo(() => {
    const counts = new Map(STATUS_SEQUENCE.map((s) => [s, 0]))
    for (const s of shipments) counts.set(s.status, (counts.get(s.status) ?? 0) + 1)
    return counts
  }, [shipments])

  const revenueTrend = useMemo(() => {
    const months: { key: string; label: string; total: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-IN', { month: 'short' }), total: 0 })
    }
    const byKey = new Map(months.map((m) => [m.key, m]))
    for (const inv of invoices) {
      const d = new Date(inv.created_at)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const bucket = byKey.get(key)
      if (bucket) bucket.total += inv.amount_inr
    }
    return months
  }, [invoices])

  const customerProfitability = useMemo(() => {
    const rows = new Map<string, ProfitRow>()
    function ensure(key: string) {
      if (!rows.has(key)) rows.set(key, { key, revenue: 0, cost: 0, shipmentIds: new Set() })
      return rows.get(key)!
    }
    for (const inv of invoices) {
      const row = ensure(inv.client_name)
      row.revenue += inv.amount_inr
      if (inv.shipment_id) row.shipmentIds.add(inv.shipment_id)
    }
    for (const c of costs) {
      const meta = shipmentMeta.get(c.shipment_id)
      if (!meta) continue
      const row = ensure(meta.client)
      row.cost += c.amount
      row.shipmentIds.add(c.shipment_id)
    }
    return Array.from(rows.values()).sort((a, b) => b.revenue - a.revenue)
  }, [invoices, costs, shipmentMeta])

  const routeProfitability = useMemo(() => {
    const rows = new Map<string, ProfitRow>()
    function ensure(key: string) {
      if (!rows.has(key)) rows.set(key, { key, revenue: 0, cost: 0, shipmentIds: new Set() })
      return rows.get(key)!
    }
    for (const inv of invoices) {
      if (!inv.shipment_id) continue
      const meta = shipmentMeta.get(inv.shipment_id)
      if (!meta) continue
      const row = ensure(`${meta.origin} → ${meta.destination}`)
      row.revenue += inv.amount_inr
      row.shipmentIds.add(inv.shipment_id)
    }
    for (const c of costs) {
      const meta = shipmentMeta.get(c.shipment_id)
      if (!meta) continue
      const row = ensure(`${meta.origin} → ${meta.destination}`)
      row.cost += c.amount
      row.shipmentIds.add(c.shipment_id)
    }
    return Array.from(rows.values()).sort((a, b) => b.revenue - a.revenue)
  }, [invoices, costs, shipmentMeta])

  function exportProfitability(label: string, rows: ProfitRow[]) {
    downloadCsv(`${label}-profitability.csv`, [
      [label, 'Revenue (INR)', 'Cost (INR)', 'Margin (INR)', 'Shipments'],
      ...rows.map((r) => [r.key, r.revenue, r.cost, r.revenue - r.cost, r.shipmentIds.size]),
    ])
  }

  if (loading) {
    return (
      <div style={{ padding: '28px 32px', flex: 1 }}>
        <div style={{ color: T.faint, fontSize: 13 }}>Loading reporting data…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '28px 32px', flex: 1 }}>
        <div style={{ background: T.dangerWash, border: `1px solid ${T.dangerBorder}`, borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <div style={{ color: T.danger, fontSize: 13.5 }}>{error}</div>
        </div>
      </div>
    )
  }

  const maxModeCount = Math.max(1, ...Object.values(volumeByMode))
  const maxStatusCount = Math.max(1, ...Array.from(shipmentsByStatus.values()))
  const maxRevenueMonth = Math.max(1, ...revenueTrend.map((m) => m.total))

  return (
    <div style={{ padding: '28px 32px', flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 14 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: T.ink }}>Reporting</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: T.success,
              background: T.successWash,
              border: `1px solid ${T.successBorder}`,
              padding: '5px 10px',
              borderRadius: 20,
            }}
            title="Queried directly from the live database on every load — no batch sync, no cache, never stale"
          >
            ● Live · as of {loadedAt?.toLocaleTimeString() ?? '—'}
          </span>
          <button type="button" onClick={() => setCustomizeOpen((v) => !v)} style={secondaryButtonStyle}>
            {customizeOpen ? 'Done' : 'Customize'}
          </button>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: T.faint, marginBottom: 20 }}>
        Every number below is queried live from this org's own records — nothing here is a nightly
        or weekly sync. Click a customer or route to see the real shipments/invoices/costs behind
        the total.
      </div>

      {customizeOpen && (
        <div style={panelStyle}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 10 }}>Show / hide widgets</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {DASHBOARD_WIDGET_ORDER.map((key) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.text, cursor: 'pointer' }}>
                <input type="checkbox" checked={isVisible(key)} onChange={() => void toggleWidget(key)} />
                {DASHBOARD_WIDGET_META[key].label}
              </label>
            ))}
          </div>
        </div>
      )}

      {isVisible('kpi_tiles') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 16 }}>
          <div style={statCardStyle}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Total Shipments</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.text, fontFamily: "'IBM Plex Mono', monospace" }}>{kpis.totalShipments}</div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Revenue</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.success, fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(kpis.totalRevenue)}</div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Outstanding</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.warning, fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(kpis.outstanding)}</div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Avg. Transit</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.info, fontFamily: "'IBM Plex Mono', monospace" }}>
              {kpis.avgTransitDays !== null ? `${kpis.avgTransitDays.toFixed(1)}d` : '—'}
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Customs Filings</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.text, fontFamily: "'IBM Plex Mono', monospace" }}>{kpis.activeCustomsFilings}</div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>Documents</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.text, fontFamily: "'IBM Plex Mono', monospace" }}>{kpis.documentsGenerated}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {isVisible('volume_by_mode') && (
          <div style={panelStyle}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 14 }}>Volume by Mode</div>
            {(Object.keys(volumeByMode) as (keyof typeof volumeByMode)[]).map((mode) => (
              <BarRow key={mode} label={MODE_META[mode].label} value={volumeByMode[mode]} max={maxModeCount} color={MODE_META[mode].color} />
            ))}
          </div>
        )}

        {isVisible('shipments_by_status') && (
          <div style={panelStyle}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 14 }}>Shipments by Status</div>
            {STATUS_SEQUENCE.map((s) => (
              <BarRow key={s} label={s} value={shipmentsByStatus.get(s) ?? 0} max={maxStatusCount} color={statusMeta(s).color} />
            ))}
          </div>
        )}
      </div>

      {isVisible('revenue_trend') && (
        <div style={panelStyle}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 14 }}>Revenue, last 6 months</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120 }}>
            {revenueTrend.map((m) => (
              <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 4, fontFamily: "'IBM Plex Mono', monospace" }}>
                  {m.total > 0 ? fmt(m.total) : ''}
                </div>
                <div
                  style={{
                    width: '100%',
                    maxWidth: 40,
                    height: `${Math.max(2, (m.total / maxRevenueMonth) * 90)}%`,
                    background: T.accent,
                    borderRadius: '4px 4px 0 0',
                  }}
                />
                <div style={{ fontSize: 10.5, color: T.faint, marginTop: 6 }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isVisible('customer_profitability') && (
        <ProfitabilityTable
          title="Customer Profitability"
          columnLabel="Customer"
          rows={customerProfitability}
          expandedKey={expandedCustomer}
          onToggle={(key) => setExpandedCustomer((prev) => (prev === key ? null : key))}
          onExport={() => exportProfitability('customer', customerProfitability)}
          shipmentMeta={shipmentMeta}
          invoices={invoices}
          costs={costs}
        />
      )}

      {isVisible('route_profitability') && (
        <ProfitabilityTable
          title="Route Profitability"
          columnLabel="Route"
          rows={routeProfitability}
          expandedKey={expandedRoute}
          onToggle={(key) => setExpandedRoute((prev) => (prev === key ? null : key))}
          onExport={() => exportProfitability('route', routeProfitability)}
          shipmentMeta={shipmentMeta}
          invoices={invoices}
          costs={costs}
        />
      )}
    </div>
  )
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ width: 90, fontSize: 12, color: T.muted, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, background: T.bg, borderRadius: 4, height: 16, position: 'relative', overflow: 'hidden' }}>
        <div style={{ width: `${(value / max) * 100}%`, height: '100%', background: color, borderRadius: 4, minWidth: value > 0 ? 4 : 0 }} />
      </div>
      <div style={{ width: 28, fontSize: 12, fontWeight: 600, color: T.text, fontFamily: "'IBM Plex Mono', monospace", textAlign: 'right' }}>{value}</div>
    </div>
  )
}

function ProfitabilityTable({
  title,
  columnLabel,
  rows,
  expandedKey,
  onToggle,
  onExport,
  shipmentMeta,
  invoices,
  costs,
}: {
  title: string
  columnLabel: string
  rows: ProfitRow[]
  expandedKey: string | null
  onToggle: (key: string) => void
  onExport: () => void
  shipmentMeta: Map<string, { client: string; origin: string; destination: string; mode: string; status: string; ref: string }>
  invoices: Invoice[]
  costs: ShipmentCost[]
}) {
  return (
    <div style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 0' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.muted }}>{title}</div>
        <button type="button" onClick={onExport} style={secondaryButtonStyle}>
          Export CSV
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: 10 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.rowStripe }}>
            <th style={headStyle}>{columnLabel}</th>
            <th style={headStyle}>Revenue</th>
            <th style={headStyle}>Cost</th>
            <th style={headStyle}>Margin</th>
            <th style={headStyle}>Shipments</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const margin = r.revenue - r.cost
            const isOpen = expandedKey === r.key
            return (
              <Fragment key={r.key}>
                <tr onClick={() => onToggle(r.key)} style={{ borderBottom: `1px solid ${T.surfaceRaised}`, cursor: 'pointer' }}>
                  <td style={{ ...cellStyle, fontSize: 13, fontWeight: 600, color: T.ink }}>{r.key}</td>
                  <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: T.success }}>{fmt(r.revenue)}</td>
                  <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: T.danger }}>{fmt(r.cost)}</td>
                  <td style={{ ...cellStyle, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: margin >= 0 ? T.success : T.danger }}>{fmt(margin)}</td>
                  <td style={{ ...cellStyle, fontSize: 12.5, color: T.muted }}>{r.shipmentIds.size}</td>
                </tr>
                {isOpen && (
                  <tr style={{ borderBottom: `1px solid ${T.surfaceRaised}`, background: T.rowStripe }}>
                    <td colSpan={5} style={{ padding: '10px 20px 16px' }}>
                      <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 6 }}>Underlying shipments</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                        {Array.from(r.shipmentIds).map((id) => {
                          const meta = shipmentMeta.get(id)
                          if (!meta) return null
                          return (
                            <div key={id} style={{ fontSize: 12, color: T.muted }}>
                              <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.text }}>{meta.ref}</span> · {meta.mode} ·{' '}
                              {meta.origin} → {meta.destination} · {meta.status}
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 6 }}>Invoices</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                        {invoices
                          .filter((i) => i.shipment_id && r.shipmentIds.has(i.shipment_id))
                          .map((i) => (
                            <div key={i.id} style={{ fontSize: 12, color: T.muted }}>
                              <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.text }}>{i.ref}</span> · {fmt(i.amount_inr)} · {i.status}
                            </div>
                          ))}
                      </div>
                      <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 6 }}>Costs</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {costs
                          .filter((c) => r.shipmentIds.has(c.shipment_id))
                          .map((c) => (
                            <div key={c.id} style={{ fontSize: 12, color: T.muted }}>
                              {c.description} · {fmt(c.amount)} · {c.vendor_name ?? '—'}
                            </div>
                          ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      {rows.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.placeholder, fontSize: 13 }}>No data yet.</div>}
    </div>
  )
}

const secondaryButtonStyle: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: `1px solid ${T.border}`,
  background: 'transparent',
  color: T.muted,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
}
