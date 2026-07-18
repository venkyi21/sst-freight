// Brand-locked colors (ADR-0031). Deliberately NOT theme tokens: the SST Freight
// mark and wordmark must render identically under any current or future per-org
// theme — clients always see the same SST trademark. Do not convert these to var().
// If a dark org theme is ever added (Phase 2), it needs a `wordmarkInverse` variant
// before shipping — recorded in docs/tech-debt.md.

export const BRAND = {
  /** The "S" logo block background. */
  markBg: '#4338ca',
  /** The "S" glyph inside the mark. */
  markFg: '#ffffff',
  /** "SST Freight" wordmark text in brand lockups. */
  wordmark: '#14141a',
} as const
