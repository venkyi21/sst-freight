import { supabase } from '../lib/supabaseClient'
import type { CustomsFiling, DashboardPreference, DashboardWidgetKey, Invoice, Shipment, ShipmentCost, ShipmentDocument } from '../types'

export interface HistoryRow {
  shipment_id: string
  to_status: string
  created_at: string
}

export interface ReportingData {
  shipments: Shipment[]
  invoices: Invoice[]
  costs: ShipmentCost[]
  history: HistoryRow[]
  customsFilings: CustomsFiling[]
  documents: ShipmentDocument[]
  prefs: Map<DashboardWidgetKey, boolean>
  error: string | null
}

export async function fetchReportingData(orgId: string, userId: string | undefined): Promise<ReportingData> {
  const [shipmentsRes, invoicesRes, costsRes, historyRes, filingsRes, docsRes, prefsRes] = await Promise.all([
    supabase.from('shipments').select('*').eq('org_id', orgId),
    supabase.from('invoices').select('*').eq('org_id', orgId),
    supabase.from('shipment_costs').select('*').eq('org_id', orgId),
    supabase.from('shipment_status_history').select('shipment_id, to_status, created_at').eq('org_id', orgId),
    supabase.from('customs_filings').select('*').eq('org_id', orgId),
    supabase.from('shipment_documents').select('*').eq('org_id', orgId),
    userId ? supabase.from('dashboard_preferences').select('*').eq('org_id', orgId).eq('user_id', userId) : Promise.resolve({ data: [] as DashboardPreference[], error: null }),
  ])
  const firstError = shipmentsRes.error || invoicesRes.error || costsRes.error || historyRes.error || filingsRes.error || docsRes.error
  const prefMap = new Map<DashboardWidgetKey, boolean>()
  for (const p of (prefsRes.data ?? []) as DashboardPreference[]) {
    prefMap.set(p.widget_key, p.visible)
  }
  return {
    shipments: (shipmentsRes.data ?? []) as Shipment[],
    invoices: (invoicesRes.data ?? []) as Invoice[],
    costs: (costsRes.data ?? []) as ShipmentCost[],
    history: (historyRes.data ?? []) as unknown as HistoryRow[],
    customsFilings: (filingsRes.data ?? []) as CustomsFiling[],
    documents: (docsRes.data ?? []) as ShipmentDocument[],
    prefs: prefMap,
    error: firstError?.message ?? null,
  }
}

export async function toggleDashboardWidget(orgId: string, userId: string, key: DashboardWidgetKey, visible: boolean): Promise<void> {
  await supabase.from('dashboard_preferences').upsert({ org_id: orgId, user_id: userId, widget_key: key, visible }, { onConflict: 'org_id,user_id,widget_key' })
}
