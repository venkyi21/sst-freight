import { AuthProvider, useAuth } from './context/AuthContext'
import { supabaseConfigured } from './lib/supabaseClient'
import AuthScreen from './components/AuthScreen'
import OrgPicker from './components/OrgPicker'
import DashboardPage from './pages/DashboardPage'

function ConfigWarning() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b1220',
        color: '#e2e8f0',
        padding: 32,
      }}
    >
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Supabase isn't configured</div>
        <div style={{ fontSize: 13.5, color: '#94a3b8', lineHeight: 1.6 }}>
          Copy <code>.env.example</code> to <code>.env.local</code>, fill in your Supabase project URL and anon key,
          then restart the dev server (or rebuild). See <code>README.md</code> for the full setup steps.
        </div>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b1220',
        color: '#64748b',
        fontSize: 13,
      }}
    >
      Loading…
    </div>
  )
}

function AppShell() {
  const { authLoading, user, currentOrg } = useAuth()

  if (authLoading) return <LoadingScreen />
  if (!user) return <AuthScreen />
  if (!currentOrg) return <OrgPicker />
  return <DashboardPage />
}

export default function App() {
  if (!supabaseConfigured) return <ConfigWarning />

  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
