import type { InvoiceStatus } from './accounting'
import type { ShipmentDocumentType } from './documents'
import { T } from '../theme/tokens'

export type ShipmentMode = 'ocean' | 'air' | 'truck'
export type ShipmentStatus = 'Booked' | 'Docs' | 'Cleared' | 'In Transit' | 'Delivered'

export interface Shipment {
  id: string
  org_id: string
  ref: string
  mode: ShipmentMode
  client: string
  origin: string
  destination: string
  status: ShipmentStatus
  load_type: string | null
  container_size: string | null
  vessel_name: string | null
  voyage_no: string | null
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  gross_weight_kg: number | null
  vehicle_type: string | null
  driver_phone: string | null
  shipper_contact_id: string | null
  consignee_contact_id: string | null
  tracking_token: string
  carrier_scac: string | null
  carrier_request_number: string | null
  carrier_tracking_request_id: string | null
  carrier_tracking_registered_at: string | null
  created_by: string | null
  created_at: string
}

export const MODE_META: Record<ShipmentMode, { label: string; color: string }> = {
  ocean: { label: 'Ocean', color: T.modeOcean },
  air: { label: 'Air', color: T.modeAir },
  truck: { label: 'Truck', color: T.modeTruck },
}

export const RATE_BASIS_META: Record<ShipmentMode, { label: string; unit: string }> = {
  ocean: { label: 'Per Container', unit: 'container(s)' },
  air: { label: 'Per Kg', unit: 'kg' },
  truck: { label: 'Per Trip', unit: 'trip(s)' },
}

export const STATUS_SEQUENCE: ShipmentStatus[] = ['Booked', 'Docs', 'Cleared', 'In Transit', 'Delivered']

export const STATUS_META: Record<string, { bg: string; color: string }> = {
  Booked: { bg: T.warningWash, color: T.warning },
  Docs: { bg: T.dangerWash, color: T.danger },
  Cleared: { bg: T.infoWash, color: T.info },
  'In Transit': { bg: T.infoWash, color: T.info },
  Delivered: { bg: T.successWash, color: T.success },
}

export function statusMeta(status: string): { bg: string; color: string } {
  return STATUS_META[status] ?? { bg: T.statusNeutralWash, color: T.statusNeutral }
}

export interface StatusHistoryEntry {
  from_status: ShipmentStatus | null
  to_status: ShipmentStatus
  changed_by_email: string
  created_at: string
}

export interface PublicTrackingData {
  ref: string
  mode: ShipmentMode
  origin: string
  destination: string
  status: ShipmentStatus
  client_name: string
  created_at: string
  history: { from_status: ShipmentStatus | null; to_status: ShipmentStatus; created_at: string }[]
  invoices: {
    ref: string
    currency: string
    amount: number
    amount_inr: number
    status: InvoiceStatus
    due_date: string | null
  }[]
  documents: { document_type: ShipmentDocumentType; ref: string | null; created_at: string }[]
}
