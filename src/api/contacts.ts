import { supabase } from '../lib/supabaseClient'
import type { Contact, ContactKind, Invoice, Shipment, VendorType } from '../types'

export async function fetchContacts(orgId: string): Promise<{ data: Contact[] | null; error: string | null }> {
  const { data, error } = await supabase.from('contacts').select('*').eq('org_id', orgId).order('created_at', { ascending: false })
  return { data: (data as Contact[] | null) ?? null, error: error?.message ?? null }
}

export interface ContactPayload {
  org_id: string
  kind: ContactKind
  vendor_type: VendorType | null
  name: string
  email: string | null
  phone: string | null
  city: string | null
  country: string | null
  state: string | null
  gstin: string | null
  address_line1: string | null
  pincode: string | null
  notes: string | null
}

export async function createContact(payload: ContactPayload, createdBy: string): Promise<{ data: Contact | null; error: string | null }> {
  const { data, error } = await supabase.from('contacts').insert({ ...payload, created_by: createdBy }).select().single()
  return { data: (data as Contact | null) ?? null, error: error?.message ?? null }
}

export async function updateContact(contactId: string, payload: ContactPayload): Promise<{ data: Contact | null; error: string | null }> {
  const { data, error } = await supabase.from('contacts').update(payload).eq('id', contactId).select().single()
  return { data: (data as Contact | null) ?? null, error: error?.message ?? null }
}

export async function archiveContactToggle(contact: Contact): Promise<{ data: Contact | null; error: string | null }> {
  const { data, error } = await supabase.from('contacts').update({ archived: !contact.archived }).eq('id', contact.id).select().single()
  return { data: (data as Contact | null) ?? null, error: error?.message ?? null }
}

export interface ContactOption {
  id: string
  name: string
}

export async function fetchContactOptions(orgId: string, kind: 'shipper' | 'consignee' | 'vendor'): Promise<ContactOption[]> {
  const { data } = await supabase.from('contacts').select('id, name').eq('org_id', orgId).eq('kind', kind).eq('archived', false)
  return (data as ContactOption[]) ?? []
}

// Re-checks for an exact-name match at submit time rather than trusting the autocomplete's
// client-side list (which may still be loading) — avoids creating a duplicate contact.
export async function resolveOrCreateContact(
  orgId: string,
  existingId: string | null,
  kind: 'shipper' | 'consignee',
  name: string,
  userId: string,
): Promise<string | null> {
  if (existingId) return existingId
  const { data: existingMatch } = await supabase.from('contacts').select('id').eq('org_id', orgId).eq('kind', kind).ilike('name', name).limit(1).maybeSingle()
  if (existingMatch) return (existingMatch as { id: string }).id

  const { data, error: insertError } = await supabase.from('contacts').insert({ org_id: orgId, kind, name, created_by: userId }).select('id').single()
  if (insertError || !data) return null
  return (data as { id: string }).id
}

export interface ContactHistory {
  shipments: Shipment[]
  invoices: Invoice[]
}

// Plain RLS-gated selects (ADR-0002's simple-CRUD side) over the ADR-0003 FK columns — the name
// snapshots on each row are for display, the FKs are what make this list accurate after renames.
export async function fetchContactHistory(orgId: string, contactId: string): Promise<{ data: ContactHistory | null; error: string | null }> {
  const [shipmentsRes, invoicesRes] = await Promise.all([
    supabase
      .from('shipments')
      .select('*')
      .eq('org_id', orgId)
      .or(`shipper_contact_id.eq.${contactId},consignee_contact_id.eq.${contactId}`)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('*')
      .eq('org_id', orgId)
      .eq('client_contact_id', contactId)
      .order('created_at', { ascending: false }),
  ])
  const error = shipmentsRes.error?.message ?? invoicesRes.error?.message ?? null
  if (error) return { data: null, error }
  return {
    data: {
      shipments: (shipmentsRes.data as Shipment[] | null) ?? [],
      invoices: (invoicesRes.data as Invoice[] | null) ?? [],
    },
    error: null,
  }
}

export async function fetchContactEmail(contactId: string): Promise<string | null> {
  const { data } = await supabase.from('contacts').select('email').eq('id', contactId).maybeSingle()
  return (data as { email: string | null } | null)?.email ?? null
}

export async function fetchContactState(contactId: string): Promise<string | null> {
  const { data } = await supabase.from('contacts').select('state').eq('id', contactId).maybeSingle()
  return (data as { state: string | null } | null)?.state ?? null
}
