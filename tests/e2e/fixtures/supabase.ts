import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { QA_PASSWORD, QA_USERS, type QaUser } from './qa-data'

// Server-side enforcement (RLS, RPCs, triggers, module gating) is best asserted directly against
// the API — not through the browser, where a hidden button proves nothing about what the server
// would actually reject. This fixture gives specs an authenticated supabase-js client pointed at
// the DEV project, mirroring the (now-retired) scratchpad API scripts. It reuses the app's own
// production `@supabase/supabase-js` dependency and reads the same dev credentials the app uses,
// so there is no separate secret and no new dependency (ADR-0032).

// Playwright doesn't auto-load .env; parse .env.local ourselves (tiny, dotenv-free) so the API
// client uses exactly the project the local dev server points at.
function loadEnvLocal(): Record<string, string> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
  const out: Record<string, string> = {}
  try {
    for (const raw of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    /* fall through to process.env below */
  }
  return out
}

const env = loadEnvLocal()
export const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Supabase dev credentials not found. Ensure .env.local defines VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_ANON_KEY (see .env.example), or export them before running test:e2e.',
  )
}

/** An authenticated supabase-js client for one QA identity (no persisted session — fresh per call). */
export async function signInAs(user: QaUser): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email: QA_USERS[user], password: QA_PASSWORD })
  if (error) throw new Error(`sign-in ${QA_USERS[user]}: ${error.message}`)
  return client
}

/**
 * Look up one of the QA tenants by its name prefix, from a client that can see it.
 *
 * A prefix match against a mutable QA tenant is only safe when exactly one org matches it — if a
 * re-seed ever leaves duplicates behind (a stale "Client A Logistics QA-*" instance from an
 * earlier run), picking `data[0]` from an unordered result set is non-deterministic: it can differ
 * between the fixture's own call and whatever the app's browser org-picker resolves to, so a spec
 * writes to one instance and asserts against another. Failing loudly here trades a confusing,
 * moving-target flake for an immediate "go dedupe the QA tenant" error.
 */
export async function getOrg(client: SupabaseClient, namePrefix: string) {
  const { data, error } = await client
    .from('organizations')
    .select('id, name, billing_model, enabled_modules, monthly_fee_inr, created_at')
    .ilike('name', `${namePrefix}%`)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`org lookup "${namePrefix}": ${error.message}`)
  if (!data?.length) throw new Error(`org "${namePrefix}" not found for this identity`)
  if (data.length > 1) {
    const ids = data.map((o) => `${o.id} (${o.name})`).join(', ')
    throw new Error(
      `org "${namePrefix}" matched ${data.length} orgs, expected exactly 1 — dedupe the QA tenant ` +
        `on dev before re-running (see docs/test-data-register.md): ${ids}`,
    )
  }
  return data[0]
}

/**
 * Collapse a quotes-service Edge Function invocation to the same `{ data, error }` shape the app's
 * `src/api/quotes.ts` uses, including pulling the structured error out of a FunctionsHttpError body.
 */
export async function invokeQuotesService(client: SupabaseClient, body: Record<string, unknown>) {
  const { data, error } = await client.functions.invoke('quotes-service', { body })
  if (error) {
    let msg = error.message
    try {
      const j = await (error as { context: { json(): Promise<{ error?: string }> } }).context.json()
      if (j?.error) msg = j.error
    } catch {
      /* keep the invoke message */
    }
    return { data: null as unknown, error: msg }
  }
  if (data && (data as { error?: string }).error) return { data: null as unknown, error: (data as { error: string }).error }
  return { data: (data as { data?: unknown })?.data ?? null, error: null as string | null }
}
