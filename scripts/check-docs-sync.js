#!/usr/bin/env node
// Fails if supabase/schema.sql changed without a matching update to at least one of the
// docs-as-code files (docs/adr/**, docs/tech-debt.md, docs/api-reference.md).
// Used by both the local pre-commit hook (.githooks/pre-commit) and CI
// (.github/workflows/check-docs-sync.yml) — same rule, two enforcement points.
//
// Usage: node scripts/check-docs-sync.js <file1> <file2> ...
// (the caller is responsible for producing the right file list — staged files for the
// pre-commit hook, the push/PR diff for CI)

const SCHEMA_FILE = 'supabase/schema.sql'
const DOC_PATTERNS = [/^docs\/adr\//, /^docs\/tech-debt\.md$/, /^docs\/api-reference\.md$/]

const changedFiles = process.argv.slice(2).map((f) => f.replace(/\\/g, '/'))

const schemaChanged = changedFiles.includes(SCHEMA_FILE)
const docsChanged = changedFiles.some((f) => DOC_PATTERNS.some((pattern) => pattern.test(f)))

if (schemaChanged && !docsChanged) {
  console.error(`
✗ supabase/schema.sql changed, but none of the docs-as-code files did:
    docs/adr/**, docs/tech-debt.md, docs/api-reference.md

  Per CLAUDE.md, a schema change ships with its documentation in the same commit:
    - New table/RPC/RLS decision worth remembering the "why" of?  → add an ADR (docs/adr/)
    - Ran node scripts/generate-api-reference.js to refresh signatures? → docs/api-reference.md
    - Known shortcut/limitation introduced?                       → docs/tech-debt.md

  If this change genuinely needs none of the above (e.g. a comment-only or formatting-only
  schema edit), bypass with: git commit --no-verify
`)
  process.exit(1)
}

console.log('✓ docs-sync check passed.')
