import { useRef, useState, type CSSProperties } from 'react'
import { useAuth } from '../context/AuthContext'
import { updateOrgBranding, updateOrgGstSettings, uploadOrgLogo } from '../api/org'
import { INDIAN_STATES, TENANT_COLORS, type OrganizationWithRole } from '../types'

interface OrgSettingsPageProps {
  org: OrganizationWithRole
}

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  display: 'block',
  marginBottom: 8,
}

const inputStyle: CSSProperties = {
  background: '#0b1220',
  border: '1px solid #1e293b',
  borderRadius: 7,
  padding: '9px 11px',
  fontSize: 13,
  color: '#e2e8f0',
}

export default function OrgSettingsPage({ org }: OrgSettingsPageProps) {
  const { refreshOrganizations } = useAuth()
  const canEdit = org.role === 'owner' || org.role === 'admin'
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [color, setColor] = useState(org.color)
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [gstState, setGstState] = useState(org.gst_state ?? '')
  const [gstBusy, setGstBusy] = useState(false)
  const [gstError, setGstError] = useState<string | null>(null)
  const [gstSuccess, setGstSuccess] = useState(false)

  const displayLogoUrl = previewUrl ?? org.logo_url

  function handleFileSelected(file: File) {
    setPendingLogoFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setSuccess(false)
  }

  async function handleSave() {
    setError(null)
    setSuccess(false)
    if (!HEX_PATTERN.test(color)) {
      setError('Color must be a 6-digit hex value, e.g. #2563eb')
      return
    }
    setBusy(true)

    let logoUrl = org.logo_url
    if (pendingLogoFile) {
      const { url, error: uploadError } = await uploadOrgLogo(org.id, pendingLogoFile)
      if (uploadError) {
        setError(uploadError)
        setBusy(false)
        return
      }
      logoUrl = url
    }

    const { error: rpcError } = await updateOrgBranding(org.id, color, logoUrl)
    if (rpcError) {
      setError(rpcError)
      setBusy(false)
      return
    }

    await refreshOrganizations()
    setPendingLogoFile(null)
    setSuccess(true)
    setBusy(false)
  }

  // Week 14 (ADR-0021): kept as its own RPC/save action, separate from branding above — tax
  // config and branding are unrelated concerns that happen to both live on `organizations`.
  async function handleSaveGst() {
    setGstError(null)
    setGstSuccess(false)
    setGstBusy(true)
    const { error: rpcError } = await updateOrgGstSettings(org.id, gstState || null)
    if (rpcError) {
      setGstError(rpcError)
      setGstBusy(false)
      return
    }
    await refreshOrganizations()
    setGstSuccess(true)
    setGstBusy(false)
  }

  return (
    <div style={{ padding: '28px 32px', flex: 1, maxWidth: 560 }}>
      <h1 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 6px', color: '#f1f5f9' }}>Organization Settings</h1>
      <div style={{ fontSize: 12.5, color: '#5b6b82', marginBottom: 24 }}>
        Logo and brand color shown throughout the app for {org.name}.
      </div>

      {!canEdit && (
        <div
          style={{
            marginBottom: 20,
            fontSize: 11.5,
            color: '#5b6b82',
            background: '#0b1220',
            border: '1px solid #1e293b',
            borderRadius: 8,
            padding: '9px 12px',
          }}
        >
          Only an Owner or Admin can edit these settings — you're viewing them as a {org.role}.
        </div>
      )}

      <div style={{ marginBottom: 22 }}>
        <label style={labelStyle}>Logo</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 12,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              background: displayLogoUrl ? '#0b1220' : color,
              border: '1px solid #1e293b',
              fontWeight: 700,
              fontSize: 24,
              color: '#fff',
            }}
          >
            {displayLogoUrl ? (
              <img src={displayLogoUrl} alt={`${org.name} logo`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              org.name.trim().charAt(0).toUpperCase() || '?'
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              disabled={!canEdit || busy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileSelected(file)
              }}
              style={{ fontSize: 11.5, color: '#94a3b8' }}
            />
            <div style={{ fontSize: 10.5, color: '#5b6b82', marginTop: 4 }}>PNG/JPG/SVG, up to 2MB.</div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 22 }}>
        <label style={labelStyle}>Brand Color</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {TENANT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={!canEdit || busy}
              onClick={() => setColor(c)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: color === c ? '2px solid #f1f5f9' : '1px solid #1e293b',
                background: c,
                cursor: canEdit ? 'pointer' : 'not-allowed',
              }}
            />
          ))}
        </div>
        <input
          type="text"
          value={color}
          disabled={!canEdit || busy}
          onChange={(e) => setColor(e.target.value)}
          placeholder="#2563eb"
          style={{ ...inputStyle, width: 140, opacity: canEdit ? 1 : 0.6, fontFamily: "'IBM Plex Mono', monospace" }}
        />
      </div>

      {error && (
        <div
          style={{
            marginBottom: 16,
            background: 'rgba(244,63,94,0.1)',
            border: '1px solid rgba(244,63,94,0.3)',
            color: '#fb7185',
            fontSize: 12.5,
            borderRadius: 8,
            padding: '9px 12px',
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div style={{ marginBottom: 16, fontSize: 12.5, color: '#4ade80', fontWeight: 600 }}>Branding updated.</div>
      )}

      {canEdit && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSave()}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            background: busy ? '#1e293b' : '#2563eb',
            color: '#fff',
            fontWeight: 600,
            fontSize: 13,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Saving…' : 'Save Branding'}
        </button>
      )}

      <div style={{ marginTop: 36, paddingTop: 24, borderTop: '1px solid #1e293b' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px', color: '#f1f5f9' }}>GST Settings</h2>
        <div style={{ fontSize: 12, color: '#5b6b82', marginBottom: 18 }}>
          Your business's home state, used to auto-compute CGST+SGST (same state as a client) vs. IGST (different
          state) on every invoice.
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>State</label>
          <select
            value={gstState}
            disabled={!canEdit || gstBusy}
            onChange={(e) => setGstState(e.target.value)}
            style={{ ...inputStyle, width: 260, opacity: canEdit ? 1 : 0.6 }}
          >
            <option value="">— Not set —</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {gstError && (
          <div
            style={{
              marginBottom: 16,
              background: 'rgba(244,63,94,0.1)',
              border: '1px solid rgba(244,63,94,0.3)',
              color: '#fb7185',
              fontSize: 12.5,
              borderRadius: 8,
              padding: '9px 12px',
            }}
          >
            {gstError}
          </div>
        )}
        {gstSuccess && (
          <div style={{ marginBottom: 16, fontSize: 12.5, color: '#4ade80', fontWeight: 600 }}>GST settings updated.</div>
        )}

        {canEdit && (
          <button
            type="button"
            disabled={gstBusy}
            onClick={() => void handleSaveGst()}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: gstBusy ? '#1e293b' : '#2563eb',
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: gstBusy ? 'not-allowed' : 'pointer',
            }}
          >
            {gstBusy ? 'Saving…' : 'Save GST Settings'}
          </button>
        )}
      </div>
    </div>
  )
}
