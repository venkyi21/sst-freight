// Barrel re-export — split into src/types/*.ts by domain (ADR-0025). Every existing
// `import type {...} from '../types'` / `'./types'` call site keeps working unchanged; new code
// should import directly from the relevant src/types/<domain>.ts file instead of adding here.
export * from './types/common'
export * from './types/org'
export * from './types/contacts'
export * from './types/shipments'
export * from './types/quotes'
export * from './types/accounting'
export * from './types/customs'
export * from './types/documents'
export * from './types/integrations'
