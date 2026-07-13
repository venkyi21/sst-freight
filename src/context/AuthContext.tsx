import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import type { Membership, Organization, OrganizationWithRole } from '../types'

interface ActionResult {
  error: string | null
}

interface SignUpResult extends ActionResult {
  needsEmailConfirmation: boolean
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  authLoading: boolean
  isPlatformAdmin: boolean
  organizations: OrganizationWithRole[]
  orgsLoading: boolean
  orgsError: string | null
  currentOrg: OrganizationWithRole | null
  signUp: (email: string, password: string) => Promise<SignUpResult>
  signIn: (email: string, password: string) => Promise<ActionResult>
  signOut: () => Promise<void>
  refreshOrganizations: () => Promise<void>
  createOrganization: (name: string, color: string) => Promise<ActionResult>
  joinOrganization: (inviteCode: string) => Promise<ActionResult>
  selectOrganization: (orgId: string) => void
  clearSelectedOrganization: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function currentOrgStorageKey(userId: string): string {
  return `sst-freight:current-org:${userId}`
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [organizations, setOrganizations] = useState<OrganizationWithRole[]>([])
  const [orgsLoading, setOrgsLoading] = useState(false)
  const [orgsError, setOrgsError] = useState<string | null>(null)
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)

  const user = session?.user ?? null

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setAuthLoading(false)
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  async function refreshOrganizations(): Promise<void> {
    if (!user) {
      setOrganizations([])
      setOrgsError(null)
      return
    }
    setOrgsLoading(true)
    setOrgsError(null)

    const { data: memberships, error: membershipError } = await supabase
      .from('memberships')
      .select('org_id, role')

    if (membershipError) {
      setOrganizations([])
      setOrgsError(membershipError.message)
      setOrgsLoading(false)
      return
    }

    if (!memberships || memberships.length === 0) {
      setOrganizations([])
      setOrgsLoading(false)
      return
    }

    const typedMemberships = memberships as Pick<Membership, 'org_id' | 'role'>[]
    const orgIds = typedMemberships.map((m) => m.org_id)

    const { data: orgs, error: orgsFetchError } = await supabase.from('organizations').select('*').in('id', orgIds)

    if (orgsFetchError || !orgs) {
      setOrganizations([])
      setOrgsError(orgsFetchError?.message ?? 'Could not load your organizations')
      setOrgsLoading(false)
      return
    }

    const roleByOrgId = new Map(typedMemberships.map((m) => [m.org_id, m.role]))
    const merged: OrganizationWithRole[] = (orgs as Organization[])
      .map((org) => ({ ...org, role: roleByOrgId.get(org.id) ?? 'member' }))
      .sort((a, b) => a.name.localeCompare(b.name))

    setOrganizations(merged)
    setOrgsLoading(false)
  }

  useEffect(() => {
    if (user) {
      const stored = window.localStorage.getItem(currentOrgStorageKey(user.id))
      setCurrentOrgId(stored)
      void refreshOrganizations()
      supabase
        .rpc('is_platform_admin')
        .then(({ data }) => setIsPlatformAdmin(Boolean(data)))
    } else {
      setOrganizations([])
      setCurrentOrgId(null)
      setIsPlatformAdmin(false)
    }
    // Only re-run when the signed-in user changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const currentOrg = useMemo(
    () => organizations.find((org) => org.id === currentOrgId) ?? null,
    [organizations, currentOrgId],
  )

  function selectOrganization(orgId: string): void {
    setCurrentOrgId(orgId)
    if (user) window.localStorage.setItem(currentOrgStorageKey(user.id), orgId)
  }

  function clearSelectedOrganization(): void {
    setCurrentOrgId(null)
    if (user) window.localStorage.removeItem(currentOrgStorageKey(user.id))
  }

  async function signUp(email: string, password: string): Promise<SignUpResult> {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { error: error.message, needsEmailConfirmation: false }
    return { error: null, needsEmailConfirmation: !data.session }
  }

  async function signIn(email: string, password: string): Promise<ActionResult> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut()
    clearSelectedOrganization()
  }

  async function createOrganization(name: string, color: string): Promise<ActionResult> {
    const { data, error } = await supabase.rpc('create_organization', { p_name: name, p_color: color }).single()
    if (error || !data) return { error: error?.message ?? 'Could not create organization' }
    await refreshOrganizations()
    selectOrganization((data as Organization).id)
    return { error: null }
  }

  async function joinOrganization(inviteCode: string): Promise<ActionResult> {
    const { data, error } = await supabase.rpc('join_organization', { p_invite_code: inviteCode }).single()
    if (error || !data) return { error: error?.message ?? 'Invalid invite code' }
    await refreshOrganizations()
    selectOrganization((data as Organization).id)
    return { error: null }
  }

  const value: AuthContextValue = {
    session,
    user,
    authLoading,
    isPlatformAdmin,
    organizations,
    orgsLoading,
    orgsError,
    currentOrg,
    signUp,
    signIn,
    signOut,
    refreshOrganizations,
    createOrganization,
    joinOrganization,
    selectOrganization,
    clearSelectedOrganization,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
