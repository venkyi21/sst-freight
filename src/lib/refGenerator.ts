import type { ShipmentMode } from '../types'

export function shipmentRefPrefix(mode: ShipmentMode): string {
  if (mode === 'ocean') return 'BKG'
  if (mode === 'air') return 'AWB'
  return 'TRK'
}

export function generateRef(prefix: string): string {
  const year = new Date().getFullYear()
  const suffix = Math.floor(100 + Math.random() * 899)
  return `${prefix}-${year}-${suffix}`
}
