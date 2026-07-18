// Non-functional (performance) measurement against the DEV Supabase project (ADR-0032, Q4).
// Records REAL p50/p95/max latency for representative org-scoped reads/RPCs, plus a concurrency
// ramp, so docs/perf-baseline.md and docs/srs.md §3 carry a measured figure rather than "not
// measured". This is a point-in-time measurement, not a gate — run it with `npm run test:perf`.
//
// srs §3 target under test: p95 < 500 ms at ≤ 20 concurrent users.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvLocal() {
  const out = {}
  try {
    for (const raw of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    /* fall back to process.env */
  }
  return out
}

const env = loadEnvLocal()
const URL = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY
const PASSWORD = process.env.E2E_PASSWORD ?? 'TestPass123'
if (!URL || !KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example).')
  process.exit(1)
}

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]
}
const round = (n) => Math.round(n * 10) / 10
const stats = (ms) => ({
  n: ms.length,
  p50: round(pct(ms, 0.5)),
  p95: round(pct(ms, 0.95)),
  max: round(Math.max(...ms)),
  mean: round(ms.reduce((a, b) => a + b, 0) / ms.length),
})

async function timed(fn) {
  const t0 = performance.now()
  const { error } = await fn()
  const dt = performance.now() - t0
  if (error) throw new Error(error.message ?? String(error))
  return dt
}

async function main() {
  const client = createClient(URL, KEY, { auth: { persistSession: false } })
  const { error: signErr } = await client.auth.signInWithPassword({ email: 'qa-ownerA@example.com', password: PASSWORD })
  if (signErr) throw new Error(`sign-in: ${signErr.message}`)
  const { data: orgs } = await client.from('organizations').select('id, name').ilike('name', 'Client A Logistics%')
  const orgId = orgs?.[0]?.id
  if (!orgId) throw new Error('Client A org not found')

  console.log(`# Perf measurement — dev (${new Date().toISOString()})`)
  console.log(`Org: ${orgs[0].name} (${orgId})\n`)

  // Representative operations: the reads/RPCs the dashboards and list screens actually issue.
  const ops = {
    'shipments.list': () => client.from('shipments').select('*').eq('org_id', orgId),
    'quotes.list': () => client.from('quotes').select('*').eq('org_id', orgId),
    'invoices.list': () => client.from('invoices').select('*').eq('org_id', orgId),
    'contacts.list': () => client.from('contacts').select('*').eq('org_id', orgId),
    'audit_log.rpc': () => client.rpc('list_audit_log', { p_org_id: orgId, p_table_name: null }),
    'reporting.aggregate': () =>
      Promise.all([
        client.from('shipments').select('*').eq('org_id', orgId),
        client.from('invoices').select('*').eq('org_id', orgId),
        client.from('shipment_costs').select('*').eq('org_id', orgId),
        client.from('customs_filings').select('*').eq('org_id', orgId),
      ]).then(() => ({ error: null })),
  }

  const ITER = Number(process.env.PERF_ITER ?? 30)
  console.log(`## Sequential latency (${ITER} iterations each, after warm-up)\n`)
  console.log('| operation | p50 ms | p95 ms | max ms | mean ms |')
  console.log('| --- | --- | --- | --- | --- |')
  const seq = {}
  for (const [name, fn] of Object.entries(ops)) {
    await timed(fn) // warm-up (not counted)
    const ms = []
    for (let i = 0; i < ITER; i++) ms.push(await timed(fn))
    const s = stats(ms)
    seq[name] = s
    console.log(`| ${name} | ${s.p50} | ${s.p95} | ${s.max} | ${s.mean} |`)
  }

  // Concurrency ramp: fire C simultaneous copies of a representative read; report the per-request
  // p95 and the achieved throughput. The srs target is p95 < 500 ms at ≤ 20 concurrent.
  console.log(`\n## Concurrency ramp — operation: shipments.list\n`)
  console.log('| concurrent | p95 ms | max ms | wall ms | req/s |')
  console.log('| --- | --- | --- | --- | --- |')
  const ramp = {}
  await Promise.all(Array.from({ length: 10 }, () => timed(ops['shipments.list']))) // warm the pooled connections
  for (const C of [10, 20, 40]) {
    const t0 = performance.now()
    const ms = await Promise.all(Array.from({ length: C }, () => timed(ops['shipments.list'])))
    const wall = performance.now() - t0
    const s = stats(ms)
    const rps = round((C / wall) * 1000)
    ramp[C] = { p95: s.p95, max: s.max, wall: round(wall), rps }
    console.log(`| ${C} | ${s.p95} | ${s.max} | ${round(wall)} | ${rps} |`)
  }

  const target = 500
  const at20 = ramp[20].p95
  console.log(`\n## Verdict vs srs §3 target (p95 < ${target} ms at ≤ 20 concurrent)`)
  console.log(`Measured p95 at 20 concurrent: ${at20} ms — ${at20 < target ? 'PASS' : 'MISS'}`)

  console.log('\n<<<JSON>>>')
  console.log(JSON.stringify({ when: new Date().toISOString(), orgId, seq, ramp, target, at20 }, null, 2))
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
