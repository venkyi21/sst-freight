import type { CustomsFilingType, ShipmentMode } from '../types'

export function shipmentRefPrefix(mode: ShipmentMode): string {
  if (mode === 'ocean') return 'BKG'
  if (mode === 'air') return 'AWB'
  return 'TRK'
}

export function customsFilingRefPrefix(filingType: CustomsFilingType): string {
  return filingType === 'bill_of_entry' ? 'BOE' : 'SB'
}

export function generateRef(prefix: string): string {
  const year = new Date().getFullYear()
  const suffix = Math.floor(100 + Math.random() * 899)
  return `${prefix}-${year}-${suffix}`
}
