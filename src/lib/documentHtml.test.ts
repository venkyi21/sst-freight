import { describe, expect, it } from 'vitest'
import { computeDocumentRows, renderShipmentDocumentHtml } from './documentHtml'
import type { ShipmentDocumentData } from './documentHtml'
import type { Shipment } from '../types'

// Unit coverage (ADR-0026) for the pure document-rendering logic — closes the committed-test gap
// for the live-generated Bill of Lading (TC-DOC-001) and SCMTR compliance report (TC-DOC-003),
// which are client-side generated (ADR-0017/0024) and so belong in the unit layer, not the E2E one.

const shipment = {
  id: 's1',
  ref: 'BKG-2026-100',
  mode: 'ocean',
  origin: 'Chennai (INMAA)',
  destination: 'Rotterdam (NLRTM)',
  vessel_name: 'MV Test',
  voyage_no: 'V123',
  container_size: "1x40'HC",
  load_type: 'FCL',
  gross_weight_kg: 1200,
  length_cm: 100,
  width_cm: 80,
  height_cm: 60,
  vehicle_type: null,
} as unknown as Shipment

const baseData: ShipmentDocumentData = {
  contacts: { shipper: 'Acme Exports', consignee: 'Rotterdam Imports BV' },
  invoice: null,
  customsFiling: null,
  hsCodeReference: null,
}

describe('computeDocumentRows — Bill of Lading (TC-DOC-001)', () => {
  it('renders shipper, consignee, ports, and the B/L number from the doc ref', () => {
    const rows = computeDocumentRows('bill_of_lading', shipment, baseData, 'BL-2026-500')
    const map = Object.fromEntries(rows.map((r) => [r.label, r.value]))
    expect(map['Shipper']).toBe('Acme Exports')
    expect(map['Consignee']).toBe('Rotterdam Imports BV')
    expect(map['Port / Place of Loading']).toBe('Chennai (INMAA)')
    expect(map['Port / Place of Discharge']).toBe('Rotterdam (NLRTM)')
    expect(map['B/L No.']).toBe('BL-2026-500')
    expect(map['Vessel / Voyage']).toContain('MV Test')
  })

  it('falls back to "General Cargo" when no customs filing supplies a goods description', () => {
    const rows = computeDocumentRows('bill_of_lading', shipment, baseData, 'BL-1')
    expect(rows.find((r) => r.label === 'Description of Goods')?.value).toBe('General Cargo')
  })
})

describe('computeDocumentRows — SCMTR compliance report (TC-DOC-003)', () => {
  it('surfaces the stored duty amounts and filing ref when a filing exists', () => {
    const data: ShipmentDocumentData = {
      ...baseData,
      customsFiling: {
        ref: 'BOE-2026-9',
        status: 'filed',
        hs_code: '8517.12',
        goods_description: 'Smartphones',
        assessable_value_inr: 100000,
        bcd_amount_inr: 10000,
        sws_amount_inr: 1000,
        igst_amount_inr: 19980,
        total_duty_inr: 30980,
      } as unknown as ShipmentDocumentData['customsFiling'],
      hsCodeReference: {
        basic_customs_duty_pct: 10,
        social_welfare_surcharge_pct: 10,
        igst_pct: 18,
      } as unknown as ShipmentDocumentData['hsCodeReference'],
    }
    const rows = computeDocumentRows('scmtr_compliance_report', shipment, data, 'RPT-1')
    const map = Object.fromEntries(rows.map((r) => [r.label, r.value]))
    expect(map['Filing Ref.']).toBe('BOE-2026-9')
    expect(map['HS Code']).toBe('8517.12')
    expect(map['Assessable Value']).toContain((100000).toLocaleString('en-IN'))
    expect(map['Total Duty']).toContain((30980).toLocaleString('en-IN'))
    expect(Object.keys(map).some((k) => k.startsWith('Basic Customs Duty (10%)'))).toBe(true)
  })

  it('degrades gracefully to a status message when no filing exists', () => {
    const rows = computeDocumentRows('scmtr_compliance_report', shipment, baseData, 'RPT-2')
    expect(rows.find((r) => r.label === 'Status')?.value).toMatch(/No customs filing/)
  })
})

describe('renderShipmentDocumentHtml', () => {
  it('produces a self-contained HTML document embedding the row values', () => {
    const rows = computeDocumentRows('bill_of_lading', shipment, baseData, 'BL-77')
    const html = renderShipmentDocumentHtml('bill_of_lading', shipment, rows, 'BL-77')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('BL-77')
    expect(html).toContain('Acme Exports')
  })
})
