import { MODE_META, statusMeta, type Shipment } from '../types'

interface ShipmentsTableProps {
  shipments: Shipment[]
  loading: boolean
}

export default function ShipmentsTable({ shipments, loading }: ShipmentsTableProps) {
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1e293b', background: 'rgba(255,255,255,0.02)' }}>
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
              <tr key={s.id} style={{ borderBottom: '1px solid #172033' }}>
                <td style={cellStyle}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: mode.color }}>{mode.label}</span>
                </td>
                <td style={{ ...cellStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13, color: '#f1f5f9' }}>
                  {s.ref}
                </td>
                <td style={{ ...cellStyle, fontSize: 13, color: '#94a3b8' }}>{s.client}</td>
                <td style={{ ...cellStyle, fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: '#cbd5e1' }}>{s.origin}</div>
                  <div style={{ color: '#5b6b82' }}>→ {s.destination}</div>
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
        <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 13 }}>
          No shipments match your search or filter.
        </div>
      )}
      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 13 }}>Loading shipments…</div>}
    </div>
  )
}

const headStyle = {
  padding: '13px 20px',
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
}

const cellStyle = {
  padding: '14px 20px',
}
