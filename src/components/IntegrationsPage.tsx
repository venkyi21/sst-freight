import { useState, type CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { createApiKey, sendTestWebhook } from '../api/integrations'
import {
  apiKeysQueryKey,
  useApiKeys,
  useCreateWebhookEndpoint,
  useRevokeApiKey,
  useSetWebhookEndpointEnabled,
  useWebhookDeliveries,
  useWebhookEndpoints,
  webhookDeliveriesQueryKey,
} from '../hooks/useIntegrations'
import { eventTypeLabel, isValidWebhookUrl, maskApiKey, retryScheduleLabel } from '../lib/integrations'
import { WEBHOOK_EVENT_TYPES, type ApiKeyCreated, type OrganizationWithRole, type WebhookEndpoint, type WebhookEventType } from '../types'

interface IntegrationsPageProps {
  org: OrganizationWithRole
}

const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 8 }
const inputStyle: CSSProperties = {
  background: '#0b1220',
  border: '1px solid #1e293b',
  borderRadius: 7,
  padding: '9px 11px',
  fontSize: 13,
  color: '#e2e8f0',
}
const primaryBtn = (busy: boolean): CSSProperties => ({
  padding: '9px 16px',
  borderRadius: 8,
  border: 'none',
  background: busy ? '#1e293b' : '#2563eb',
  color: '#fff',
  fontWeight: 600,
  fontSize: 12.5,
  cursor: busy ? 'not-allowed' : 'pointer',
})
const subtleBtn: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 7,
  border: '1px solid #1e293b',
  background: 'transparent',
  color: '#8291a6',
  fontWeight: 600,
  fontSize: 11.5,
  cursor: 'pointer',
}
const errorBox: CSSProperties = {
  marginBottom: 14,
  background: 'rgba(244,63,94,0.1)',
  border: '1px solid rgba(244,63,94,0.3)',
  color: '#fb7185',
  fontSize: 12.5,
  borderRadius: 8,
  padding: '9px 12px',
}
const monoStyle: CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" }

const deliveryChipStyle = (status: string): CSSProperties => ({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 6,
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  background: status === 'delivered' ? 'rgba(34,197,94,0.12)' : status === 'failed' ? 'rgba(244,63,94,0.12)' : 'rgba(245,158,11,0.12)',
  color: status === 'delivered' ? '#4ade80' : status === 'failed' ? '#fb7185' : '#fbbf24',
})

