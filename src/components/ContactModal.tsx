import { useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { createContact, updateContact } from '../api/contacts'
import FieldError from './FieldError'
import { CONTACT_KIND_META, INDIAN_STATES, VENDOR_TYPE_META, type Contact, type ContactKind, type VendorType } from '../types'

interface ContactModalProps {
  orgId: string
  contact: Contact | null
  onClose: () => void
  onSaved: (contact: Contact) => void
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: '#0b1220',
  border: '1px solid #1e293b',
  borderRadius: 7,
  padding: '9px 11px',
  fontSize: 13,
  color: '#e2e8f0',
}

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  display: 'block',
  marginBottom: 5,
}

const KINDS: ContactKind[] = ['shipper', 'consignee', 'overseas_agent', 'vendor']
const VENDOR_TYPES: VendorType[] = ['trucking_company', 'cfs_agent']

export default function ContactModal({ orgId, contact, onClose, onSaved }: ContactModalProps) {
  const { user } = useAuth()
  const [kind, setKind] = useState<ContactKind>(contact?.kind ?? 'shipper')
  const [vendorType, setVendorType] = useState<VendorType>(contact?.vendor_type ?? 'trucking_company')
  const [name, setName] = useState(contact?.name ?? '')
  const [email, setEmail] = useState(contact?.email ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [city, setCity] = useState(contact?.city ?? '')
  const [country, setCountry] = useState(contact?.country ?? '')
  const [state, setState] = useState(contact?.state ?? '')
  const [notes, setNotes] = useState(contact?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | undefined>(undefined)

  const valid = name.trim().length > 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!valid) {
      setNameError('Name is required')
      return
    }
    if (!user) return
    setNameError(undefined)
    setBusy(true)

    const payload = {
      org_id: orgId,
      kind,
      vendor_type: kind === 'vendor' ? vendorType : null,
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      city: city.trim() || null,
      country: country.trim() || null,
      state: state || null,
      notes: notes.trim() || null,
    }

    const { data, error: saveError } = contact ? await updateContact(contact.id, payload) : await createContact(payload, user.id)

    if (saveError || !data) {
      setError(saveError ?? 'Could not save contact')
      setBusy(false)
      return
    }

    onSaved(data)
    setBusy(false)
  }

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4,8,16,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '88vh',
          overflowY: 'auto',
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 14,
          padding: 26,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{contact ? 'Edit Contact' : 'Add Contact'}</div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: 20,
              cursor: busy ? 'not-allowed' : 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            background: '#0b1220',
            border: '1px solid #1e293b',
            borderRadius: 9,
            padding: 3,
            display: 'flex',
            gap: 2,
            marginBottom: 20,
          }}
        >
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k)
                setError(null)
              }}
              style={{
                flex: 1,
                padding: 8,
                borderRadius: 6,
                border: 'none',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                background: kind === k ? '#2563eb' : 'transparent',
                color: kind === k ? '#fff' : '#8291a6',
              }}
            >
              {CONTACT_KIND_META[k].label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {kind === 'vendor' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {VENDOR_TYPES.map((vt) => (
                <button
                  key={vt}
                  type="button"
                  onClick={() => setVendorType(vt)}
                  style={{
                    flex: 1,
                    padding: 8,
                    borderRadius: 7,
                    border: '1px solid #1e293b',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: vendorType === vt ? '#2563eb' : 'transparent',
                    color: vendorType === vt ? '#fff' : '#8291a6',
                  }}
                >
                  {VENDOR_TYPE_META[vt].label}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact / company name" style={inputStyle} />
              <FieldError message={nameError} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 9xxxxxxxxx" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>City</label>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Country</label>
              <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>State (for GST)</label>
              <select value={state} onChange={(e) => setState(e.target.value)} style={inputStyle}>
                <option value="">— Not set —</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Notes</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {error && (
            <div
              style={{
                marginTop: 4,
                marginBottom: 14,
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

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              style={{
                flex: 1,
                padding: 11,
                borderRadius: 8,
                border: '1px solid #1e293b',
                background: 'transparent',
                color: '#94a3b8',
                fontWeight: 600,
                fontSize: 13,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              style={{
                flex: 1,
                padding: 11,
                borderRadius: 8,
                border: 'none',
                background: !busy ? '#2563eb' : '#1e293b',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: !busy ? 'pointer' : 'not-allowed',
              }}
            >
              {busy ? 'Saving…' : contact ? 'Save Changes' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
