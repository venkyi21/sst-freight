export interface SupplyType {
  isSameState: boolean
  stateUnknown: boolean
}

// Week 14 (ADR-0021): same state (org vs. the invoice's billed contact) is an intra-state supply
// -> CGST+SGST. Different state is inter-state -> IGST. A contact with no state set defaults to
// inter-state/IGST, the safer assumption when place of supply can't be determined — never
// silently assumed same-state just because the field is empty. Depends only on org/contact state,
// not on any one line's amount, so callers compute it once per invoice, not per line.
export function determineSupplyType(orgState: string | null, contactState: string | null): SupplyType {
  const normalizedOrgState = orgState?.trim().toLowerCase() || null
  const normalizedContactState = contactState?.trim().toLowerCase() || null
  const stateUnknown = !normalizedOrgState || !normalizedContactState
  return { isSameState: !stateUnknown && normalizedOrgState === normalizedContactState, stateUnknown }
}

export interface GstAmounts {
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
}

// Same state -> CGST+SGST, each half of gstRate. Different state (or unknown, per
// determineSupplyType's default) -> IGST at the full gstRate.
export function computeGstAmounts(taxableValue: number, gstRate: number, supplyType: SupplyType): GstAmounts {
  const taxAmount = (taxableValue * gstRate) / 100
  if (supplyType.isSameState) {
    const half = taxAmount / 2
    return { cgstAmount: half, sgstAmount: half, igstAmount: 0 }
  }
  return { cgstAmount: 0, sgstAmount: 0, igstAmount: taxAmount }
}
