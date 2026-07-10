/**
 * Air-freight volumetric (dimensional) weight, IATA divisor 6000.
 * Chargeable weight is the greater of actual (gross) and volumetric weight.
 */
export function volumetricWeightKg(lengthCm: number, widthCm: number, heightCm: number): number {
  return (lengthCm * widthCm * heightCm) / 6000
}

export function chargeableWeightKg(grossWeightKg: number, volumetricKg: number): number {
  return Math.max(grossWeightKg, volumetricKg)
}
