// @vitest-environment jsdom
//
// Unit coverage (ADR-0026) for the client-error capture path (ADR-0011) — closes TC-AUTH-007.
// jsdom opt-in (the module reads window.location/navigator); the global Vitest environment stays
// 'node'. With no VITE_ERROR_LOG_ENDPOINT set (the test default), every error must still land in
// console.error with its source tag, url, and timestamp — never throw, never block.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { logError } from './errorLogger'

afterEach(() => vi.restoreAllMocks())

describe('logError (TC-AUTH-007)', () => {
  it('logs to console.error with the source tag and enriched fields when no endpoint is configured', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logError({ message: 'boom', source: 'react-error-boundary' })
    expect(spy).toHaveBeenCalledTimes(1)
    const [tag, payload] = spy.mock.calls[0] as [string, Record<string, unknown>]
    expect(tag).toBe('[error-log]')
    expect(payload.message).toBe('boom')
    expect(payload.source).toBe('react-error-boundary')
    expect(payload.url).toBe(window.location.href)
    expect(typeof payload.timestamp).toBe('string')
    expect(payload.userAgent).toBe(navigator.userAgent)
  })

  it('never throws on any source value', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => logError({ message: 'x', source: 'window-error' })).not.toThrow()
    expect(() => logError({ message: 'y', source: 'external-api', context: { code: 500 } })).not.toThrow()
  })
})
