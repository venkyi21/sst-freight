import { useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { TENANT_COLORS } from '../types'

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: 520,
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: 16,
  padding: 40,
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: '#0b1220',
  border: '1px solid #1e293b',
  borderRadius: 8,
  padding: '10px 12px',
  color: '#e2e8f0',
  fontSize: 13,
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

export default function OrgPicker() {
  const {
    organizations,
    orgsLoading,
    orgsError,
    refreshOrganizations,
    selectOrganization,
    createOrganization,
    joinOrganization,
    signOut,
    user,
  } = useAuth()
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [orgName, setOrgName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasOrgs = organizations.length > 0

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!orgName.trim()) {
      setError('Enter a name for your organization.')
      return
    }
    setBusy(true)
    setError(null)
    const color = TENANT_COLORS[Math.floor(Math.random() * TENANT_COLORS.length)]
    const { error: createError } = await createOrganization(orgName.trim(), color)
    if (createError) setError(createError)
    setBusy(false)
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault()
    if (!inviteCode.trim()) {
      setError('Enter an invite code.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: joinError } = await joinOrganization(inviteCode.trim())
    if (joinError) setError(joinError)
    setBusy(false)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        background: 'radial-gradient(circle at 20% 10%, #101b30 0%, #0b1220 55%)',
      }}
    >
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 17,
              color: '#fff',
            }}
          >
            S
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0.2 }}>SST Freight</div>
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 28 }}>Signed in as {user?.email}</div>

        {orgsLoading && <div style={{ fontSize: 13, color: '#64748b' }}>Loading your organizations…</div>}

        {!orgsLoading && orgsError && (
          <div style={{ marginBottom: 20 }}>
            <ErrorBox message={`Couldn't load your organizations: ${orgsError}`} />
            <button
              type="button"
              onClick={() => void refreshOrganizations()}
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 8,
                border: '1px solid #1e293b',
                background: 'transparent',
                color: '#94a3b8',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!orgsLoading && !orgsError && hasOrgs && (
          <>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 10,
              }}
            >
              Select your organization
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
              {organizations.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => selectOrganization(org.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: 12,
                    borderRadius: 10,
                    background: '#0b1220',
                    border: '1.5px solid #1e293b',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      fontWeight: 700,
                      fontSize: 13,
                      color: '#fff',
                      background: org.logo_url ? '#0b1220' : org.color,
                    }}
                  >
                    {org.logo_url ? (
                      <img src={org.logo_url} alt={`${org.name} logo`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      initialOf(org.name)
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#e2e8f0',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {org.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'capitalize' }}>{org.role}</div>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ borderTop: '1px solid #1e293b', paddingTop: 18, marginBottom: 4 }}>
              <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 10 }}>
                Need another organization?
              </div>
            </div>
          </>
        )}

        {!orgsLoading && !orgsError && !hasOrgs && (
          <div
            style={{
              fontSize: 13,
              color: '#94a3b8',
              marginBottom: 20,
              lineHeight: 1.5,
            }}
          >
            You're not part of an organization yet. Create one for your company, or join an existing team with an
            invite code.
          </div>
        )}

        {!orgsLoading && !orgsError && (
          <>
            <div
              style={{
                background: '#0b1220',
                border: '1px solid #1e293b',
                borderRadius: 9,
                padding: 3,
                display: 'flex',
                gap: 2,
                marginBottom: 18,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setTab('create')
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
                  background: tab === 'create' ? '#2563eb' : 'transparent',
                  color: tab === 'create' ? '#fff' : '#8291a6',
                }}
              >
                Create Organization
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('join')
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
                  background: tab === 'join' ? '#2563eb' : 'transparent',
                  color: tab === 'join' ? '#fff' : '#8291a6',
                }}
              >
                Join with Invite Code
              </button>
            </div>

            {tab === 'create' ? (
              <form onSubmit={handleCreate}>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. SST Freight Pvt Ltd"
                  style={{ ...inputStyle, marginBottom: 14 }}
                />
                {error && <ErrorBox message={error} />}
                <SubmitButton busy={busy} label="Create Organization" />
              </form>
            ) : (
              <form onSubmit={handleJoin}>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="e.g. 8FQ3ZK9C"
                  style={{ ...inputStyle, marginBottom: 14, fontFamily: "'IBM Plex Mono', monospace" }}
                />
                {error && <ErrorBox message={error} />}
                <SubmitButton busy={busy} label="Join Organization" />
              </form>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => void signOut()}
          style={{
            width: '100%',
            marginTop: 16,
            padding: 10,
            borderRadius: 8,
            border: '1px solid #1e293b',
            background: 'transparent',
            color: '#94a3b8',
            fontSize: 12.5,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      style={{
        background: 'rgba(244,63,94,0.1)',
        border: '1px solid rgba(244,63,94,0.3)',
        color: '#fb7185',
        fontSize: 12.5,
        borderRadius: 8,
        padding: '9px 12px',
        marginBottom: 14,
      }}
    >
      {message}
    </div>
  )
}

function SubmitButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      style={{
        width: '100%',
        padding: 12,
        borderRadius: 9,
        border: 'none',
        background: busy ? '#1e293b' : '#2563eb',
        color: '#fff',
        fontWeight: 600,
        fontSize: 14,
        cursor: busy ? 'not-allowed' : 'pointer',
      }}
    >
      {busy ? 'Please wait…' : label}
    </button>
  )
}
