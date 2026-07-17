import { MODE_META, statusMeta, type Shipment } from '../types'
import { T } from '../theme/tokens'

interface ShipmentsTableProps {
  shipments: Shipment[]
  loading: boolean
  onRowClick: (shipment: Shipment) => void
}

export default function ShipmentsTable({ shipments, loading, onRowClick }: ShipmentsTableProps) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.rowStripe }}>
            <th style={headStyle}>Mode</th>
            <th style={headStyle}>Tracking Ref</th>
            <th style={headStyle}>Client</th>
            <th style={headStyle}>Route</th>
            <th style={headStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((s) => {
            const mode = MODE_META[s.mode]
            const status = statusMeta(s.status)
            return (
              <tr key={s.id} onClick={() => onRowClick(s)} style={{ borderBottom: `1px solid ${T.surfaceRaised}`, cursor: 'pointer' }}>
                <td style={cellStyle}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: mode.color }}>{mode.label}</span>
                </td>
                <td style={{ ...cellStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13, color: T.ink }}>
                  {s.ref}
                </td>
                <td style={{ ...cellStyle, fontSize: 13, color: T.muted }}>{s.client}</td>
                <td style={{ ...cellStyle, fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: T.text }}>{s.origin}</div>
                  <div style={{ color: T.faint }}>→ {s.destination}</div>
                </td>
                <td style={cellStyle}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 20,
                      fontSize: 11.5,
                      fontWeight: 600,
                      background: status.bg,
                      color: status.color,
                    }}
                  >
                    ● {s.status}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!loading && shipments.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: T.placeholder, fontSize: 13 }}>
          No shipments match your search or filter.
        </div>
      )}
      {loading && <div style={{ padding: 40, textAlign: 'center', color: T.placeholder, fontSize: 13 }}>Loading shipments…</div>}
    </div>
  )
}

const headStyle = {
  padding: '13px 20px',
  fontSize: 11,
  fontWeight: 600,
  color: T.muted,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
}

const cellStyle = {
  padding: '14px 20px',
}
