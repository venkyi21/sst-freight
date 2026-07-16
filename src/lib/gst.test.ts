import { describe, expect, it } from 'vitest'
import { computeGstAmounts, determineSupplyType } from './gst'

describe('determineSupplyType', () => {
  it('is same-state (intra-state) when org and contact states match, case/whitespace-insensitively', () => {
    expect(determineSupplyType('Maharashtra', '  maharashtra ')).toEqual({
      isSameState: true,
      stateUnknown: false,
    })
  })

  it('is inter-state when org and contact states differ', () => {
    expect(determineSupplyType('Maharashtra', 'Karnataka')).toEqual({
      isSameState: false,
      stateUnknown: false,
    })
  })

  it('defaults to inter-state (not same-state) when either state is unknown, never assuming same-state', () => {
    expect(determineSupplyType(null, 'Karnataka')).toEqual({ isSameState: false, stateUnknown: true })
    expect(determineSupplyType('Maharashtra', null)).toEqual({ isSameState: false, stateUnknown: true })
    expect(determineSupplyType(null, null)).toEqual({ isSameState: false, stateUnknown: true })
  })
})

describe('computeGstAmounts', () => {
  it('splits intra-state GST 50/50 into CGST/SGST, with zero IGST', () => {
    const amounts = computeGstAmounts(10000, 18, { isSameState: true, stateUnknown: false })
    expect(amounts).toEqual({ cgstAmount: 900, sgstAmount: 900, igstAmount: 0 })
  })

  it('charges the full rate as IGST for inter-state supply, matching HS 8517.12 (18% IGST) from the Week 14 QA pass', () => {
    const amounts = computeGstAmounts(10000, 18, { isSameState: false, stateUnknown: false })
    expect(amounts).toEqual({ cgstAmount: 0, sgstAmount: 0, igstAmount: 1800 })
  })

  it('returns all zeros for a zero taxable value', () => {
    expect(computeGstAmounts(0, 18, { isSameState: true, stateUnknown: false })).toEqual({
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
    })
  })
})
