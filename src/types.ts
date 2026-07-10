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

export interface Shipment {
  id: string
  org_id: string
  ref: string
  mode: ShipmentMode
  client: string
  origin: string
  destination: string
  status: string
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
  created_by: string | null
  created_at: string
}

export type NavPage = 'dashboard' | 'directory' | 'customs'

export const MODE_META: Record<ShipmentMode, { label: string; color: string }> = {
  ocean: { label: 'Ocean', color: '#38bdf8' },
  air: { label: 'Air', color: '#a78bfa' },
  truck: { label: 'Truck', color: '#fbbf24' },
}

export const STATUS_META: Record<string, { bg: string; color: string }> = {
  'Customs Cleared': { bg: 'rgba(16,185,129,0.12)', color: '#4ade80' },
  Delivered: { bg: 'rgba(16,185,129,0.12)', color: '#4ade80' },
  'In Transit': { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa' },
  'Vessel Departed': { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa' },
  Booked: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24' },
  Loading: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24' },
  'Gate-In Port': { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24' },
  'Pending Documentation': { bg: 'rgba(244,63,94,0.12)', color: '#fb7185' },
}

export function statusMeta(status: string): { bg: string; color: string } {
  return STATUS_META[status] ?? { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8' }
}

export const TENANT_COLORS = ['#2563eb', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4']
