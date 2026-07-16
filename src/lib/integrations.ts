import { WEBHOOK_EVENT_TYPES, type WebhookDeliveryStatus } from '../types/integrations'

// Display helpers for the Integrations page (ADR-0029). Pure — the only key material that ever
// reaches the client after creation is the stored key_prefix; masking just appends an ellipsis.
export function maskApiKey(keyPrefix: string): string {
  return `${keyPrefix}…`
}

// Mirrors webhook_endpoints' DB check (url like 'https://%') plus a real-URL parse so the form
// catches typos before the insert round-trip. The DB constraint remains the actual enforcement.
export function isValidWebhookUrl(url: string): boolean {
  if (!url.startsWith('https://')) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname.length > 0
  } catch {
    return false
  }
}

export function eventTypeLabel(eventType: string): string {
  return WEBHOOK_EVENT_TYPES.find((e) => e.value === eventType)?.label ?? eventType
}

// Human summary of a delivery's retry state. The ladder itself (1m/5m/30m/2h, 5 attempts max)
// lives server-side in deliver_pending_webhooks(); this only narrates it.
export function retryScheduleLabel(status: WebhookDeliveryStatus, attempts: number): string {
  if (status === 'delivered') return 'delivered'
  if (status === 'failed') return `gave up after ${attempts} attempts`
  return attempts === 0 ? 'queued' : `retrying (attempt ${attempts} of 5)`
}
