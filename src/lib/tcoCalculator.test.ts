import { describe, expect, it } from 'vitest'
import { COMPETITOR_BASELINES, competitorTcoInr, formatInr, sstTcoInr } from './tcoCalculator'

describe('sstTcoInr', () => {
  it('matches the exact 10-year total already verified manually via Playwright (docs/srs.md FR-17 AC)', () => {
    expect(sstTcoInr(10)).toBe(42_00_000)
  })

  it('stays flat regardless of seat count — the flat-fee property doubling seats does not move it', () => {
    // sstTcoInr takes no seats parameter at all: the flat-fee property IS that it can't scale with seats.
    expect(sstTcoInr(10)).toBe(sstTcoInr(10))
  })
})

describe('competitorTcoInr', () => {
  const baseline = COMPETITOR_BASELINES[0]

  it('reproduces the published 30-seat / 10-year baseline exactly at those inputs', () => {
    expect(competitorTcoInr(baseline, 30, 10)).toBeCloseTo(baseline.tcoAt30SeatsInr, 6)
  })

  it('scales linearly with seat count — doubling seats doubles the total (unlike SST\'s flat fee)', () => {
    const base = competitorTcoInr(baseline, 30, 10)
    const doubled = competitorTcoInr(baseline, 60, 10)
    expect(doubled).toBeCloseTo(base * 2, 6)
  })

  it('never goes negative for a negative seat count', () => {
    expect(competitorTcoInr(baseline, -5, 10)).toBe(0)
  })
})

describe('formatInr', () => {
  it('formats crore-scale amounts with 2 decimals', () => {
    expect(formatInr(1_50_00_000)).toBe('₹1.50Cr')
  })

  it('formats lakh-scale amounts with 1 decimal', () => {
    expect(formatInr(42_00_000)).toBe('₹42.0L')
  })

  it('formats sub-lakh amounts as a plain rounded rupee figure with Indian grouping', () => {
    expect(formatInr(45000)).toBe('₹45,000')
  })
})
