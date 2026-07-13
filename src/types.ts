export type ShipmentMode = 'ocean' | 'air' | 'truck'

export type MembershipRole = 'owner' | 'admin' | 'member'

export type BillingModel = 'model_1' | 'model_2'
export type PlatformModule = 'directory' | 'quotes' | 'accounting'

export interface Organization {
  id: string
  name: string
  slug: string
  color: string
  invite_code: string
  billing_model: BillingModel
  monthly_fee_inr: number
  enabled_modules: PlatformModule[]
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

export type ContactKind = 'shipper' | 'consignee' | 'overseas_agent' | 'vendor'
export type VendorType = 'trucking_company' | 'cfs_agent'

export interface Contact {
  id: string
  org_id: string
  kind: ContactKind
  vendor_type: VendorType | null
  name: string
  email: string | null
  phone: string | null
  city: string | null
  country: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export const CONTACT_KIND_META: Record<ContactKind, { label: string }> = {
  shipper: { label: 'Shipper' },
  consignee: { label: 'Consignee' },
  overseas_agent: { label: 'Overseas Agent' },
  vendor: { label: 'Vendor' },
}

export const VENDOR_TYPE_META: Record<VendorType, { label: string }> = {
  trucking_company: { label: 'Trucking Company' },
  cfs_agent: { label: 'CFS Agent' },
}

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

export type NavPage = 'dashboard' | 'directory' | 'team' | 'quotes' | 'accounting' | 'customs' | 'auditlog' | 'platformadmin'

export const PLATFORM_MODULE_META: Record<PlatformModule, { label: string }> = {
  directory: { label: 'Directory' },
  quotes: { label: 'Rates & Quoting' },
  accounting: { label: 'Accounting' },
}

export const BILLING_MODEL_META: Record<BillingModel, { label: string; color: string; background: string }> = {
  model_1: { label: 'Model 1 · Add-on Engine', color: '#60a5fa', background: 'rgba(37,99,235,0.14)' },
  model_2: { label: 'Model 2 · FinTech Slice', color: '#4ade80', background: 'rgba(34,197,94,0.14)' },
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
export type AuditTableName = 'contacts' | 'memberships' | 'invoices' | 'shipment_costs' | 'organizations'

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
}

export const AUDIT_OPERATION_META: Record<AuditOperation, { label: string; color: string; background: string }> = {
  insert: { label: 'Created', color: '#4ade80', background: 'rgba(34,197,94,0.14)' },
  update: { label: 'Updated', color: '#60a5fa', background: 'rgba(37,99,235,0.14)' },
  delete: { label: 'Deleted', color: '#fb7185', background: 'rgba(244,63,94,0.14)' },
}

export const MODE_META: Record<ShipmentMode, { label: string; color: string }> = {
  ocean: { label: 'Ocean', color: '#38bdf8' },
  air: { label: 'Air', color: '#a78bfa' },
  truck: { label: 'Truck', color: '#fbbf24' },
}

export const RATE_BASIS_META: Record<ShipmentMode, { label: string; unit: string }> = {
  ocean: { label: 'Per Container', unit: 'container(s)' },
  air: { label: 'Per Kg', unit: 'kg' },
  truck: { label: 'Per Trip', unit: 'trip(s)' },
}

export interface Tariff {
  id: string
  org_id: string
  mode: ShipmentMode
  origin: string
  destination: string
  rate: number
  currency: string
  notes: string | null
  created_by: string | null
  created_at: string
}

export type QuoteStatus = 'draft' | 'converted'

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
  converted_shipment_id: string | null
  created_by: string | null
  created_at: string
}

export type ShipmentStatus = 'Booked' | 'Docs' | 'Cleared' | 'In Transit' | 'Delivered'

export const STATUS_SEQUENCE: ShipmentStatus[] = ['Booked', 'Docs', 'Cleared', 'In Transit', 'Delivered']

export const STATUS_META: Record<string, { bg: string; color: string }> = {
  Booked: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24' },
  Docs: { bg: 'rgba(244,63,94,0.12)', color: '#fb7185' },
  Cleared: { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa' },
  'In Transit': { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa' },
  Delivered: { bg: 'rgba(16,185,129,0.12)', color: '#4ade80' },
}

export function statusMeta(status: string): { bg: string; color: string } {
  return STATUS_META[status] ?? { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8' }
}

export interface StatusHistoryEntry {
  from_status: ShipmentStatus | null
  to_status: ShipmentStatus
  changed_by_email: string
  created_at: string
}

export const TENANT_COLORS = ['#2563eb', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4']

export type InvoiceStatus = 'unpaid' | 'paid'

export interface Invoice {
  id: string
  org_id: string
  ref: string
  shipment_id: string
  client_contact_id: string | null
  client_name: string
  currency: string
  fx_rate: number
  amount: number
  amount_inr: number
  status: InvoiceStatus
  due_date: string | null
  paid_at: string | null
  created_by: string | null
  created_at: string
}

export interface ShipmentCost {
  id: string
  org_id: string
  shipment_id: string
  vendor_contact_id: string | null
  vendor_name: string | null
  description: string
  amount: number
  created_by: string | null
  created_at: string
}

export const INVOICE_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'CNY']

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
}
