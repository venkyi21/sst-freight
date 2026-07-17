// Canonical handles for the pre-provisioned QA identities and tenants on the DEV Supabase project.
// The full register — roles, tenants, billing models, enabled modules, seed data, reset rules —
// is docs/test-data-register.md; this file is only the machine-readable slice the specs import so
// the strings live in exactly one place. The password is a throwaway dev-only credential for
// @example.com fixture accounts (override with E2E_PASSWORD if the fixtures are ever re-seeded).

export const QA_PASSWORD = process.env.E2E_PASSWORD ?? 'TestPass123'

export const QA_USERS = {
  ownerA: 'qa-ownerA@example.com',
  adminA: 'qa-adminA@example.com',
  memberA: 'qa-memberA@example.com',
  ownerB: 'qa-ownerB@example.com',
  memberB: 'qa-memberB@example.com',
  platform: 'qa-platform@example.com',
} as const

export type QaUser = keyof typeof QA_USERS

// The two mutable QA tenants. Specs match on these name prefixes in the org picker; the suffix
// (" QA-*") varies per seed and must not be matched exactly.
export const QA_ORGS = {
  /** model_1 · modules: directory, quotes, accounting */
  A: 'Client A Logistics',
  /** model_2 · FinTech-slice tenant */
  B: 'Client B Freight',
} as const
