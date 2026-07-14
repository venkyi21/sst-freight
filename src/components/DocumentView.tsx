import { useEffect, useState } from 'react'
import { computeDocumentRows, fetchShipmentDocumentData, type ShipmentDocumentData } from '../lib/documentHtml'
import { SHIPMENT_DOCUMENT_TYPE_META, type Shipment, type ShipmentDocumentType } from '../types'

interface DocumentViewProps {
  shipment: Shipment
  documentType: ShipmentDocumentType
  documentRef: string
  onClose: () => void
}

const EMPTY_DATA: ShipmentDocumentData = { contacts: { shipper: null, consignee: null }, invoice: null, customsFiling: null }

export default function DocumentView({ shipment, documentType, documentRef: docRef, onClose }: DocumentViewProps) {
  const [data, setData] = useState<ShipmentDocumentData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchShipmentDocumentData(shipment).then((result) => {
      if (cancelled) return
      setData(result)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [shipment])

  const rows = computeDocumentRows(documentType, shipment, data, docRef)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4,8,16,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 60,
        padding: 24,
      }}
    >
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #document-print-area, #document-print-area * { visibility: visible; }
          #document-print-area {
            position: absolute; top: 0; left: 0; width: 100%; padding: 0; margin: 0;
            background: #fff !important; color: #000 !important; box-shadow: none !important; border: none !important;
          }
          #document-print-area * { color: #000 !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        id="document-print-area"
        style={{
          width: '100%',
          maxWidth: 620,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 14,
          padding: 30,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#5b6b82', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {SHIPMENT_DOCUMENT_TYPE_META[documentType].label}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ fontSize: 19, fontWeight: 700, color: '#f1f5f9', marginBottom: 2 }}>{SHIPMENT_DOCUMENT_TYPE_META[documentType].label}</div>
        <div style={{ fontSize: 12.5, color: '#94a3b8', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 20 }}>
          {shipment.ref} · {docRef}
        </div>

        {loading ? (
          <div style={{ color: '#5b6b82', fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 20 }}>
            {rows.map((r) => (
              <div
                key={r.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '9px 0',
                  borderBottom: '1px solid #172033',
                  fontSize: 13,
                }}
              >
                <div style={{ color: '#64748b' }}>{r.label}</div>
                <div style={{ color: '#e2e8f0', textAlign: 'right' }}>{r.value}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, color: '#4ade80', lineHeight: 1.5, marginBottom: 20 }}>
          Generated live from this shipment's own records — shipper, consignee, and cargo details are
          never re-typed, so this always agrees with your other shipment documents.
        </div>

        <button
          type="button"
          className="no-print"
          onClick={() => window.print()}
          style={{
            width: '100%',
            padding: 11,
            borderRadius: 8,
            border: 'none',
            background: '#2563eb',
            color: '#fff',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Print / Save as PDF
        </button>
      </div>
    </div>
  )
}
