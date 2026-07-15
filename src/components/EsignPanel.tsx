import { useEffect, useState, type CSSProperties } from 'react'
import { fetchLatestEsignRequest, refreshEsignStatus, sendEsignEnvelope } from '../api/esign'
import { ESIGN_STATUS_META, type EsignDocumentType, type EsignRequest } from '../types'

interface EsignPanelProps {
  orgId: string
  documentType: EsignDocumentType
  documentRef: string
  documentLabel: string
  quoteId?: string
  shipmentId?: string
  defaultRecipientName?: string
  defaultRecipientEmail?: string
  buildHtml: () => string | Promise<string>
}

const inputStyle: CSSProperties = {
  background: '#0b1220',
  border: '1px solid #1e293b',
  borderRadius: 6,
  padding: '7px 9px',
  fontSize: 12,
  color: '#e2e8f0',
}

const buttonStyle: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid #1e293b',
  background: 'transparent',
  color: '#94a3b8',
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
}

export default function EsignPanel({
  orgId,
  documentType,
  documentRef,
  documentLabel,
  quoteId,
  shipmentId,
  defaultRecipientName,
  defaultRecipientEmail,
  buildHtml,
}: EsignPanelProps) {
  const [request, setRequest] = useState<EsignRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState(defaultRecipientName ?? '')
  const [email, setEmail] = useState(defaultRecipientEmail ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchLatestEsignRequest(orgId, documentType, quoteId, shipmentId).then((data) => {
      if (cancelled) return
      setRequest(data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [orgId, documentType, quoteId, shipmentId])

  async function handleSend() {
    if (!name.trim() || !email.trim()) {
      setError('Enter the recipient name and email')
      return
    }
    setBusy(true)
    setError(null)
    const html = await buildHtml()
    const { data, error } = await sendEsignEnvelope({
      documentType,
      orgId,
      quoteId,
      shipmentId,
      documentRef,
      documentLabel,
      html,
      recipientName: name.trim(),
      recipientEmail: email.trim(),
    })
    if (error || !data) {
      setError(error ?? 'Could not send for signature')
      setBusy(false)
      return
    }
    setRequest(data)
    setBusy(false)
  }

  async function handleRefreshStatus() {
    if (!request) return
    setBusy(true)
    setError(null)
    const { data, error } = await refreshEsignStatus(request.id)
    if (error || !data) {
      setError(error ?? 'Could not refresh status')
      setBusy(false)
      return
    }
    setRequest(data)
    setBusy(false)
  }

  if (loading) return <div style={{ fontSize: 11.5, color: '#5b6b82' }}>Loading e-signature status…</div>

  return (
    <div>
      {request && (request.status === 'sent' || request.status === 'delivered' || request.status === 'completed') ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 9px',
              borderRadius: 20,
              color: ESIGN_STATUS_META[request.status].color,
              background: ESIGN_STATUS_META[request.status].background,
            }}
          >
            {ESIGN_STATUS_META[request.status].label}
          </span>
          <span style={{ fontSize: 11.5, color: '#5b6b82' }}>
            {request.recipient_name} ({request.recipient_email})
          </span>
          {request.status !== 'completed' && (
            <button type="button" disabled={busy} onClick={() => void handleRefreshStatus()} style={buttonStyle}>
              {busy ? 'Refreshing…' : 'Refresh Status'}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipient name" style={{ ...inputStyle, width: 150 }} />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Recipient email"
            style={{ ...inputStyle, width: 190 }}
          />
          <button type="button" disabled={busy} onClick={() => void handleSend()} style={buttonStyle}>
            {busy ? 'Sending…' : 'Send for Signature'}
          </button>
        </div>
      )}
      {request && (request.status === 'declined' || request.status === 'voided') && (
        <div style={{ fontSize: 11, color: '#fb7185', marginTop: 6 }}>
          Previous request was {ESIGN_STATUS_META[request.status].label.toLowerCase()} — sending again starts a new envelope.
        </div>
      )}
      {error && <div style={{ fontSize: 11.5, color: '#fb7185', marginTop: 6 }}>{error}</div>}
    </div>
  )
}
