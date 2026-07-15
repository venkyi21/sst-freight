import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { supabaseConfigured } from './lib/supabaseClient'
import AuthScreen from './components/AuthScreen'
import OrgPicker from './components/OrgPicker'
import DashboardPage from './pages/DashboardPage'
import PublicTrackingPage from './components/PublicTrackingPage'
import PublicTCOCalculatorPage from './components/PublicTCOCalculatorPage'
import ErrorBoundary from './components/ErrorBoundary'

// One client for the app's lifetime. Query keys always include org id (see src/hooks/) so a
// switched org never serves another tenant's cached rows — see ADR-0025 and the cross-tenant
// cache verification in docs/qa-testing.md.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
})

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

  const params = new URLSearchParams(window.location.search)
  const trackingToken = params.get('track')
  if (trackingToken) return <PublicTrackingPage token={trackingToken} />
  if (params.has('tco')) return <PublicTCOCalculatorPage />

  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          {/* HashRouter, not BrowserRouter — this app is static GitHub Pages hosting with no
              server-side rewrite rule; a hash URL needs zero deploy configuration (ADR-0025,
              reinforces the same call ADR-0009 made for the public tracking link). Mounted only
              here, after the pre-router public-page checks above (ADR-0009 unchanged). */}
          <HashRouter>
            <AppShell />
          </HashRouter>
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
