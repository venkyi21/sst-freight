import { useEffect, useState, type CSSProperties } from 'react'
import { fetchOrgMembers, removeMember, updateMemberRole } from '../api/team'
import { ROLE_META, type MembershipRole, type OrgMember } from '../types'

const headStyle: CSSProperties = {
  padding: '13px 20px',
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const cellStyle: CSSProperties = { padding: '14px 20px' }

const chipStyle = (role: MembershipRole): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 9px',
  borderRadius: 20,
  fontSize: 11,
  fontWeight: 600,
  background:
    role === 'owner' ? 'rgba(180,83,9,0.14)' : role === 'admin' ? 'rgba(37,99,235,0.14)' : 'rgba(100,116,139,0.14)',
  color: role === 'owner' ? '#fbbf24' : role === 'admin' ? '#60a5fa' : '#94a3b8',
})

const actionButtonStyle: CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid #1e293b',
  background: 'transparent',
  color: '#94a3b8',
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
}

interface TeamPageProps {
  orgId: string
  currentRole: MembershipRole
  currentUserId: string
}

export default function TeamPage({ orgId, currentRole, currentUserId }: TeamPageProps) {
  const [members, setMembers] = useState<OrgMember[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  const isAdminViewer = currentRole === 'owner' || currentRole === 'admin'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    fetchOrgMembers(orgId).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setLoadError(error)
      } else if (data) {
        setMembers(data)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [orgId, reloadToken])

  function canManage(member: OrgMember): boolean {
    if (!isAdminViewer) return false
    if (member.user_id === currentUserId) return false
    if (member.role === 'owner' && currentRole !== 'owner') return false
    return true
  }

  async function handleRoleToggle(member: OrgMember) {
    const newRole: MembershipRole = member.role === 'admin' ? 'member' : 'admin'
    setBusyId(member.membership_id)
    setActionError(null)
    const { error } = await updateMemberRole(member.membership_id, newRole)
    if (error) {
      setActionError(error)
    } else {
      setReloadToken((t) => t + 1)
    }
    setBusyId(null)
  }

  async function handleRemove(member: OrgMember) {
    setBusyId(member.membership_id)
    setActionError(null)
    const { error } = await removeMember(member.membership_id)
    if (error) {
      setActionError(error)
    } else {
      setMembers((prev) => prev.filter((m) => m.membership_id !== member.membership_id))
    }
    setBusyId(null)
    setConfirmRemoveId(null)
  }

  return (
    <div style={{ padding: '28px 32px', flex: 1 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>Team</h1>
      </div>

      {actionError && (
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
          {actionError}
        </div>
      )}

      {loadError ? (
        <div
          style={{
            background: 'rgba(244,63,94,0.08)',
            border: '1px solid rgba(244,63,94,0.3)',
            borderRadius: 12,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ color: '#fb7185', fontSize: 13.5, marginBottom: 12 }}>Couldn't load team: {loadError}</div>
          <button
            type="button"
            onClick={() => setReloadToken((t) => t + 1)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #1e293b',
              background: 'transparent',
              color: '#e2e8f0',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', background: 'rgba(255,255,255,0.02)' }}>
                <th style={headStyle}>Email</th>
                <th style={headStyle}>Role</th>
                <th style={headStyle}>Joined</th>
                {isAdminViewer && <th style={headStyle}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.membership_id} style={{ borderBottom: '1px solid #172033' }}>
                  <td style={{ ...cellStyle, fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
                    {m.email}
                    {m.user_id === currentUserId && <span style={{ color: '#64748b', fontWeight: 500 }}> (you)</span>}
                  </td>
                  <td style={cellStyle}>
                    <span style={chipStyle(m.role)}>{ROLE_META[m.role].label}</span>
                  </td>
                  <td style={{ ...cellStyle, fontSize: 12, color: '#5b6b82' }}>
                    {new Date(m.created_at).toLocaleDateString()}
                  </td>
                  {isAdminViewer && (
                    <td style={cellStyle}>
                      {canManage(m) && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            disabled={busyId === m.membership_id}
                            onClick={() => void handleRoleToggle(m)}
                            style={actionButtonStyle}
                          >
                            {m.role === 'admin' ? 'Demote to Member' : 'Promote to Admin'}
                          </button>
                          {confirmRemoveId === m.membership_id ? (
                            <button
                              type="button"
                              disabled={busyId === m.membership_id}
                              onClick={() => void handleRemove(m)}
                              style={{ ...actionButtonStyle, borderColor: 'rgba(244,63,94,0.4)', color: '#fb7185' }}
                            >
                              Confirm remove?
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyId === m.membership_id}
                              onClick={() => setConfirmRemoveId(m.membership_id)}
                              style={actionButtonStyle}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && members.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 13 }}>No team members found.</div>
          )}
          {loading && <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 13 }}>Loading team…</div>}
        </div>
      )}
    </div>
  )
}
