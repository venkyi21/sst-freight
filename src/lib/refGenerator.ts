import type { CustomsFilingType, ShipmentDocumentType, ShipmentMode } from '../types'

export function shipmentRefPrefix(mode: ShipmentMode): string {
  if (mode === 'ocean') return 'BKG'
  if (mode === 'air') return 'AWB'
  return 'TRK'
}

export function customsFilingRefPrefix(filingType: CustomsFilingType): string {
  return filingType === 'bill_of_entry' ? 'BOE' : 'SB'
}

export function documentRefPrefix(documentType: ShipmentDocumentType): string {
  if (documentType === 'bill_of_lading') return 'BOL'
  if (documentType === 'packing_list') return 'PKL'
  if (documentType === 'certificate_of_origin') return 'COO'
  if (documentType === 'commercial_invoice') return 'CINV'
  if (documentType === 'scmtr_compliance_report') return 'SCR'
  return 'DOC'
}

export function generateRef(prefix: string): string {
  const year = new Date().getFullYear()
  const suffix = Math.floor(100 + Math.random() * 899)
  return `${prefix}-${year}-${suffix}`
}
