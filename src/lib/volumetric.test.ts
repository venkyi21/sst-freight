import { describe, expect, it } from 'vitest'
import { chargeableWeightKg, volumetricWeightKg } from './volumetric'

describe('volumetricWeightKg', () => {
  it('matches the exact case verified in docs/qa-testing.md Week 1 (100x80x60cm -> 80kg)', () => {
    expect(volumetricWeightKg(100, 80, 60)).toBe(80)
  })

  it('returns 0 when any dimension is 0', () => {
    expect(volumetricWeightKg(0, 80, 60)).toBe(0)
  })
})

describe('chargeableWeightKg', () => {
  it('picks gross weight when it exceeds volumetric weight', () => {
    expect(chargeableWeightKg(120, 80)).toBe(120)
  })

  it('picks volumetric weight when it exceeds gross weight', () => {
    expect(chargeableWeightKg(50, 80)).toBe(80)
  })

  it('returns the shared value when gross and volumetric are equal', () => {
    expect(chargeableWeightKg(80, 80)).toBe(80)
  })
})
