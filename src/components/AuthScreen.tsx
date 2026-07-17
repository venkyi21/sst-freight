import { useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { BRAND } from '../theme/brand'
import { T } from '../theme/tokens'

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: 440,
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 16,
  padding: 40,
  boxShadow: T.shadowModal,
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: T.bg,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: '10px 12px',
  color: T.text,
  fontSize: 13,
}

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: T.muted,
  display: 'block',
  marginBottom: 5,
}

export default function AuthScreen() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmationSent, setConfirmationSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setConfirmationSent(false)
    if (!email.trim() || password.length < 6) {
      setError('Enter a valid email and a password of at least 6 characters.')
      return
    }
    setBusy(true)
    if (mode === 'sign-in') {
      const { error: signInError } = await signIn(email.trim(), password)
      if (signInError) setError(signInError)
    } else {
      const { error: signUpError, needsEmailConfirmation } = await signUp(email.trim(), password)
      if (signUpError) {
        setError(signUpError)
      } else if (needsEmailConfirmation) {
        setConfirmationSent(true)
      }
    }
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
        // Deliberate literal gradient (ADR-0031): subtle light wash behind the auth card.
        background: 'radial-gradient(circle at 20% 10%, #eef0f7 0%, #ffffff 55%)',
      }}
    >
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: BRAND.markBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 17,
              color: BRAND.markFg,
            }}
          >
            S
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0.2, color: BRAND.wordmark }}>SST Freight</div>
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 28 }}>
          Multi-tenant Customs Clearing &amp; Forwarding Platform
        </div>

        <div
          style={{
            background: T.bg,
            border: `1px solid ${T.border}`,
            borderRadius: 9,
            padding: 3,
            display: 'flex',
            gap: 2,
            marginBottom: 22,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode('sign-in')
              setError(null)
              setConfirmationSent(false)
            }}
            style={{
              flex: 1,
              padding: 8,
              borderRadius: 6,
              border: 'none',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              background: mode === 'sign-in' ? T.accent : 'transparent',
              color: mode === 'sign-in' ? T.onAccent : T.muted,
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('sign-up')
              setError(null)
              setConfirmationSent(false)
            }}
            style={{
              flex: 1,
              padding: 8,
              borderRadius: 6,
              border: 'none',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              background: mode === 'sign-up' ? T.accent : 'transparent',
              color: mode === 'sign-up' ? T.onAccent : T.muted,
            }}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={inputStyle}
              autoComplete="email"
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              style={inputStyle}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && (
            <div
              style={{
                background: T.dangerWash,
                border: `1px solid ${T.dangerBorder}`,
                color: T.danger,
                fontSize: 12.5,
                borderRadius: 8,
                padding: '9px 12px',
                marginBottom: 14,
              }}
            >
              {error}
            </div>
          )}

          {confirmationSent && (
            <div
              style={{
                background: T.successWash,
                border: `1px solid ${T.successBorder}`,
                color: T.success,
                fontSize: 12.5,
                borderRadius: 8,
                padding: '9px 12px',
                marginBottom: 14,
              }}
            >
              Account created — check your email to confirm it, then sign in.
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: '100%',
              padding: 12,
              borderRadius: 9,
              border: 'none',
              background: busy ? T.surfaceInset : T.accent,
              color: T.onAccent,
              fontWeight: 600,
              fontSize: 14,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: 11, color: BRAND.wordmark, opacity: 0.55, marginTop: 20 }}>
          SST Freight · Week 1 MVP
        </div>
      </div>
    </div>
  )
}
