import type { CSSProperties } from 'react'
import { useAuth } from '../context/AuthContext'
import type { NavPage, OrganizationWithRole } from '../types'

const navButtonStyle = (active: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '9px 11px',
  borderRadius: 8,
  border: 'none',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  background: active ? '#111e33' : 'transparent',
  color: active ? '#f1f5f9' : '#8291a6',
})

interface SidebarProps {
  org: OrganizationWithRole
  navPage: NavPage
  onNavigate: (page: NavPage) => void
  onSwitchOrg: () => void
  isPlatformAdmin: boolean
}

export default function Sidebar({ org, navPage, onNavigate, onSwitchOrg, isPlatformAdmin }: SidebarProps) {
  const { signOut } = useAuth()

  return (
    <aside
      style={{
        width: 250,
        flexShrink: 0,
        background: '#060a14',
        borderRight: '1px solid #1e293b',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 18,
      }}
    >
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 6px 18px 6px',
            borderBottom: '1px solid #1e293b',
            marginBottom: 18,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 15,
              color: '#fff',
              background: org.color,
            }}
          >
            {org.name.trim().charAt(0).toUpperCase() || '?'}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#f1f5f9',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {org.name}
            </div>
            <div style={{ fontSize: 10.5, color: '#22c55e', fontWeight: 500, textTransform: 'capitalize' }}>
              {org.role}
            </div>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button type="button" onClick={() => onNavigate('dashboard')} style={navButtonStyle(navPage === 'dashboard')}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: 'currentColor', opacity: 0.8 }} />
            Dashboard
          </button>
          <button type="button" onClick={() => onNavigate('directory')} style={navButtonStyle(navPage === 'directory')}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: 'currentColor', opacity: 0.8 }} />
            Directory
          </button>
          <button type="button" onClick={() => onNavigate('team')} style={navButtonStyle(navPage === 'team')}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: 'currentColor', opacity: 0.8 }} />
            Team
          </button>
          <button type="button" onClick={() => onNavigate('quotes')} style={navButtonStyle(navPage === 'quotes')}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: 'currentColor', opacity: 0.8 }} />
            Quotes
          </button>
          <button type="button" onClick={() => onNavigate('accounting')} style={navButtonStyle(navPage === 'accounting')}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: 'currentColor', opacity: 0.8 }} />
            Accounting
          </button>
          <button type="button" onClick={() => onNavigate('customs')} style={navButtonStyle(navPage === 'customs')}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: 'currentColor', opacity: 0.8 }} />
            Customs Filings
          </button>
          <button type="button" onClick={() => onNavigate('reporting')} style={navButtonStyle(navPage === 'reporting')}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: 'currentColor', opacity: 0.8 }} />
            Reporting
          </button>
          <button type="button" onClick={() => onNavigate('auditlog')} style={navButtonStyle(navPage === 'auditlog')}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: 'currentColor', opacity: 0.8 }} />
            Audit Log
          </button>
          {isPlatformAdmin && (
            <button type="button" onClick={() => onNavigate('platformadmin')} style={navButtonStyle(navPage === 'platformadmin')}>
              <span style={{ width: 6, height: 6, borderRadius: 2, background: 'currentColor', opacity: 0.8 }} />
              Platform Admin
            </button>
          )}
        </nav>
      </div>

      <div>
        <div
          style={{
            fontSize: 11,
            color: '#64748b',
            background: '#0b1220',
            border: '1px solid #1e293b',
            borderRadius: 8,
            padding: '8px 10px',
            marginBottom: 10,
          }}
        >
          Invite code
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: '#cbd5e1', marginTop: 2 }}>
            {org.invite_code}
          </div>
        </div>
        <button
          type="button"
          onClick={onSwitchOrg}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '9px 11px',
            borderRadius: 8,
            border: '1px solid #1e293b',
            background: 'transparent',
            color: '#94a3b8',
            fontSize: 12.5,
            fontWeight: 500,
            cursor: 'pointer',
            marginBottom: 8,
          }}
        >
          ⇄ Switch organization
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '9px 11px',
            borderRadius: 8,
            border: '1px solid #1e293b',
            background: 'transparent',
            color: '#94a3b8',
            fontSize: 12.5,
            fontWeight: 500,
            cursor: 'pointer',
            marginBottom: 10,
          }}
        >
          Sign out
        </button>
        <div style={{ fontSize: 10.5, color: '#3f4b5f', padding: '0 4px' }}>SST Freight · Week 1 MVP</div>
      </div>
    </aside>
  )
}
