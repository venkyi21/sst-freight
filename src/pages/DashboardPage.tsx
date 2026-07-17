import { useMemo, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { shipmentsQueryKey, useShipments } from '../hooks/useShipments'
import Sidebar from '../components/Sidebar'
import ShipmentsTable from '../components/ShipmentsTable'
import BookingModal from '../components/BookingModal'
import DirectoryPage from '../components/DirectoryPage'
import TeamPage from '../components/TeamPage'
import ShipmentDetailModal from '../components/ShipmentDetailModal'
import RatesQuotesPage from '../components/RatesQuotesPage'
import AccountingPage from '../components/AccountingPage'
import AuditLogPage from '../components/AuditLogPage'
import PlatformAdminPage from '../components/PlatformAdminPage'
import CustomsFilingsPage from '../components/CustomsFilingsPage'
import ReportingPage from '../components/ReportingPage'
import OrgSettingsPage from '../components/OrgSettingsPage'
import IntegrationsPage from '../components/IntegrationsPage'
import PlaceholderPage from '../components/PlaceholderPage'
import OnboardingChecklist from '../components/OnboardingChecklist'
import type { NavPage, OrganizationWithRole, PlatformModule, Shipment, ShipmentMode } from '../types'
import { T } from '../theme/tokens'

function isModuleEnabled(org: OrganizationWithRole, module: PlatformModule): boolean {
  return org.billing_model === 'model_2' || org.enabled_modules.includes(module)
}

type ModeFilter = 'all' | ShipmentMode

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

const NAV_PAGES: NavPage[] = ['dashboard', 'directory', 'team', 'quotes', 'accounting', 'customs', 'reporting', 'integrations', 'settings', 'auditlog', 'platformadmin']

function navPageFromPath(pathname: string): NavPage {
  const segment = pathname.split('/')[1]
  return (NAV_PAGES as string[]).includes(segment) ? (segment as NavPage) : 'dashboard'
}

function shipmentIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/shipments\/([^/]+)$/)
  return match ? match[1] : null
}

