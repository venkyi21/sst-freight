import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logError } from '../lib/errorLogger'
import { T } from '../theme/tokens'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logError({
      message: error.message,
      stack: error.stack,
      source: 'react-error-boundary',
      context: { componentStack: info.componentStack },
    })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: T.bg,
          color: T.text,
          padding: 32,
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Something went wrong</div>
          <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.6, marginBottom: 18 }}>
            The app hit an unexpected error and couldn't continue. Reloading the page usually
            resolves this — if it keeps happening, let the team know what you were doing when it
            occurred.
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              background: 'transparent',
              color: T.text,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
