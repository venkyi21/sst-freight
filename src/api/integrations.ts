import { supabase } from '../lib/supabaseClient'
import type { ApiKey, ApiKeyCreated, WebhookDelivery, WebhookEndpoint, WebhookEventType } from '../types/integrations'

export async function createApiKey(orgId: string, label: string): Promise<{ data: ApiKeyCreated | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_api_key', { p_org_id: orgId, p_label: label })
  return { data: (data as ApiKeyCreated | null) ?? null, error: error?.message ?? null }
}

export async function listApiKeys(orgId: string): Promise<{ data: ApiKey[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_api_keys', { p_org_id: orgId })
  return { data: (data as ApiKey[] | null) ?? null, error: error?.message ?? null }
}

export async function revokeApiKey(keyId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('revoke_api_key', { p_key_id: keyId })
  return { error: error?.message ?? null }
}

export async function fetchWebhookEndpoints(orgId: string): Promise<{ data: WebhookEndpoint[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  return { data: (data as WebhookEndpoint[] | null) ?? null, error: error?.message ?? null }
}

export async function createWebhookEndpoint(
  orgId: string,
  url: string,
  eventTypes: WebhookEventType[],
  createdBy: string,
): Promise<{ data: WebhookEndpoint | null; error: string | null }> {
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .insert({ org_id: orgId, url, event_types: eventTypes, created_by: createdBy })
    .select()
    .single()
  return { data: (data as WebhookEndpoint | null) ?? null, error: error?.message ?? null }
}

export async function setWebhookEndpointEnabled(endpointId: string, enabled: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.from('webhook_endpoints').update({ enabled }).eq('id', endpointId)
  return { error: error?.message ?? null }
}

export async function sendTestWebhook(endpointId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('send_test_webhook', { p_endpoint_id: endpointId })
  return { error: error?.message ?? null }
}

export async function listWebhookDeliveries(
  orgId: string,
  endpointId: string | null = null,
  limit = 50,
): Promise<{ data: WebhookDelivery[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_webhook_deliveries', {
    p_org_id: orgId,
    p_endpoint_id: endpointId,
    p_limit: limit,
  })
  return { data: (data as WebhookDelivery[] | null) ?? null, error: error?.message ?? null }
}
