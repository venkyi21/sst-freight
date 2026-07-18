import { T } from '../theme/tokens'

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
  sent: { label: 'Sent', color: T.info, background: T.infoWash },
  delivered: { label: 'Delivered', color: T.warning, background: T.warningWash },
  completed: { label: 'Completed', color: T.success, background: T.successWash },
  declined: { label: 'Declined', color: T.danger, background: T.dangerWash },
  voided: { label: 'Voided', color: T.statusNeutral, background: T.statusNeutralWash },
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
