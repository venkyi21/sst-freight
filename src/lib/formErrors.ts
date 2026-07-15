import type { PostgrestError } from '@supabase/supabase-js'

// Postgres auto-names an unnamed inline `check` constraint `<table>_<column>_check` — reliable
// without renaming anything in schema.sql. code 23514 = check_violation.
export function isCheckViolation(error: PostgrestError, constraintName: string): boolean {
  return error.code === '23514' && error.message.includes(constraintName)
}

// RPC-raised exceptions (code P0001) carry the exact message this app already controls.
export function isMessage(error: PostgrestError, text: string): boolean {
  return error.message.includes(text)
}
