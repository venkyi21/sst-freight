import { useEffect, useState, type CSSProperties } from 'react'
import { listAllOrganizations, listAllPlatformRevenue, setOrgBillingModel, setOrgConfig } from '../api/platformAdmin'
import {
  BILLING_MODEL_META,
  PLATFORM_MODULE_META,
  PLATFORM_RAKE_META,
  type BillingModel,
  type PlatformModule,
  type PlatformOrgSummary,
  type PlatformRevenueEntry,
} from '../types'

const headStyle: CSSProperties = {
  padding: '13px 20px',
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const cellStyle: CSSProperties = { padding: '14px 20px' }

const modelChipStyle = (model: BillingModel): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 9px',
  borderRadius: 20,
  fontSize: 11,
  fontWeight: 600,
  background: BILLING_MODEL_META[model].background,
  color: BILLING_MODEL_META[model].color,
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

const tabButtonStyle = (active: boolean): CSSProperties => ({
  padding: '6px 13px',
  borderRadius: 6,
  border: 'none',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  background: active ? '#1e293b' : 'transparent',
  color: active ? '#f1f5f9' : '#8291a6',
})

const ALL_MODULES: PlatformModule[] = ['directory', 'quotes', 'accounting']

interface PlatformAdminPageProps {
  isPlatformAdmin: boolean
}

export default function PlatformAdminPage({ isPlatformAdmin }: PlatformAdminPageProps) {
  const [tab, setTab] = useState<'orgs' | 'revenue'>('orgs')
  const [orgs, setOrgs] = useState<PlatformOrgSummary[]>([])
  const [revenue, setRevenue] = useState<PlatformRevenueEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [confirmSwitchId, setConfirmSwitchId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFee, setEditFee] = useState('')
  const [editModules, setEditModules] = useState<PlatformModule[]>([])

  useEffect(() => {
    if (!isPlatformAdmin) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    const load = tab === 'orgs' ? listAllOrganizations() : listAllPlatformRevenue()

    load.then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setLoadError(error)
      } else if (data) {
        if (tab === 'orgs') setOrgs(data as PlatformOrgSummary[])
        else setRevenue(data as PlatformRevenueEntry[])
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [tab, reloadToken, isPlatformAdmin])

  if (!isPlatformAdmin) {
    return (
      <div style={{ padding: '28px 32px', flex: 1 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 18px', color: '#f1f5f9' }}>Platform Admin</h1>
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <div style={{ color: '#64748b', fontSize: 13.5 }}>Only platform administrators can view this page.</div>
        </div>
      </div>
    )
  }

  async function handleSwitchModel(org: PlatformOrgSummary) {
    const newModel: BillingModel = org.billing_model === 'model_1' ? 'model_2' : 'model_1'
    setBusyId(org.id)
    setActionError(null)
    const { error } = await setOrgBillingModel(org.id, newModel)
    if (error) {
      setActionError(error)
    } else {
      setReloadToken((t) => t + 1)
    }
    setBusyId(null)
    setConfirmSwitchId(null)
  }

  function startEditing(org: PlatformOrgSummary) {
    setEditingId(org.id)
    setEditFee(String(org.monthly_fee_inr))
    setEditModules(org.enabled_modules)
  }

  async function saveConfig(org: PlatformOrgSummary) {
    setBusyId(org.id)
    setActionError(null)
    const { error } = await setOrgConfig(org.id, Number(editFee) || 0, editModules)
    if (error) {
      setActionError(error)
    } else {
      setEditingId(null)
      setReloadToken((t) => t + 1)
    }
    setBusyId(null)
  }

  function toggleModule(module: PlatformModule) {
    setEditModules((prev) => (prev.includes(module) ? prev.filter((m) => m !== module) : [...prev, module]))
  }

  return (
    <div style={{ padding: '28px 32px', flex: 1 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 4px', color: '#f1f5f9' }}>Platform Admin</h1>
        <div style={{ fontSize: 12.5, color: '#64748b' }}>
          Cross-org billing model management and simulated platform revenue — visible only to platform admins.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 4, marginBottom: 16, width: 'fit-content' }}>
        <button type="button" onClick={() => setTab('orgs')} style={tabButtonStyle(tab === 'orgs')}>
          Organizations
        </button>
        <button type="button" onClick={() => setTab('revenue')} style={tabButtonStyle(tab === 'revenue')}>
          Platform Revenue (simulated)
        </button>
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
        <div style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <div style={{ color: '#fb7185', fontSize: 13.5, marginBottom: 12 }}>Couldn't load: {loadError}</div>
          <button type="button" onClick={() => setReloadToken((t) => t + 1)} style={actionButtonStyle}>
            Retry
          </button>
        </div>
      ) : tab === 'orgs' ? (
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', background: 'rgba(255,255,255,0.02)' }}>
                <th style={headStyle}>Organization</th>
                <th style={headStyle}>Billing Model</th>
                <th style={headStyle}>Monthly Fee (INR)</th>
                <th style={headStyle}>Enabled Modules</th>
                <th style={headStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} style={{ borderBottom: '1px solid #172033' }}>
                  <td style={{ ...cellStyle, fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{org.name}</td>
                  <td style={cellStyle}>
                    <span style={modelChipStyle(org.billing_model)}>{BILLING_MODEL_META[org.billing_model].label}</span>
                  </td>
                  <td style={cellStyle}>
                    {editingId === org.id ? (
                      <input
                        type="number"
                        value={editFee}
                        onChange={(e) => setEditFee(e.target.value)}
                        style={{ width: 90, background: '#0b1220', border: '1px solid #1e293b', borderRadius: 6, padding: '4px 8px', color: '#e2e8f0', fontSize: 12.5 }}
                      />
                    ) : (
                      <span style={{ fontSize: 12.5, color: '#94a3b8' }}>₹{org.monthly_fee_inr.toLocaleString('en-IN')}</span>
                    )}
                  </td>
                  <td style={cellStyle}>
                    {editingId === org.id ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {ALL_MODULES.map((m) => (
                          <label key={m} style={{ fontSize: 11.5, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" checked={editModules.includes(m)} onChange={() => toggleModule(m)} />
                            {PLATFORM_MODULE_META[m].label}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11.5, color: '#64748b' }}>
                        {org.billing_model === 'model_2' ? 'All (Model 2)' : org.enabled_modules.map((m) => PLATFORM_MODULE_META[m].label).join(', ') || 'None'}
                      </span>
                    )}
                  </td>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {editingId === org.id ? (
                        <>
                          <button type="button" disabled={busyId === org.id} onClick={() => void saveConfig(org)} style={actionButtonStyle}>
                            Save
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} style={actionButtonStyle}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => startEditing(org)} style={actionButtonStyle}>
                          Edit
                        </button>
                      )}
                      {confirmSwitchId === org.id ? (
                        <button
                          type="button"
                          disabled={busyId === org.id}
                          onClick={() => void handleSwitchModel(org)}
                          style={{ ...actionButtonStyle, borderColor: 'rgba(244,63,94,0.4)', color: '#fb7185' }}
                        >
                          Confirm switch?
                        </button>
                      ) : (
                        <button type="button" disabled={busyId === org.id} onClick={() => setConfirmSwitchId(org.id)} style={actionButtonStyle}>
                          Switch Model
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && orgs.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 13 }}>No organizations found.</div>}
          {loading && <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 13 }}>Loading organizations…</div>}
        </div>
      ) : (
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', background: 'rgba(255,255,255,0.02)' }}>
                <th style={headStyle}>Organization</th>
                <th style={headStyle}>Rake Type</th>
                <th style={headStyle}>Rate</th>
                <th style={headStyle}>Base (INR)</th>
                <th style={headStyle}>Rake (INR)</th>
                <th style={headStyle}>When</th>
              </tr>
            </thead>
            <tbody>
              {revenue.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #172033' }}>
                  <td style={{ ...cellStyle, fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{r.org_name}</td>
                  <td style={{ ...cellStyle, fontSize: 12.5, color: '#94a3b8' }}>{PLATFORM_RAKE_META[r.rake_type].label}</td>
                  <td style={{ ...cellStyle, fontSize: 12.5, color: '#94a3b8' }}>{r.rate_pct}%</td>
                  <td style={{ ...cellStyle, fontSize: 12.5, color: '#94a3b8' }}>₹{r.base_amount_inr.toLocaleString('en-IN')}</td>
                  <td style={{ ...cellStyle, fontSize: 12.5, color: '#4ade80', fontWeight: 600 }}>₹{r.rake_amount_inr.toLocaleString('en-IN')}</td>
                  <td style={{ ...cellStyle, fontSize: 12, color: '#5b6b82', whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && revenue.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 13 }}>No simulated revenue recorded yet.</div>}
          {loading && <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 13 }}>Loading revenue…</div>}
        </div>
      )}
    </div>
  )
}
