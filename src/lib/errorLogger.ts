export type ErrorLogSource = 'window-error' | 'unhandled-rejection' | 'react-error-boundary' | 'external-api'

export interface ErrorLogPayload {
  message: string
  stack?: string
  source: ErrorLogSource
  url: string
  userAgent: string
  timestamp: string
  context?: Record<string, unknown>
}

// Unset by default — see ADR-0011. With no endpoint configured, every error still lands in
// console.error exactly as before this module existed, so local dev needs zero extra config.
const ENDPOINT = import.meta.env.VITE_ERROR_LOG_ENDPOINT as string | undefined

export function logError(payload: Pick<ErrorLogPayload, 'message' | 'stack' | 'source' | 'context'>): void {
  const full: ErrorLogPayload = {
    ...payload,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  }

  if (!ENDPOINT) {
    console.error('[error-log]', full)
    return
  }

  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(full),
    keepalive: true,
  }).catch(() => {
    // Logging must never throw or block the app — fall back to console on send failure.
    console.error('[error-log] send failed, falling back to console', full)
  })
}

export function initGlobalErrorLogging(): void {
  window.addEventListener('error', (event) => {
    logError({ message: event.message, stack: event.error?.stack, source: 'window-error' })
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    logError({
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      source: 'unhandled-rejection',
    })
  })
}