function DeliveryHistory({ orgId, endpointId }: { orgId: string; endpointId: string }) {
  const { data: deliveries = [], isLoading, error: errObj, refetch } = useWebhookDeliveries(orgId, endpointId, true)
  const error = errObj instanceof Error ? errObj.message : null

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid #1e293b', paddingTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Delivery history</span>
        <button type="button" style={subtleBtn} onClick={() => void refetch()}>
          Refresh
        </button>
      </div>
      {error && <div style={errorBox}>{error}</div>}
      {isLoading && <div style={{ fontSize: 12, color: '#5b6b82' }}>Loading…</div>}
      {!isLoading && deliveries.length === 0 && (
        <div style={{ fontSize: 12, color: '#5b6b82' }}>No deliveries yet — trigger an event or send a test.</div>
      )}
      {deliveries.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#64748b', fontSize: 10.5 }}>
              <th style={{ padding: '4px 8px 4px 0' }}>Event</th>
              <th style={{ padding: '4px 8px' }}>Status</th>
              <th style={{ padding: '4px 8px' }}>Attempts</th>
              <th style={{ padding: '4px 8px' }}>Last result</th>
              <th style={{ padding: '4px 8px' }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d) => (
              <tr key={d.id} style={{ borderTop: '1px solid #14203a', color: '#cbd5e1' }}>
                <td style={{ padding: '6px 8px 6px 0', ...monoStyle, fontSize: 11.5 }}>{eventTypeLabel(d.event_type)}</td>
                <td style={{ padding: '6px 8px' }}>
                  <span style={deliveryChipStyle(d.status)}>{d.status}</span>
                </td>
                <td style={{ padding: '6px 8px' }}>{retryScheduleLabel(d.status, d.attempts)}</td>
                <td style={{ padding: '6px 8px', color: d.last_error ? '#fb7185' : '#5b6b82', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.last_status_code ?? ''} {d.last_error ?? (d.status === 'delivered' ? 'OK' : '')}
                </td>
                <td style={{ padding: '6px 8px', color: '#5b6b82' }}>{new Date(d.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function EndpointCard({ org, endpoint }: { org: OrganizationWithRole; endpoint: WebhookEndpoint }) {
  const queryClient = useQueryClient()
  const [secretShown, setSecretShown] = useState(false)
  const [historyShown, setHistoryShown] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [testError, setTestError] = useState<string | null>(null)
  const setEnabledMutation = useSetWebhookEndpointEnabled(org.id)

  async function handleSendTest() {
    setTestState('sending')
    setTestError(null)
    const { error } = await sendTestWebhook(endpoint.id)
    if (error) {
      setTestError(error)
      setTestState('error')
      return
    }
    setTestState('sent')
    void queryClient.invalidateQueries({ queryKey: webhookDeliveriesQueryKey(org.id, endpoint.id) })
  }

  return (
    <div style={{ border: '1px solid #1e293b', borderRadius: 10, padding: '14px 16px', marginBottom: 12, background: '#0b1220' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...monoStyle, fontSize: 12.5, color: '#e2e8f0', wordBreak: 'break-all' }}>{endpoint.url}</div>
          <div style={{ fontSize: 11, color: '#5b6b82', marginTop: 4 }}>
            {endpoint.event_types.map((e) => eventTypeLabel(e)).join(' · ')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: endpoint.enabled ? '#4ade80' : '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {endpoint.enabled ? 'Enabled' : 'Disabled'}
          </span>
          <button
            type="button"
            style={subtleBtn}
            disabled={setEnabledMutation.isPending}
            onClick={() => setEnabledMutation.mutate({ endpointId: endpoint.id, enabled: !endpoint.enabled })}
          >
            {endpoint.enabled ? 'Disable' : 'Enable'}
          </button>
          <button type="button" style={subtleBtn} disabled={testState === 'sending'} onClick={() => void handleSendTest()}>
            {testState === 'sending' ? 'Sending…' : 'Send test event'}
          </button>
        </div>
      </div>

      {testState === 'sent' && (
        <div style={{ fontSize: 11.5, color: '#4ade80', marginTop: 8 }}>
          Test queued — the delivery worker sends within a minute. Check the history below.
        </div>
      )}
      {testState === 'error' && testError && <div style={{ ...errorBox, marginTop: 8, marginBottom: 0 }}>{testError}</div>}

      <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
        <button type="button" style={{ ...subtleBtn, border: 'none', padding: 0 }} onClick={() => setSecretShown((s) => !s)}>
          {secretShown ? 'Hide signing secret' : 'Reveal signing secret'}
        </button>
        <button type="button" style={{ ...subtleBtn, border: 'none', padding: 0 }} onClick={() => setHistoryShown((s) => !s)}>
          {historyShown ? 'Hide delivery history' : 'Show delivery history'}
        </button>
      </div>
      {secretShown && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: '#cbd5e1' }}>
          <span style={{ ...monoStyle, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, padding: '4px 8px' }}>
            {endpoint.secret}
          </span>
          <div style={{ color: '#5b6b82', marginTop: 6 }}>
            Verify each delivery: the X-SST-Signature header is “sha256=” + HMAC-SHA256(raw body, this secret), hex-encoded.
          </div>
        </div>
      )}
      {historyShown && <DeliveryHistory orgId={org.id} endpointId={endpoint.id} />}
    </div>
  )
}

export default function IntegrationsPage({ org }: IntegrationsPageProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const canManage = org.role === 'owner' || org.role === 'admin'

  const [keyLabel, setKeyLabel] = useState('')
  const [keyBusy, setKeyBusy] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null)
  const [copied, setCopied] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const [epUrl, setEpUrl] = useState('')
  const [epEvents, setEpEvents] = useState<WebhookEventType[]>(WEBHOOK_EVENT_TYPES.map((e) => e.value))
  const [epError, setEpError] = useState<string | null>(null)

  const { data: apiKeys = [], error: keysErrObj } = useApiKeys(org.id)
  const keysError = keysErrObj instanceof Error ? keysErrObj.message : null
  const revokeMutation = useRevokeApiKey(org.id)
  const { data: endpoints = [], error: epsErrObj } = useWebhookEndpoints(org.id)
  const endpointsError = epsErrObj instanceof Error ? epsErrObj.message : null
  const createEndpointMutation = useCreateWebhookEndpoint(org.id)

  // Server-side the RPCs/RLS reject Members regardless; this early return just gives direct
  // hash-navigation a clear explanation instead of a page of permission errors.
  if (!canManage) {
    return (
      <div style={{ padding: '28px 32px', flex: 1, maxWidth: 640 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 6px', color: '#f1f5f9' }}>Integrations</h1>
        <div
          style={{
            marginTop: 14,
            fontSize: 12.5,
            color: '#5b6b82',
            background: '#0b1220',
            border: '1px solid #1e293b',
            borderRadius: 8,
            padding: '12px 14px',
          }}
        >
          Only an Owner or Admin can manage API keys and webhooks — you're signed in as a {org.role}.
        </div>
      </div>
    )
  }

  async function handleCreateKey() {
    setKeyError(null)
    if (!keyLabel.trim()) {
      setKeyError('Give the key a label first — e.g. the name of the system that will use it.')
      return
    }
    setKeyBusy(true)
    const { data, error } = await createApiKey(org.id, keyLabel.trim())
    setKeyBusy(false)
    if (error || !data) {
      setKeyError(error ?? 'Key creation failed')
      return
    }
    setCreatedKey(data)
    setCopied(false)
    setKeyLabel('')
    void queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(org.id) })
  }

  async function handleCopyKey() {
    if (!createdKey) return
    await navigator.clipboard.writeText(createdKey.api_key)
    setCopied(true)
  }

  function toggleEvent(value: WebhookEventType) {
    setEpEvents((prev) => (prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value]))
  }

  function handleCreateEndpoint() {
    setEpError(null)
    if (!isValidWebhookUrl(epUrl.trim())) {
      setEpError('Enter a full https:// URL — plain http is not accepted.')
      return
    }
    if (epEvents.length === 0) {
      setEpError('Pick at least one event type to subscribe to.')
      return
    }
    if (!user) return
    createEndpointMutation.mutate(
      { url: epUrl.trim(), eventTypes: epEvents, createdBy: user.id },
      {
        onSuccess: ({ error }) => {
          if (error) {
            setEpError(error)
            return
          }
          setEpUrl('')
        },
      },
    )
  }

  return (
    <div style={{ padding: '28px 32px', flex: 1, maxWidth: 760 }}>
      <h1 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 6px', color: '#f1f5f9' }}>Integrations</h1>
      <div style={{ fontSize: 12.5, color: '#5b6b82', marginBottom: 24 }}>
        Connect {org.name}'s own systems: API keys for reading data, webhooks for receiving events.
      </div>

      {/* ── API keys ─────────────────────────────────────── */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px', color: '#f1f5f9' }}>API Keys</h2>
      <div style={{ fontSize: 12, color: '#5b6b82', marginBottom: 14 }}>
        A key grants read-only access to this organization's shipments, quotes and invoices via the REST API.
      </div>

      {keysError && <div style={errorBox}>{keysError}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          type="text"
          value={keyLabel}
          disabled={keyBusy}
          onChange={(e) => setKeyLabel(e.target.value)}
          placeholder="Label — e.g. Tally integration"
          style={{ ...inputStyle, width: 260 }}
        />
        <button type="button" disabled={keyBusy} onClick={() => void handleCreateKey()} style={primaryBtn(keyBusy)}>
          {keyBusy ? 'Creating…' : 'Create API Key'}
        </button>
      </div>
      {keyError && <div style={errorBox}>{keyError}</div>}

      {createdKey && (
        <div
          style={{
            marginBottom: 16,
            border: '1px solid rgba(34,197,94,0.35)',
            background: 'rgba(34,197,94,0.07)',
            borderRadius: 10,
            padding: '12px 14px',
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#4ade80', marginBottom: 6 }}>
            “{createdKey.label}” created — copy the key now. You will not see it again.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ ...monoStyle, fontSize: 12, color: '#e2e8f0', background: '#0b1220', border: '1px solid #1e293b', borderRadius: 6, padding: '6px 10px', wordBreak: 'break-all' }}>
              {createdKey.api_key}
            </code>
            <button type="button" style={subtleBtn} onClick={() => void handleCopyKey()}>
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button type="button" style={{ ...subtleBtn, border: 'none' }} onClick={() => setCreatedKey(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {apiKeys.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginBottom: 8 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#64748b', fontSize: 10.5 }}>
              <th style={{ padding: '6px 8px 6px 0' }}>Label</th>
              <th style={{ padding: '6px 8px' }}>Key</th>
              <th style={{ padding: '6px 8px' }}>Created</th>
              <th style={{ padding: '6px 8px' }}>Last used</th>
              <th style={{ padding: '6px 8px' }} />
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((k) => (
              <tr key={k.id} style={{ borderTop: '1px solid #14203a', color: '#cbd5e1' }}>
                <td style={{ padding: '8px 8px 8px 0' }}>{k.label}</td>
                <td style={{ padding: '8px 8px', ...monoStyle, fontSize: 11.5 }}>{maskApiKey(k.key_prefix)}</td>
                <td style={{ padding: '8px 8px', color: '#5b6b82' }}>{new Date(k.created_at).toLocaleDateString()}</td>
                <td style={{ padding: '8px 8px', color: '#5b6b82' }}>
                  {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'never'}
                </td>
                <td style={{ padding: '8px 0', textAlign: 'right' }}>
                  {k.revoked_at ? (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fb7185', textTransform: 'uppercase' }}>Revoked</span>
                  ) : revokingId === k.id ? (
                    <span style={{ fontSize: 11.5 }}>
                      Revoke “{k.label}”?{' '}
                      <button
                        type="button"
                        style={{ ...subtleBtn, color: '#fb7185', borderColor: 'rgba(244,63,94,0.4)' }}
                        onClick={() => {
                          revokeMutation.mutate(k.id)
                          setRevokingId(null)
                        }}
                      >
                        Yes, revoke
                      </button>{' '}
                      <button type="button" style={{ ...subtleBtn, border: 'none' }} onClick={() => setRevokingId(null)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" style={subtleBtn} onClick={() => setRevokingId(k.id)}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {apiKeys.length === 0 && !keysError && (
        <div style={{ fontSize: 12, color: '#5b6b82', marginBottom: 8 }}>No API keys yet.</div>
      )}

      {/* ── Webhooks ─────────────────────────────────────── */}
      <div style={{ marginTop: 34, paddingTop: 24, borderTop: '1px solid #1e293b' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px', color: '#f1f5f9' }}>Webhooks</h2>
        <div style={{ fontSize: 12, color: '#5b6b82', marginBottom: 16 }}>
          SST Freight POSTs signed JSON events to your endpoint as they happen — retried automatically for up to five
          attempts if your system is down.
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Endpoint URL</label>
          <input
            type="text"
            value={epUrl}
            onChange={(e) => setEpUrl(e.target.value)}
            placeholder="https://your-system.example.com/webhooks/sst"
            style={{ ...inputStyle, width: '100%', maxWidth: 460 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Events</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
            {WEBHOOK_EVENT_TYPES.map((e) => (
              <label key={e.value} style={{ fontSize: 12, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={epEvents.includes(e.value)} onChange={() => toggleEvent(e.value)} />
                {e.label}
              </label>
            ))}
          </div>
        </div>
        {epError && <div style={errorBox}>{epError}</div>}
        <button
          type="button"
          disabled={createEndpointMutation.isPending}
          onClick={handleCreateEndpoint}
          style={{ ...primaryBtn(createEndpointMutation.isPending), marginBottom: 20 }}
        >
          {createEndpointMutation.isPending ? 'Adding…' : 'Add Webhook Endpoint'}
        </button>

        {endpointsError && <div style={errorBox}>{endpointsError}</div>}
        {endpoints.map((ep) => (
          <EndpointCard key={ep.id} org={org} endpoint={ep} />
        ))}
        {endpoints.length === 0 && !endpointsError && (
          <div style={{ fontSize: 12, color: '#5b6b82' }}>No webhook endpoints yet.</div>
        )}
      </div>
    </div>
  )
}
