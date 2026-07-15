export type ShipmentDocumentType =
  | 'bill_of_lading'
  | 'packing_list'
  | 'certificate_of_origin'
  | 'commercial_invoice'
  | 'scmtr_compliance_report'
  | 'other'
export type ShipmentDocumentSource = 'generated' | 'uploaded'

export const SHIPMENT_DOCUMENT_TYPE_META: Record<ShipmentDocumentType, { label: string }> = {
  bill_of_lading: { label: 'Bill of Lading' },
  packing_list: { label: 'Packing List' },
  certificate_of_origin: { label: 'Certificate of Origin' },
  commercial_invoice: { label: 'Commercial Invoice' },
  // GAP 05 (ADR-0024): a standalone duty-transparency export a forwarder's own staff can use
  // manually alongside CargoWise/Magaya — no API integration with those platforms, real API
  // access to either is partner-agreement-gated (same wall GAP 01 hit).
  scmtr_compliance_report: { label: 'SCMTR Compliance Report' },
  other: { label: 'Other' },
}

export const GENERATED_DOCUMENT_TYPES: ShipmentDocumentType[] = [
  'bill_of_lading',
  'packing_list',
  'certificate_of_origin',
  'commercial_invoice',
  'scmtr_compliance_report',
]

export interface ShipmentDocument {
  id: string
  org_id: string
  shipment_id: string
  document_type: ShipmentDocumentType
  source: ShipmentDocumentSource
  ref: string | null
  file_name: string | null
  storage_path: string | null
  created_by: string | null
  created_at: string
}

export type EsignDocumentType = 'quote' | 'bill_of_lading'
export type EsignStatus = 'sent' | 'delivered' | 'completed' | 'declined' | 'voided'

export const ESIGN_STATUS_META: Record<EsignStatus, { label: string; color: string; background: string }> = {
  sent: { label: 'Sent', color: '#60a5fa', background: 'rgba(37,99,235,0.14)' },
  delivered: { label: 'Delivered', color: '#fbbf24', background: 'rgba(251,191,36,0.12)' },
  completed: { label: 'Completed', color: '#4ade80', background: 'rgba(34,197,94,0.14)' },
  declined: { label: 'Declined', color: '#fb7185', background: 'rgba(244,63,94,0.14)' },
  voided: { label: 'Voided', color: '#94a3b8', background: 'rgba(148,163,184,0.12)' },
}

export interface EsignRequest {
  id: string
  org_id: string
  document_type: EsignDocumentType
  quote_id: string | null
  shipment_id: string | null
  envelope_id: string | null
  recipient_name: string
  recipient_email: string
  status: EsignStatus
  created_by: string | null
  created_at: string
  updated_at: string
}
