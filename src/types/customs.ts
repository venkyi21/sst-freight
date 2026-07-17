import { T } from '../theme/tokens'

export interface HsCode {
  hs_code: string
  description: string
  basic_customs_duty_pct: number
  igst_pct: number
  social_welfare_surcharge_pct: number
  created_at: string
}

export type CustomsFilingType = 'bill_of_entry' | 'shipping_bill'
export type CustomsFilingStatus = 'draft' | 'filed' | 'cleared'

export const CUSTOMS_FILING_TYPE_META: Record<CustomsFilingType, { label: string; shortLabel: string }> = {
  bill_of_entry: { label: 'Bill of Entry (Import)', shortLabel: 'BOE' },
  shipping_bill: { label: 'Shipping Bill (Export)', shortLabel: 'SB' },
}

export const CUSTOMS_FILING_STATUS_META: Record<CustomsFilingStatus, { label: string; color: string; background: string }> = {
  draft: { label: 'Draft', color: T.statusNeutral, background: T.statusNeutralWash },
  filed: { label: 'Filed', color: T.info, background: T.infoWash },
  cleared: { label: 'Cleared', color: T.success, background: T.successWash },
}

export interface CustomsFiling {
  id: string
  org_id: string
  ref: string
  filing_type: CustomsFilingType
  shipment_id: string | null
  shipper_contact_id: string | null
  shipper_name: string | null
  consignee_contact_id: string | null
  consignee_name: string | null
  goods_description: string
  hs_code: string | null
  assessable_value_inr: number
  bcd_amount_inr: number
  sws_amount_inr: number
  igst_amount_inr: number
  total_duty_inr: number
  status: CustomsFilingStatus
  filed_at: string | null
  created_by: string | null
  created_at: string
}
