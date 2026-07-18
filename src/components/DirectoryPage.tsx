import { useMemo, useState, type CSSProperties, type MouseEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { contactsQueryKey, useArchiveContact, useContacts } from '../hooks/useContacts'
import ContactModal from './ContactModal'
import ContactHistoryModal from './ContactHistoryModal'
import { CONTACT_KIND_META, VENDOR_TYPE_META, type Contact, type ContactKind } from '../types'
import { T } from '../theme/tokens'

type KindFilter = 'all' | ContactKind

const filterButtonStyle = (active: boolean): CSSProperties => ({
  padding: '6px 13px',
  borderRadius: 6,
  border: 'none',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  background: active ? T.surfaceInset : 'transparent',
  color: active ? T.ink : T.muted,
})

const headStyle: CSSProperties = {
  padding: '13px 20px',
  fontSize: 11,
  fontWeight: 600,
  color: T.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const cellStyle: CSSProperties = { padding: '14px 20px' }

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 9px',
  borderRadius: 20,
  fontSize: 11,
  fontWeight: 600,
  background: T.accentWash,
  color: T.info,
}

interface DirectoryPageProps {
  orgId: string
}

export default function DirectoryPage({ orgId }: DirectoryPageProps) {
  const queryClient = useQueryClient()
  const { data: contacts = [], isLoading: loading, error: loadErrorObj, refetch } = useContacts(orgId)
  const archiveMutation = useArchiveContact(orgId)
  const loadError = loadErrorObj instanceof Error ? loadErrorObj.message : null
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [search, setSearch] = useState('')
  const [modalContact, setModalContact] = useState<Contact | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [historyContact, setHistoryContact] = useState<Contact | null>(null)

  const kindCounts = useMemo(
    () => ({
      all: contacts.length,
      shipper: contacts.filter((c) => c.kind === 'shipper').length,
      consignee: contacts.filter((c) => c.kind === 'consignee').length,
      overseas_agent: contacts.filter((c) => c.kind === 'overseas_agent').length,
      vendor: contacts.filter((c) => c.kind === 'vendor').length,
    }),
    [contacts],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return contacts
      .filter((c) => showArchived || !c.archived)
      .filter((c) => kindFilter === 'all' || c.kind === kindFilter)
      .filter(
        (c) =>
          !q ||
          [c.name, c.email, c.phone, c.city, c.country]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q),
      )
  }, [contacts, kindFilter, search, showArchived])

  // Week 15 (ADR-0022): archive is a plain client update (archived boolean), same shape as
  // invoices' "mark paid/unpaid" — no RPC needed, contacts already has an update grant.
  async function handleArchiveToggle(e: MouseEvent, contact: Contact) {
    e.stopPropagation()
    setArchivingId(contact.id)
    await archiveMutation.mutateAsync(contact)
    setArchivingId(null)
  }

  function openAdd() {
    setModalContact(null)
    setModalOpen(true)
  }

  function openEdit(contact: Contact) {
    setModalContact(contact)
    setModalOpen(true)
  }

  function handleSaved(_contact: Contact) {
    void queryClient.invalidateQueries({ queryKey: contactsQueryKey(orgId) })
    setModalOpen(false)
  }

  return (
    <div style={{ padding: '28px 32px', flex: 1 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 18,
          flexWrap: 'wrap',
          gap: 14,
        }}
      >
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: T.ink }}>Client &amp; Vendor Directory</h1>
        <button
          type="button"
          onClick={openAdd}
          style={{
            background: T.accent,
            color: T.onAccent,
            border: 'none',
            fontWeight: 600,
            fontSize: 13,
            padding: '9px 16px',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          + Add Contact
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 14 }}>
        <div style={{ position: 'relative', width: 320, maxWidth: '40vw' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, city..."
            style={{
              width: '100%',
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              padding: '9px 12px',
              fontSize: 13,
              color: T.text,
            }}
          />
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 9, padding: 3, display: 'flex', gap: 2 }}>
          <button type="button" onClick={() => setKindFilter('all')} style={filterButtonStyle(kindFilter === 'all')}>
            All · {kindCounts.all}
          </button>
          <button type="button" onClick={() => setKindFilter('shipper')} style={filterButtonStyle(kindFilter === 'shipper')}>
            Shipper · {kindCounts.shipper}
          </button>
          <button type="button" onClick={() => setKindFilter('consignee')} style={filterButtonStyle(kindFilter === 'consignee')}>
            Consignee · {kindCounts.consignee}
          </button>
          <button type="button" onClick={() => setKindFilter('overseas_agent')} style={filterButtonStyle(kindFilter === 'overseas_agent')}>
            Agent · {kindCounts.overseas_agent}
          </button>
          <button type="button" onClick={() => setKindFilter('vendor')} style={filterButtonStyle(kindFilter === 'vendor')}>
            Vendor · {kindCounts.vendor}
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: T.muted, cursor: 'pointer' }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      {loadError ? (
        <div
          style={{
            background: T.dangerWash,
            border: `1px solid ${T.dangerBorder}`,
            borderRadius: 12,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ color: T.danger, fontSize: 13.5, marginBottom: 12 }}>Couldn't load contacts: {loadError}</div>
          <button
            type="button"
            onClick={() => void refetch()}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              background: 'transparent',
              color: T.text,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.rowStripe }}>
                <th style={headStyle}>Name</th>
                <th style={headStyle}>Kind</th>
                <th style={headStyle}>Email</th>
                <th style={headStyle}>Phone</th>
                <th style={headStyle}>Location</th>
                <th style={headStyle}>Added</th>
                <th style={headStyle}>History</th>
                <th style={headStyle}>Archive</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => openEdit(c)}
                  style={{ borderBottom: `1px solid ${T.surfaceRaised}`, cursor: 'pointer', opacity: c.archived ? 0.55 : 1 }}
                >
                  <td style={{ ...cellStyle, fontSize: 13, fontWeight: 600, color: T.ink }}>{c.name}</td>
                  <td style={cellStyle}>
                    <span style={chipStyle}>{CONTACT_KIND_META[c.kind].label}</span>
                    {c.kind === 'vendor' && c.vendor_type && (
                      <span style={{ ...chipStyle, marginLeft: 6, background: T.warningWash, color: T.warning }}>
                        {VENDOR_TYPE_META[c.vendor_type].label}
                      </span>
                    )}
                  </td>
                  <td style={{ ...cellStyle, fontSize: 13, color: T.muted }}>{c.email ?? '—'}</td>
                  <td style={{ ...cellStyle, fontSize: 13, color: T.muted }}>{c.phone ?? '—'}</td>
                  <td style={{ ...cellStyle, fontSize: 13, color: T.muted }}>
                    {[c.city, c.country].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td style={{ ...cellStyle, fontSize: 12, color: T.faint }}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td style={cellStyle}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setHistoryContact(c)
                      }}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: `1px solid ${T.border}`,
                        background: 'transparent',
                        color: T.info,
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      History
                    </button>
                  </td>
                  <td style={cellStyle}>
                    <button
                      type="button"
                      disabled={archivingId === c.id}
                      onClick={(e) => void handleArchiveToggle(e, c)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: `1px solid ${T.border}`,
                        background: 'transparent',
                        color: T.muted,
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {c.archived ? 'Unarchive' : 'Archive'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: T.placeholder, fontSize: 13 }}>
              No contacts match your search or filter.
            </div>
          )}
          {loading && <div style={{ padding: 40, textAlign: 'center', color: T.placeholder, fontSize: 13 }}>Loading contacts…</div>}
        </div>
      )}

      {modalOpen && (
        <ContactModal orgId={orgId} contact={modalContact} onClose={() => setModalOpen(false)} onSaved={handleSaved} />
      )}

      {historyContact && (
        <ContactHistoryModal orgId={orgId} contact={historyContact} onClose={() => setHistoryContact(null)} />
      )}
    </div>
  )
}
