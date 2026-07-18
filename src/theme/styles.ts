// Shared style primitives (ADR-0031) — the handful of CSSProperties objects that were
// duplicated near-identically across many components, now defined once on theme tokens.
// Adoption rule: a component's local object is replaced by one of these ONLY if it is
// textually identical after tokenization (spread + override for one-property diffs);
// anything further apart stays local, tokenized in place — this pass is chromatic, not
// a layout refactor.

import type { CSSProperties } from 'react'
import { T } from './tokens'

/** Form input (modal variant — the most common shape). */
export const inputStyle: CSSProperties = {
  width: '100%',
  background: T.bg,
  border: `1px solid ${T.border}`,
  borderRadius: 7,
  padding: '9px 11px',
  fontSize: 13,
  color: T.text,
}

/** Small uppercase-ish form label above an input. */
export const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: T.muted,
  display: 'block',
  marginBottom: 5,
}

/** Table header cell. */
export const tableHeadCellStyle: CSSProperties = {
  padding: '13px 20px',
  fontSize: 11,
  fontWeight: 600,
  color: T.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

/** Table body cell. */
export const tableCellStyle: CSSProperties = { padding: '14px 20px' }

/** Raised card/panel container. */
export const panelStyle: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
}

/** Stat/summary card. */
export const statCardStyle: CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  padding: '16px 18px',
}

/** Full-screen modal backdrop. */
export const modalOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: T.overlay,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
  padding: 24,
}

/** Modal card container. */
export const modalCardStyle: CSSProperties = {
  width: '100%',
  maxWidth: 520,
  maxHeight: '88vh',
  overflowY: 'auto',
  background: T.surfaceRaised,
  border: `1px solid ${T.border}`,
  borderRadius: 16,
  boxShadow: T.shadowModal,
}
