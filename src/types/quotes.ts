import type { ShipmentMode } from './shipments'
import { T } from '../theme/tokens'

export interface Tariff {
  id: string
  org_id: string
  mode: ShipmentMode
  origin: string
  destination: string
  rate: number
  currency: string
  notes: string | null
  sac_code: string | null
  default_gst_rate: number | null
  created_by: string | null
  created_at: string
}

// Week 15 (ADR-0022): draft -> sent -> accepted/rejected, plus a direct draft/sent/accepted ->
// converted shortcut. Enforced server-side by the validate_quote_status_transition() trigger, not
// just this client-side type — see docs/adr/0022-....md for the exact allowed-pairs set.
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted'

export const QUOTE_STATUS_META: Record<QuoteStatus, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: T.statusNeutral, bg: T.statusNeutralWash },
  sent: { label: 'Sent', color: T.info, bg: T.infoWash },
  accepted: { label: 'Accepted', color: T.success, bg: T.successWash },
  rejected: { label: 'Rejected', color: T.danger, bg: T.dangerWash },
  converted: { label: 'Converted', color: T.success, bg: T.successWash },
}

export interface Quote {
  id: string
  org_id: string
  ref: string
  tariff_id: string | null
  mode: ShipmentMode
  origin: string
  destination: string
  shipper_contact_id: string | null
  shipper_name: string
  consignee_contact_id: string | null
  consignee_name: string
  quantity: number
  rate: number
  currency: string
  total: number
  status: QuoteStatus
  rejection_reason: string | null
  archived: boolean
  converted_shipment_id: string | null
  created_by: string | null
  created_at: string
}

// Week 14 (ADR-0021): itemized breakdown, additive alongside Quote.rate/quantity/total — a quote
// with no line items uses those columns as before; total = sum(line items) once they exist.
export interface QuoteLineItem {
  id: string
  org_id: string
  quote_id: string
  description: string
  sac_code: string | null
  quantity: number
  rate: number
  currency: string
  amount: number
  created_by: string | null
  created_at: string
}
