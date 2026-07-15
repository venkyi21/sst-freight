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
  state: string | null
  notes: string | null
  archived: boolean
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
