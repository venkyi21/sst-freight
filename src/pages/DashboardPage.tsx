import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import Sidebar from '../components/Sidebar'
import ShipmentsTable from '../components/ShipmentsTable'
import BookingModal from '../components/BookingModal'
import DirectoryPage from '../components/DirectoryPage'
import TeamPage from '../components/TeamPage'
import ShipmentDetailModal from '../components/ShipmentDetailModal'
import RatesQuotesPage from '../components/RatesQuotesPage'
import AccountingPage from '../components/AccountingPage'
import PlaceholderPage from '../components/PlaceholderPage'
import type { NavPage, Shipment, ShipmentMode } from '../types'

type ModeFilter = 'all' | ShipmentMode

const filterButtonStyle = (active: boolean): CSSProperties => ({
  padding: '6px 13px',
  borderRadius: 6,
  border: 'none',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  background: active ? '#1e293b' : 'transparent',
  color: active ? '#f1f5f9' : '#8291a6',
})

export default function DashboardPage() {
  const { currentOrg, clearSelectedOrganization, user } = useAuth()
  const [navPage, setNavPage] = useState<NavPage>('dashboard')
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [search, setSearch] = useState('')
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingDefaultMode, setBookingDefaultMode] = useState<ShipmentMode>('ocean')
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)

  const orgId = currentOrg?.id ?? null

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setShipments([])
    supabase
      .from('shipments')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setLoadError(error.message)
        } else if (data) {
          setShipments(data as Shipment[])
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId, reloadToken])

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

  function handleCreated(shipment: Shipment) {
    setShipments((prev) => [shipment, ...prev])
    setBookingOpen(false)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%' }}>
      <Sidebar org={currentOrg} navPage={navPage} onNavigate={setNavPage} onSwitchOrg={clearSelectedOrganization} />

      <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            height: 64,
            flexShrink: 0,
            borderBottom: '1px solid #1e293b',
            background: 'rgba(15,23,42,0.5)',
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
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: '9px 12px',
                fontSize: 13,
                color: '#e2e8f0',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#22c55e',
                background: '#0f172a',
                border: '1px solid #1e293b',
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
                background: '#2563eb',
                color: '#fff',
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
              <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, color: '#f1f5f9' }}>Active Shipments</h1>
              <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 9, padding: 3, display: 'flex', gap: 2 }}>
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
                  background: 'rgba(244,63,94,0.08)',
                  border: '1px solid rgba(244,63,94,0.3)',
                  borderRadius: 12,
                  padding: 24,
                  textAlign: 'center',
                }}
              >
                <div style={{ color: '#fb7185', fontSize: 13.5, marginBottom: 12 }}>
                  Couldn't load shipments: {loadError}
                </div>
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
              <ShipmentsTable shipments={filtered} loading={loading} onRowClick={setSelectedShipment} />
            )}
          </div>
        )}

        {navPage === 'directory' && <DirectoryPage orgId={currentOrg.id} />}

        {navPage === 'team' && user && (
          <TeamPage orgId={currentOrg.id} currentRole={currentOrg.role} currentUserId={user.id} />
        )}

        {navPage === 'quotes' && user && (
          <RatesQuotesPage orgId={currentOrg.id} userId={user.id} onBookingCreated={handleCreated} />
        )}

        {navPage === 'accounting' && <AccountingPage orgId={currentOrg.id} currentRole={currentOrg.role} />}

        {navPage === 'customs' && (
          <PlaceholderPage
            title="Customs Filing Simulator"
            description="Bill of Entry / Shipping Bill filing workflows ship in Week 10 of the release plan."
          />
        )}
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
          onClose={() => setSelectedShipment(null)}
          onUpdated={(updated) => {
            setShipments((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
            setSelectedShipment(updated)
          }}
        />
      )}
    </div>
  )
}
