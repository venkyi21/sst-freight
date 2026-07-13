import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  SHIPMENT_DOCUMENT_TYPE_META,
  type CustomsFiling,
  type Invoice,
  type Shipment,
  type ShipmentDocumentType,
} from '../types'

interface DocumentViewProps {
  shipment: Shipment
  documentType: ShipmentDocumentType
  documentRef: string
  onClose: () => void
}

interface ContactNames {
  shipper: string | null
  consignee: string | null
}

export default function DocumentView({ shipment, documentType, documentRef: docRef, onClose }: DocumentViewProps) {
  const [contacts, setContacts] = useState<ContactNames>({ shipper: null, consignee: null })
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [customsFiling, setCustomsFiling] = useState<CustomsFiling | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const ids = [shipment.shipper_contact_id, shipment.consignee_contact_id].filter(Boolean) as string[]
      const [contactsRes, invoiceRes, filingRes] = await Promise.all([
        ids.length > 0 ? supabase.from('contacts').select('id, name').in('id', ids) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        supabase.from('invoices').select('*').eq('shipment_id', shipment.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('customs_filings').select('*').eq('shipment_id', shipment.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (cancelled) return
      const byId = new Map((contactsRes.data ?? []).map((c) => [c.id, c.name]))
      setContacts({
        shipper: shipment.shipper_contact_id ? byId.get(shipment.shipper_contact_id) ?? null : null,
        consignee: shipment.consignee_contact_id ? byId.get(shipment.consignee_contact_id) ?? null : shipment.client,
      })
      setInvoice((invoiceRes as { data: Invoice | null }).data ?? null)
      setCustomsFiling((filingRes as { data: CustomsFiling | null }).data ?? null)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [shipment])

  const goodsDescription = customsFiling?.goods_description ?? 'General Cargo'
  const volumetricWeight =
    shipment.length_cm && shipment.width_cm && shipment.height_cm
      ? (shipment.length_cm * shipment.width_cm * shipment.height_cm) / 6000
      : null

  const rows: { label: string; value: string }[] = (() => {
    const shipperLine = contacts.shipper ?? '—'
    const consigneeLine = contacts.consignee ?? '—'
    switch (documentType) {
      case 'bill_of_lading':
        return [
          { label: 'Shipper', value: shipperLine },
          { label: 'Consignee', value: consigneeLine },
          { label: 'Vessel / Voyage', value: shipment.mode === 'ocean' ? `${shipment.vessel_name ?? '—'} / ${shipment.voyage_no ?? '—'}` : 'N/A' },
          { label: 'Vehicle', value: shipment.mode === 'truck' ? shipment.vehicle_type ?? '—' : 'N/A' },
          { label: 'Port / Place of Loading', value: shipment.origin },
          { label: 'Port / Place of Discharge', value: shipment.destination },
          { label: 'Container / Load Type', value: `${shipment.container_size ?? '—'} / ${shipment.load_type ?? '—'}` },
          { label: 'Description of Goods', value: goodsDescription },
          { label: 'Gross Weight', value: shipment.gross_weight_kg ? `${shipment.gross_weight_kg} kg` : '—' },
          { label: 'B/L No.', value: docRef },
        ]
      case 'packing_list':
        return [
          { label: 'Shipper', value: shipperLine },
          { label: 'Consignee', value: consigneeLine },
          { label: 'Packing List No.', value: docRef },
          {
            label: 'Dimensions (L × W × H)',
            value: shipment.length_cm ? `${shipment.length_cm} × ${shipment.width_cm} × ${shipment.height_cm} cm` : '—',
          },
          { label: 'Gross Weight', value: shipment.gross_weight_kg ? `${shipment.gross_weight_kg} kg` : '—' },
          { label: 'Volumetric Weight', value: volumetricWeight ? `${volumetricWeight.toFixed(2)} kg` : '—' },
          { label: 'Description of Goods', value: goodsDescription },
        ]
      case 'certificate_of_origin':
        return [
          { label: 'Exporter', value: shipperLine },
          { label: 'Consignee', value: consigneeLine },
          { label: 'Country of Origin', value: 'India' },
          { label: 'HS Code', value: customsFiling?.hs_code ?? '—' },
          { label: 'Description of Goods', value: goodsDescription },
          { label: 'Certificate No.', value: docRef },
        ]
      case 'commercial_invoice':
      default:
        return [
          { label: 'Seller', value: shipperLine },
          { label: 'Buyer', value: consigneeLine },
          { label: 'Invoice No.', value: invoice?.ref ?? docRef },
          { label: 'Amount', value: invoice ? `${invoice.currency} ${invoice.amount.toLocaleString('en-IN')}` : '—' },
          { label: 'Description of Goods', value: goodsDescription },
        ]
    }
  })()

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
