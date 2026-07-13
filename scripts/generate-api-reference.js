#!/usr/bin/env node
// Regenerates the auto-generated function-signature table in docs/api-reference.md
// from supabase/schema.sql. Only the block between the AUTO-GENERATED markers is
// touched — the hand-written "why/what it does" prose elsewhere in the file is
// left untouched. Run after any change to schema.sql (see CLAUDE.md).

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const schemaPath = path.join(repoRoot, 'supabase', 'schema.sql')
const docPath = path.join(repoRoot, 'docs', 'api-reference.md')

const START_MARKER = '<!-- AUTO-GENERATED:START (run `node scripts/generate-api-reference.js` to refresh) -->'
const END_MARKER = '<!-- AUTO-GENERATED:END -->'

function parseFunctions(sql) {
  const functions = new Map()

  const fnRegex = /create or replace function (\w+)\(([^)]*)\)\s*\n\s*returns\s+([^\n]+)/g
  let match
  while ((match = fnRegex.exec(sql))) {
    const [, name, args, returns] = match
    // Trigger functions are never called via supabase.rpc() — exclude from the API table.
    if (returns.trim().toLowerCase() === 'trigger') continue
    functions.set(name, { name, args: args.trim(), returns: returns.trim(), grantees: [] })
  }

  const grantRegex = /grant execute on function (\w+)\([^)]*\) to ([^;]+);/g
  while ((match = grantRegex.exec(sql))) {
    const [, name, granteeList] = match
    const fn = functions.get(name)
    if (fn) fn.grantees = granteeList.split(',').map((g) => g.trim())
  }

  return Array.from(functions.values())
}

function renderTable(functions) {
  const rows = functions.map((fn) => {
    const sig = `\`${fn.name}(${fn.args || ''})\``
    const returns = `\`${fn.returns}\``
    const grantees = fn.grantees.length > 0 ? fn.grantees.map((g) => `\`${g}\``).join(', ') : '_(no grant found)_'
    return `| ${sig} | ${returns} | ${grantees} |`
  })

  return [
    '| Function | Returns | Granted to |',
    '| --- | --- | --- |',
    ...rows,
  ].join('\n')
}

function main() {
  const sql = fs.readFileSync(schemaPath, 'utf8')
  const doc = fs.readFileSync(docPath, 'utf8')

  const functions = parseFunctions(sql)
  const table = renderTable(functions)
  const generatedBlock = `${START_MARKER}\n\n_Generated from \`supabase/schema.sql\` — do not hand-edit this table, run the script instead._\n\n${table}\n\n${END_MARKER}`

  const startIdx = doc.indexOf(START_MARKER)
  const endIdx = doc.indexOf(END_MARKER)

  if (startIdx === -1 || endIdx === -1) {
    console.error(`Could not find ${START_MARKER} / ${END_MARKER} markers in docs/api-reference.md`)
    process.exit(1)
  }

  const updatedDoc = doc.slice(0, startIdx) + generatedBlock + doc.slice(endIdx + END_MARKER.length)

  if (updatedDoc === doc) {
    console.log('docs/api-reference.md is already up to date.')
    return
  }

  fs.writeFileSync(docPath, updatedDoc)
  console.log(`docs/api-reference.md updated — ${functions.length} function(s) in the table.`)
}

main()
