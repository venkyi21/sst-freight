import { useMemo, useState, type CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useReferrals, useWallet, walletQueryKey } from '../hooks/useReferrals'
import { applyWalletCredit } from '../api/referrals'
import { REFERRAL_TERMS, type OrganizationWithRole } from '../types'
import { T } from '../theme/tokens'

interface ReferralsPageProps {
  org: OrganizationWithRole
}

const panelStyle: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
}
const headStyle: CSSProperties = {
  padding: '11px 16px',
  fontSize: 11,
  fontWeight: 600,
  color: T.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  textAlign: 'left',
}
const cellStyle: CSSProperties = { padding: '12px 16px', fontSize: 13 }

function inr(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

const statusMeta: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: T.warning, bg: T.warningWash },
  released: { label: 'Released', color: T.success, bg: T.successWash },
  blocked: { label: 'Blocked', color: T.danger, bg: T.dangerWash },
}

export default function ReferralsPage({ org }: ReferralsPageProps) {
  const canManage = org.role === 'owner' || org.role === 'admin'
  const queryClient = useQueryClient()
  const { data: referrals = [], isLoading: refLoading } = useReferrals(org.id)
  const { data: wallet } = useWallet(org.id)
  const balance = wallet?.balance ?? 0
  const transactions = wallet?.transactions ?? []

  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const referralLink = useMemo(() => {
    const base = window.location.href.split('#')[0].split('?')[0]
    return org.referral_code ? `${base}?ref=${org.referral_code}` : ''
  }, [org.referral_code])

  const counts = useMemo(
    () => ({
      total: referrals.length,
      pending: referrals.filter((r) => r.status === 'pending').length,
      released: referrals.filter((r) => r.status === 'released').length,
    }),
    [referrals],
  )

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  }

  async function handleApplyCredit() {
    setError(null)
    setBusy(true)
    const { error: err } = await applyWalletCredit(org.id, balance)
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    void queryClient.invalidateQueries({ queryKey: walletQueryKey(org.id) })
  }

  return (
    <div style={{ padding: '28px 32px', flex: 1, maxWidth: 900 }}>
      <h1 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 6px', color: T.ink }}>Referrals &amp; Wallet</h1>
      <div style={{ fontSize: 12.5, color: T.faint, marginBottom: 22 }}>
        Refer another agency: they get <strong>+{REFERRAL_TERMS.refereeTrialBonusDays} days</strong> of trial, and you
        earn <strong>{REFERRAL_TERMS.rewardPct}%</strong> of their plan (capped at your own monthly bill) — released to
        your wallet once they complete {REFERRAL_TERMS.releaseAfterCycles} paid months.
      </div>

      {/* referral link */}
      <div style={panelStyle}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 10 }}>Your referral link</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            readOnly
            value={referralLink}
            onFocus={(e) => e.target.select()}
            style={{
              flex: 1,
              minWidth: 240,
              background: T.bg,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              padding: '9px 12px',
              fontSize: 13,
              color: T.text,
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          />
          <button
            type="button"
            onClick={() => void copyLink()}
            style={{
              background: T.accent,
              color: T.onAccent,
              border: 'none',
              fontWeight: 600,
              fontSize: 13,
              padding: '9px 18px',
              borderRadius: 8,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
        </div>
      </div>

      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Wallet balance', value: inr(balance), color: T.success },
          { label: 'Referred', value: String(counts.total), color: T.ink },
          { label: 'Pending', value: String(counts.pending), color: T.warning },
          { label: 'Released', value: String(counts.released), color: T.info },
        ].map((s) => (
          <div key={s.label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "'IBM Plex Mono', monospace" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ background: T.dangerWash, border: `1px solid ${T.dangerBorder}`, color: T.danger, fontSize: 12.5, borderRadius: 8, padding: '9px 12px', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* wallet ledger */}
      <div style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.muted }}>Wallet ledger</div>
          {canManage && balance > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleApplyCredit()}
              style={{ background: 'transparent', color: T.info, border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              {busy ? 'Applying…' : `Apply ${inr(balance)} to my bill`}
            </button>
          )}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.rowStripe }}>
              <th style={headStyle}>Date</th>
              <th style={headStyle}>Type</th>
              <th style={headStyle}>Reason</th>
              <th style={{ ...headStyle, textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} style={{ borderBottom: `1px solid ${T.surfaceRaised}` }}>
                <td style={{ ...cellStyle, color: T.faint }}>{new Date(t.created_at).toLocaleDateString()}</td>
                <td style={cellStyle}>
                  <span style={{ fontWeight: 600, color: t.type === 'credit' ? T.success : T.warning }}>
                    {t.type === 'credit' ? 'Credit' : 'Debit'}
                  </span>
                </td>
                <td style={{ ...cellStyle, color: T.muted }}>{t.reason.replace(/_/g, ' ')}</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: t.type === 'credit' ? T.success : T.text }}>
                  {t.type === 'credit' ? '+' : '−'}
                  {inr(t.amount_inr)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {transactions.length === 0 && (
          <div style={{ padding: 28, textAlign: 'center', color: T.placeholder, fontSize: 13 }}>
            No wallet activity yet — referral rewards land here once a referee completes {REFERRAL_TERMS.releaseAfterCycles} paid months.
          </div>
        )}
      </div>

      {/* referrals list */}
      <div style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, padding: '16px 16px 0' }}>Your referrals</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.rowStripe }}>
              <th style={headStyle}>Referred</th>
              <th style={headStyle}>Status</th>
              <th style={headStyle}>Cycles</th>
              <th style={{ ...headStyle, textAlign: 'right' }}>Reward</th>
            </tr>
          </thead>
          <tbody>
            {referrals.map((r) => {
              const meta = statusMeta[r.status] ?? statusMeta.pending
              return (
                <tr key={r.id} style={{ borderBottom: `1px solid ${T.surfaceRaised}` }}>
                  <td style={{ ...cellStyle, color: T.faint }}>Signed up {new Date(r.created_at).toLocaleDateString()}</td>
                  <td style={cellStyle}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: meta.color, background: meta.bg, padding: '3px 9px', borderRadius: 20 }}>● {meta.label}</span>
                  </td>
                  <td style={{ ...cellStyle, color: T.muted, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {r.paid_cycles}/{REFERRAL_TERMS.releaseAfterCycles}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: r.reward_amount_inr ? T.success : T.faint }}>
                    {r.reward_amount_inr ? inr(r.reward_amount_inr) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!refLoading && referrals.length === 0 && (
          <div style={{ padding: 28, textAlign: 'center', color: T.placeholder, fontSize: 13 }}>
            No referrals yet — share your link above to start earning.
          </div>
        )}
      </div>
    </div>
  )
}