export default function DashboardPage() {
  const { currentOrg, clearSelectedOrganization, user, isPlatformAdmin } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  // The sidebar/modal render logic below is unchanged from the pre-router version — only how
  // navPage/selectedShipment are *derived* changed (from the URL, not local state), so
  // Sidebar.tsx needed no changes at all (ADR-0025).
  const navPage = navPageFromPath(location.pathname)
  function setNavPage(page: NavPage) {
    navigate(`/${page}`)
  }
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [search, setSearch] = useState('')
  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingDefaultMode, setBookingDefaultMode] = useState<ShipmentMode>('ocean')

  const orgId = currentOrg?.id ?? null
  const queryClient = useQueryClient()
  const { data: shipments = [], isLoading: loading, error: loadErrorObj, refetch } = useShipments(orgId)
  const loadError = loadErrorObj instanceof Error ? loadErrorObj.message : null
  const selectedShipmentId = shipmentIdFromPath(location.pathname)
  const selectedShipment = selectedShipmentId ? shipments.find((s) => s.id === selectedShipmentId) ?? null : null

  const modeCounts = useMemo(
    () => ({
      all: shipments.length,
      ocean: shipments.filter((s) => s.mode === 'ocean').length,
      air: shipments.filter((s) => s.mode === 'air').length,
      truck: shipments.filter((s) => s.mode === 'truck').length,
    }),
    [shipments],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return shipments
      .filter((s) => modeFilter === 'all' || s.mode === modeFilter)
      .filter((s) => !q || [s.ref, s.client, s.origin, s.destination].join(' ').toLowerCase().includes(q))
  }, [shipments, modeFilter, search])

  if (!currentOrg) return null

  function openBooking(mode: ShipmentMode) {
    setBookingDefaultMode(mode)
    setBookingOpen(true)
  }

  function handleCreated(_shipment: Shipment) {
    if (orgId) void queryClient.invalidateQueries({ queryKey: shipmentsQueryKey(orgId) })
    setBookingOpen(false)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%' }}>
      <Sidebar
        org={currentOrg}
        navPage={navPage}
        onNavigate={setNavPage}
        onSwitchOrg={clearSelectedOrganization}
        isPlatformAdmin={isPlatformAdmin}
      />

      <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            height: 64,
            flexShrink: 0,
            borderBottom: `1px solid ${T.border}`,
            background: T.surfaceSidebar,
            padding: '0 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ position: 'relative', width: 380, maxWidth: '40vw' }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tracking ref, client, origin, destination..."
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: T.success,
                background: T.surface,
                border: `1px solid ${T.border}`,
                padding: '5px 10px',
                borderRadius: 20,
              }}
            >
              ● Week 1 · Live Alpha
            </span>
            <button
              type="button"
              onClick={() => openBooking('ocean')}
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
              + New Booking
            </button>
          </div>
        </header>

        {navPage === 'dashboard' && (
          <div style={{ padding: '28px 32px', flex: 1 }}>
            {user && <OnboardingChecklist orgId={currentOrg.id} userId={user.id} onNavigate={setNavPage} />}
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
              <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: T.ink }}>Active Shipments</h1>
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 9, padding: 3, display: 'flex', gap: 2 }}>
                <button type="button" onClick={() => setModeFilter('all')} style={filterButtonStyle(modeFilter === 'all')}>
                  All · {modeCounts.all}
                </button>
                <button type="button" onClick={() => setModeFilter('ocean')} style={filterButtonStyle(modeFilter === 'ocean')}>
                  Ocean · {modeCounts.ocean}
                </button>
                <button type="button" onClick={() => setModeFilter('air')} style={filterButtonStyle(modeFilter === 'air')}>
                  Air · {modeCounts.air}
                </button>
                <button type="button" onClick={() => setModeFilter('truck')} style={filterButtonStyle(modeFilter === 'truck')}>
                  Truck · {modeCounts.truck}
                </button>
              </div>
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
                <div style={{ color: T.danger, fontSize: 13.5, marginBottom: 12 }}>
                  Couldn't load shipments: {loadError}
                </div>
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
              <ShipmentsTable shipments={filtered} loading={loading} onRowClick={(s) => navigate(`/shipments/${s.id}`)} />
            )}
          </div>
        )}

        {navPage === 'directory' && <DirectoryPage orgId={currentOrg.id} />}

        {navPage === 'team' && user && (
          <TeamPage orgId={currentOrg.id} currentRole={currentOrg.role} currentUserId={user.id} />
        )}

        {navPage === 'quotes' && user && !isModuleEnabled(currentOrg, 'quotes') && (
          <PlaceholderPage
            title="Rates & Quoting isn't enabled"
            description="This module isn't enabled for your organization's plan — contact your account admin."
          />
        )}
        {navPage === 'quotes' && user && isModuleEnabled(currentOrg, 'quotes') && (
          <RatesQuotesPage orgId={currentOrg.id} onBookingCreated={handleCreated} />
        )}

        {navPage === 'accounting' && !isModuleEnabled(currentOrg, 'accounting') && (
          <PlaceholderPage
            title="Accounting isn't enabled"
            description="This module isn't enabled for your organization's plan — contact your account admin."
          />
        )}
        {navPage === 'accounting' && isModuleEnabled(currentOrg, 'accounting') && (
          <AccountingPage orgId={currentOrg.id} currentRole={currentOrg.role} billingModel={currentOrg.billing_model} />
        )}

        {navPage === 'auditlog' && <AuditLogPage orgId={currentOrg.id} currentRole={currentOrg.role} />}

        {navPage === 'platformadmin' && <PlatformAdminPage isPlatformAdmin={isPlatformAdmin} />}

        {navPage === 'customs' && <CustomsFilingsPage orgId={currentOrg.id} />}

        {navPage === 'reporting' && <ReportingPage orgId={currentOrg.id} />}

        {navPage === 'integrations' && <IntegrationsPage org={currentOrg} />}

        {navPage === 'settings' && <OrgSettingsPage org={currentOrg} />}
      </main>

      {bookingOpen && (
        <BookingModal
          orgId={currentOrg.id}
          defaultMode={bookingDefaultMode}
          onClose={() => setBookingOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {selectedShipment && (
        <ShipmentDetailModal
          shipment={selectedShipment}
          billingModel={currentOrg.billing_model}
          onClose={() => navigate('/dashboard')}
          onUpdated={() => {
            void queryClient.invalidateQueries({ queryKey: shipmentsQueryKey(currentOrg.id) })
          }}
        />
      )}
    </div>
  )
}
