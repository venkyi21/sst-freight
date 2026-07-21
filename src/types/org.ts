import { T } from '../theme/tokens'

export type MembershipRole = 'owner' | 'admin' | 'member'
export type BillingModel = 'model_1' | 'model_2'
export type PlatformModule = 'directory' | 'quotes' | 'accounting'

export interface Organization {
  id: string
  name: string
  slug: string
  color: string
  logo_url: string | null
  invite_code: string
  billing_model: BillingModel
  monthly_fee_inr: number
  enabled_modules: PlatformModule[]
  gst_state: string | null
  referral_code: string | null
  created_at: string
}

export interface Membership {
  id: string
  user_id: string
  org_id: string
  role: MembershipRole
  created_at: string
}

export interface OrganizationWithRole extends Organization {
  role: MembershipRole
}

export interface OrgMember {
  membership_id: string
  user_id: string
  email: string
  role: MembershipRole
  created_at: string
}

export const ROLE_META: Record<MembershipRole, { label: string }> = {
  owner: { label: 'Owner' },
  admin: { label: 'Admin' },
  member: { label: 'Member' },
}

export const PLATFORM_MODULE_META: Record<PlatformModule, { label: string }> = {
  directory: { label: 'Directory' },
  quotes: { label: 'Rates & Quoting' },
  accounting: { label: 'Accounting' },
}

export const BILLING_MODEL_META: Record<BillingModel, { label: string; color: string; background: string }> = {
  model_1: { label: 'Model 1 · Add-on Engine', color: T.info, background: T.infoWash },
  model_2: { label: 'Model 2 · FinTech Slice', color: T.success, background: T.successWash },
}

export interface PlatformOrgSummary {
  id: string
  name: string
  billing_model: BillingModel
  monthly_fee_inr: number
  enabled_modules: PlatformModule[]
  created_at: string
}

export type PlatformRakeType = 'fx_spread' | 'cargo_insurance' | 'instant_payout'

export interface PlatformRevenueEntry {
  id: string
  org_id: string
  org_name: string
  invoice_id: string | null
  shipment_cost_id: string | null
  rake_type: PlatformRakeType
  rate_pct: number
  base_amount_inr: number
  rake_amount_inr: number
  created_at: string
}

export const PLATFORM_RAKE_META: Record<PlatformRakeType, { label: string }> = {
  fx_spread: { label: 'FX Spread' },
  cargo_insurance: { label: 'Cargo Insurance' },
  instant_payout: { label: 'Instant Vendor Payout' },
}

export type AuditOperation = 'insert' | 'update' | 'delete'
export type AuditTableName = 'contacts' | 'memberships' | 'invoices' | 'shipment_costs' | 'organizations' | 'customs_filings' | 'shipment_documents' | 'esign_requests'

export interface AuditLogEntry {
  id: string
  table_name: string
  record_id: string
  operation: AuditOperation
  changed_by_email: string | null
  changed_at: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}

export const AUDIT_TABLE_META: Record<AuditTableName, { label: string }> = {
  contacts: { label: 'Contacts' },
  memberships: { label: 'Team' },
  invoices: { label: 'Invoices' },
  shipment_costs: { label: 'Shipment Costs' },
  organizations: { label: 'Billing Plan' },
  customs_filings: { label: 'Customs Filings' },
  shipment_documents: { label: 'Shipment Documents' },
  esign_requests: { label: 'E-Signature Requests' },
}

export const AUDIT_OPERATION_META: Record<AuditOperation, { label: string; color: string; background: string }> = {
  insert: { label: 'Created', color: T.success, background: T.successWash },
  update: { label: 'Updated', color: T.info, background: T.infoWash },
  delete: { label: 'Deleted', color: T.danger, background: T.dangerWash },
}

export type DashboardWidgetKey =
  | 'kpi_tiles'
  | 'volume_by_mode'
  | 'shipments_by_status'
  | 'revenue_trend'
  | 'customer_profitability'
  | 'route_profitability'
  | 'invoice_aging'

export const DASHBOARD_WIDGET_META: Record<DashboardWidgetKey, { label: string }> = {
  kpi_tiles: { label: 'KPI Summary' },
  volume_by_mode: { label: 'Volume by Mode' },
  shipments_by_status: { label: 'Shipments by Status' },
  revenue_trend: { label: 'Revenue Trend (6 months)' },
  customer_profitability: { label: 'Customer Profitability' },
  route_profitability: { label: 'Route Profitability' },
  invoice_aging: { label: 'Invoice Ageing' },
}

export const DASHBOARD_WIDGET_ORDER: DashboardWidgetKey[] = [
  'kpi_tiles',
  'volume_by_mode',
  'shipments_by_status',
  'revenue_trend',
  'customer_profitability',
  'route_profitability',
  'invoice_aging',
]

export interface DashboardPreference {
  id: string
  org_id: string
  user_id: string
  widget_key: DashboardWidgetKey
  visible: boolean
  sort_order: number
  created_at: string
}

// GAP 03 (ADR-0024): same auth.uid() = user_id + is_org_member(org_id) RLS shape as
// DashboardPreference above. Step completion itself is derived client-side from real org data
// (contacts/quotes/shipments/invoices counts), not stored here — this row only tracks dismissal.
export interface UserOnboardingState {
  id: string
  org_id: string
  user_id: string
  dismissed: boolean
  created_at: string
}
