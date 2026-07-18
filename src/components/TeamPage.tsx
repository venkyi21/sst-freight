import { useEffect, useState, type CSSProperties } from 'react'
import { fetchOrgMembers, removeMember, updateMemberRole } from '../api/team'
import { ROLE_META, type MembershipRole, type OrgMember } from '../types'
import { T } from '../theme/tokens'

const headStyle: CSSProperties = {
  padding: '13px 20px',
  fontSize: 11,
  fontWeight: 600,
  color: T.muted,
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
    role === 'owner' ? T.warningWash : role === 'admin' ? T.accentWash : T.statusNeutralWash,
  color: role === 'owner' ? T.warning : role === 'admin' ? T.info : T.muted,
})

const actionButtonStyle: CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  border: `1px solid ${T.border}`,
  background: 'transparent',
  color: T.muted,
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
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: T.ink }}>Team</h1>
      </div>

      {actionError && (
        <div
          style={{
            marginBottom: 16,
            background: T.dangerWash,
            border: `1px solid ${T.dangerBorder}`,
            color: T.danger,
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
            background: T.dangerWash,
            border: `1px solid ${T.dangerBorder}`,
            borderRadius: 12,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div style={{ color: T.danger, fontSize: 13.5, marginBottom: 12 }}>Couldn't load team: {loadError}</div>
          <button
            type="button"
            onClick={() => setReloadToken((t) => t + 1)}
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
                <th style={headStyle}>Email</th>
                <th style={headStyle}>Role</th>
                <th style={headStyle}>Joined</th>
                {isAdminViewer && <th style={headStyle}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.membership_id} style={{ borderBottom: `1px solid ${T.surfaceRaised}` }}>
                  <td style={{ ...cellStyle, fontSize: 13, fontWeight: 600, color: T.ink }}>
                    {m.email}
                    {m.user_id === currentUserId && <span style={{ color: T.muted, fontWeight: 500 }}> (you)</span>}
                  </td>
                  <td style={cellStyle}>
                    <span style={chipStyle(m.role)}>{ROLE_META[m.role].label}</span>
                  </td>
                  <td style={{ ...cellStyle, fontSize: 12, color: T.faint }}>
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
                              style={{ ...actionButtonStyle, borderColor: T.dangerBorder, color: T.danger }}
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
            <div style={{ padding: 40, textAlign: 'center', color: T.placeholder, fontSize: 13 }}>No team members found.</div>
          )}
          {loading && <div style={{ padding: 40, textAlign: 'center', color: T.placeholder, fontSize: 13 }}>Loading team…</div>}
        </div>
      )}
    </div>
  )
}
