import { Fragment, useEffect, useState, type CSSProperties } from 'react'
import { fetchAuditLog } from '../api/accounting'
import {
  AUDIT_OPERATION_META,
  AUDIT_TABLE_META,
  type AuditLogEntry,
  type AuditTableName,
  type MembershipRole,
} from '../types'
import { T } from '../theme/tokens'

type TableFilter = 'all' | AuditTableName

const filterButtonStyle = (active: boolean): CSSProperties => ({
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

const opChipStyle = (operation: AuditLogEntry['operation']): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 9px',
  borderRadius: 20,
  fontSize: 11,
  fontWeight: 600,
  background: AUDIT_OPERATION_META[operation].background,
  color: AUDIT_OPERATION_META[operation].color,
})

interface AuditLogPageProps {
  orgId: string
  currentRole: MembershipRole
}

function diffFields(entry: AuditLogEntry): { field: string; before: unknown; after: unknown }[] {
  if (entry.operation === 'insert') {
    return Object.entries(entry.new_data ?? {}).map(([field, after]) => ({ field, before: undefined, after }))
  }
  if (entry.operation === 'delete') {
    return Object.entries(entry.old_data ?? {}).map(([field, before]) => ({ field, before, after: undefined }))
  }
  const before = entry.old_data ?? {}
  const after = entry.new_data ?? {}
  const fields = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...fields]
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({ field, before: before[field], after: after[field] }))
}

function formatValue(value: unknown): string {
  if (value === undefined) return '—'
  if (value === null) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function AuditLogPage({ orgId, currentRole }: AuditLogPageProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [tableFilter, setTableFilter] = useState<TableFilter>('all')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const isAdminViewer = currentRole === 'owner' || currentRole === 'admin'

  useEffect(() => {
    if (!isAdminViewer) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    fetchAuditLog(orgId, tableFilter === 'all' ? null : tableFilter).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setLoadError(error)
      } else if (data) {
        setEntries(data)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [orgId, tableFilter, reloadToken, isAdminViewer])

  if (!isAdminViewer) {
    return (
      <div style={{ padding: '28px 32px', flex: 1 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 18px', color: T.ink }}>Audit Log</h1>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <div style={{ color: T.muted, fontSize: 13.5 }}>Only Owners and Admins can view the audit log.</div>
        </div>
      </div>
    )
  }

  const filtered = entries.filter((e) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return e.record_id.toLowerCase().includes(q) || (e.changed_by_email ?? '').toLowerCase().includes(q)
  })

  return (
    <div style={{ padding: '28px 32px', flex: 1 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 4px', color: T.ink }}>Audit Log</h1>
        <div style={{ fontSize: 12.5, color: T.muted }}>
          Every change to contacts, team roles, invoices, and shipment costs — who, what, and when.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 4 }}>
          <button type="button" onClick={() => setTableFilter('all')} style={filterButtonStyle(tableFilter === 'all')}>
            All
          </button>
          {(Object.keys(AUDIT_TABLE_META) as AuditTableName[]).map((t) => (
            <button key={t} type="button" onClick={() => setTableFilter(t)} style={filterButtonStyle(tableFilter === t)}>
              {AUDIT_TABLE_META[t].label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by record id or who changed it..."
          style={{
            flex: 1,
            minWidth: 220,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12.5,
            color: T.text,
          }}
        />
      </div>

      {loadError ? (
        <div
          style={{
            background: T.dangerWash,
            border: `1px solid ${T.dangerBorder}`,
            borderRadius: 12,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ color: T.danger, fontSize: 13.5, marginBottom: 12 }}>Couldn't load audit log: {loadError}</div>
          <button
            type="button"
            onClick={() => setReloadToken((t) => t + 1)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              background: 'transparent',
              color: T.text,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.rowStripe }}>
                <th style={headStyle}>Table</th>
                <th style={headStyle}>Change</th>
                <th style={headStyle}>Changed by</th>
                <th style={headStyle}>When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const isExpanded = expandedId === entry.id
                const diffs = diffFields(entry)
                return (
                  <Fragment key={entry.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      style={{ borderBottom: `1px solid ${T.surfaceRaised}`, cursor: 'pointer' }}
                    >
                      <td style={{ ...cellStyle, fontSize: 13, fontWeight: 600, color: T.ink }}>
                        {AUDIT_TABLE_META[entry.table_name as AuditTableName]?.label ?? entry.table_name}
                      </td>
                      <td style={cellStyle}>
                        <span style={opChipStyle(entry.operation)}>{AUDIT_OPERATION_META[entry.operation].label}</span>
                      </td>
                      <td style={{ ...cellStyle, fontSize: 12.5, color: T.muted }}>
                        {entry.changed_by_email ?? '—'}
                      </td>
                      <td style={{ ...cellStyle, fontSize: 12, color: T.faint, whiteSpace: 'nowrap' }}>
                        {new Date(entry.changed_at).toLocaleString()}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr style={{ borderBottom: `1px solid ${T.surfaceRaised}`, background: T.rowStripe }}>
                        <td colSpan={4} style={{ padding: '10px 20px 16px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {diffs.length === 0 && (
                              <div style={{ fontSize: 12, color: T.placeholder }}>No field-level changes recorded.</div>
                            )}
                            {diffs.map(({ field, before, after }) => (
                              <div key={field} style={{ display: 'flex', gap: 10, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>
                                <span style={{ color: T.muted, minWidth: 140 }}>{field}</span>
                                {entry.operation === 'update' ? (
                                  <span>
                                    <span style={{ color: T.danger }}>{formatValue(before)}</span>
                                    <span style={{ color: T.placeholder }}> → </span>
                                    <span style={{ color: T.success }}>{formatValue(after)}</span>
                                  </span>
                                ) : (
                                  <span style={{ color: T.text }}>{formatValue(entry.operation === 'delete' ? before : after)}</span>
                                )}
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
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: T.placeholder, fontSize: 13 }}>No audit entries found.</div>
          )}
          {loading && <div style={{ padding: 40, textAlign: 'center', color: T.placeholder, fontSize: 13 }}>Loading audit log…</div>}
        </div>
      )}
    </div>
  )
}
