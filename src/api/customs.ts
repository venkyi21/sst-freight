import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { customsFilingRefPrefix, generateRef } from '../lib/refGenerator'
import type { CustomsFiling, CustomsFilingType, HsCode } from '../types'

export async function fetchCustomsFilings(orgId: string): Promise<{ data: CustomsFiling[] | null; error: string | null }> {
  const { data, error } = await supabase.from('customs_filings').select('*').eq('org_id', orgId).order('created_at', { ascending: false })
  return { data: (data as CustomsFiling[] | null) ?? null, error: error?.message ?? null }
}

export async function fetchHsCodes(): Promise<HsCode[]> {
  const { data } = await supabase.from('hs_codes').select('*').order('hs_code')
  return (data as HsCode[]) ?? []
}

// Retries on (org_id, ref) unique_violation (23505) by regenerating a fresh ref.
export async function insertCustomsFiling(payload: Record<string, unknown>, filingType: CustomsFilingType): Promise<{ data: CustomsFiling | null; error: PostgrestError | null }> {
  let lastError: PostgrestError | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('customs_filings')
      .insert({ ...payload, ref: generateRef(customsFilingRefPrefix(filingType)) })
      .select()
      .single()
    if (!error && data) return { data: data as CustomsFiling, error: null }
    lastError = error
    if (error?.code !== '23505') break
  }
  return { data: null, error: lastError }
}
