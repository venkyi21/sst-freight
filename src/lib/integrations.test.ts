import { describe, expect, it } from 'vitest'
import { eventTypeLabel, isValidWebhookUrl, maskApiKey, retryScheduleLabel } from './integrations'

describe('maskApiKey', () => {
  it('renders the stored prefix with an ellipsis, never inventing key material', () => {
    expect(maskApiKey('sst_live_a1b2c3')).toBe('sst_live_a1b2c3…')
  })

  it('handles an empty prefix without crashing', () => {
    expect(maskApiKey('')).toBe('…')
  })
})

describe('isValidWebhookUrl', () => {
  it('accepts a well-formed https URL (mirrors the DB check constraint)', () => {
    expect(isValidWebhookUrl('https://erp.example.com/hooks/sst')).toBe(true)
  })

  it('rejects http (the DB constraint is https-only)', () => {
    expect(isValidWebhookUrl('http://erp.example.com/hooks')).toBe(false)
  })

  it('rejects a bare https:// with no host, and non-URL text', () => {
    expect(isValidWebhookUrl('https://')).toBe(false)
    expect(isValidWebhookUrl('not a url')).toBe(false)
  })
})

describe('eventTypeLabel', () => {
  it('maps a known event type to its human label', () => {
    expect(eventTypeLabel('invoice.paid')).toBe('Invoice paid')
  })

  it('falls back to the raw value for unknown types (e.g. test.ping in delivery history)', () => {
    expect(eventTypeLabel('test.ping')).toBe('test.ping')
  })
})

describe('retryScheduleLabel', () => {
  it('describes the next retry for an in-ladder pending delivery', () => {
    expect(retryScheduleLabel('pending', 1)).toBe('retrying (attempt 1 of 5)')
    expect(retryScheduleLabel('pending', 4)).toBe('retrying (attempt 4 of 5)')
  })

  it('says queued when no attempt has happened yet', () => {
    expect(retryScheduleLabel('pending', 0)).toBe('queued')
  })

  it('is terminal for delivered and failed', () => {
    expect(retryScheduleLabel('delivered', 1)).toBe('delivered')
    expect(retryScheduleLabel('failed', 5)).toBe('gave up after 5 attempts')
  })
})
