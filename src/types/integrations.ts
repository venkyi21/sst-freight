// Week 18 (ADR-0029): public API keys + outbound webhooks.

export interface ApiKey {
  id: string
  label: string
  key_prefix: string
  created_by_email: string | null
  created_at: string
  revoked_at: string | null
  last_used_at: string | null
}

// Returned by create_api_key only — the one and only time the full plaintext key exists client-side.
export interface ApiKeyCreated {
  id: string
  label: string
  key_prefix: string
  api_key: string
}

export type WebhookEventType =
  | 'shipment.status_changed'
  | 'quote.sent'
  | 'quote.accepted'
  | 'quote.rejected'
  | 'invoice.created'
  | 'invoice.paid'
  | 'document.uploaded'

export const WEBHOOK_EVENT_TYPES: { value: WebhookEventType; label: string }[] = [
  { value: 'shipment.status_changed', label: 'Shipment status changed' },
  { value: 'quote.sent', label: 'Quote sent' },
  { value: 'quote.accepted', label: 'Quote accepted' },
  { value: 'quote.rejected', label: 'Quote rejected' },
  { value: 'invoice.created', label: 'Invoice created' },
  { value: 'invoice.paid', label: 'Invoice paid' },
  { value: 'document.uploaded', label: 'Document uploaded' },
]

export interface WebhookEndpoint {
  id: string
  org_id: string
  url: string
  secret: string
  event_types: WebhookEventType[]
  enabled: boolean
  created_by: string | null
  created_at: string
}

export type WebhookDeliveryStatus = 'pending' | 'delivered' | 'failed'

export interface WebhookDelivery {
  id: string
  endpoint_id: string
  event_type: string
  status: WebhookDeliveryStatus
  attempts: number
  last_status_code: number | null
  last_error: string | null
  next_attempt_at: string | null
  delivered_at: string | null
  created_at: string
}
