// Non-functional LOAD + STRESS measurement against the DEV Supabase project (ADR-0032/0033, Q4).
// Complements scripts/measure-perf.mjs (sequential + light concurrency) with: (1) a sustained
// mixed-endpoint LOAD run at the srs §3 target concurrency, and (2) a STRESS ramp that pushes
// concurrency past the target until p95 breaches 500 ms, reporting the breaking point + error rate.
// A measurement, not a gate. Run with `npm run test:stress`.
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

async function timed(fn) {
  const t0 = performance.now()
  try {
    const { error } = await fn()
    return { ms: performance.now() - t0, ok: !error }
  } catch {
    return { ms: performance.now() - t0, ok: false }
  }
}

// Run `total` requests, at most `concurrency` in flight at once, drawing ops round-robin.
async function runWave(ops, concurrency, total) {
  const samples = []
  let errors = 0
  let issued = 0
  const t0 = performance.now()
  async function worker() {
    while (issued < total) {
      const op = ops[issued % ops.length]
      issued++
      const r = await timed(op)
      samples.push(r.ms)
      if (!r.ok) errors++
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  const wall = performance.now() - t0
  return {
    p50: round(pct(samples, 0.5)),
    p95: round(pct(samples, 0.95)),
    max: round(Math.max(...samples)),
    rps: round((samples.length / wall) * 1000),
    errorPct: round((errors / samples.length) * 100),
    n: samples.length,
  }
}

async function main() {
  const client = createClient(URL, KEY, { auth: { persistSession: false } })
  const { error: signErr } = await client.auth.signInWithPassword({ email: 'qa-ownerA@example.com', password: PASSWORD })
  if (signErr) throw new Error(`sign-in: ${signErr.message}`)
  const { data: orgs } = await client.from('organizations').select('id, name').ilike('name', 'Client A Logistics%')
  const orgId = orgs?.[0]?.id
  if (!orgId) throw new Error('Client A org not found')

  const ops = [
    () => client.from('shipments').select('*').eq('org_id', orgId),
    () => client.from('quotes').select('*').eq('org_id', orgId),
    () => client.from('invoices').select('*').eq('org_id', orgId),
    () => client.from('contacts').select('*').eq('org_id', orgId),
    () => client.rpc('list_audit_log', { p_org_id: orgId, p_table_name: null }),
  ]

  console.log(`# Load + stress — dev (${new Date().toISOString()})`)
  console.log(`Org: ${orgs[0].name} (${orgId})`)

  await runWave(ops, 10, 20) // warm pooled connections (not reported)

  const TARGET = 500

  // ── Sustained LOAD at the target concurrency ────────────────────────────────────────────────
  const LOAD_TOTAL = Number(process.env.LOAD_TOTAL ?? 300)
  const load = await runWave(ops, 20, LOAD_TOTAL)
  console.log(`\n## Sustained mixed-endpoint load — 20 concurrent, ${load.n} requests`)
  console.log('| p50 ms | p95 ms | max ms | req/s | error % |')
  console.log('| --- | --- | --- | --- | --- |')
  console.log(`| ${load.p50} | ${load.p95} | ${load.max} | ${load.rps} | ${load.errorPct} |`)

  // ── STRESS ramp until p95 breaches the target ───────────────────────────────────────────────
  console.log(`\n## Stress ramp (mixed endpoints) — target p95 < ${TARGET} ms`)
  console.log('| concurrent | p95 ms | max ms | req/s | error % | verdict |')
  console.log('| --- | --- | --- | --- | --- | --- |')
  const ramp = {}
  let breakingPoint = null
  for (const c of [20, 40, 60, 80, 100]) {
    const w = await runWave(ops, c, c * 4)
    const verdict = w.p95 < TARGET && w.errorPct === 0 ? 'PASS' : 'BREACH'
    ramp[c] = w
    if (!breakingPoint && verdict === 'BREACH') breakingPoint = c
    console.log(`| ${c} | ${w.p95} | ${w.max} | ${w.rps} | ${w.errorPct} | ${verdict} |`)
  }

  console.log(
    `\nBreaking point (first level breaching p95<${TARGET} or with errors): ${breakingPoint ?? '>100 (none observed)'}`,
  )
  console.log('\n<<<JSON>>>')
  console.log(JSON.stringify({ when: new Date().toISOString(), orgId, target: TARGET, load, ramp, breakingPoint }, null, 2))
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
