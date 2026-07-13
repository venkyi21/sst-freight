export type ShipmentMode = 'ocean' | 'air' | 'truck'

export type MembershipRole = 'owner' | 'admin' | 'member'

export interface Organization {
  id: string
  name: string
  slug: string
  color: string
  invite_code: string
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
  created_by: string | null
  created_at: string
}

export type NavPage = 'dashboard' | 'directory' | 'team' | 'quotes' | 'accounting' | 'customs'

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
