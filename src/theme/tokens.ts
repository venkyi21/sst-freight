// Typed access to the theme tokens defined in src/index.css (ADR-0031).
// Components consume colors ONLY through `T` — never as raw 'var(--…)' strings
// (a typo'd var() silently renders transparent) and never as hex literals.
// The values here are CSS var() references, so a future per-org theme switch
// (data-theme attribute on <html>) re-colors the whole app with no component edits.

export const T = {
  // neutrals / chrome
  bg: 'var(--color-bg)',
  surface: 'var(--color-surface)',
  surfaceRaised: 'var(--color-surface-raised)',
  surfaceSidebar: 'var(--color-surface-sidebar)',
  surfaceInset: 'var(--color-surface-inset)',
  border: 'var(--color-border)',
  borderStrong: 'var(--color-border-strong)',
  ink: 'var(--color-ink)',
  text: 'var(--color-text)',
  muted: 'var(--color-muted)',
  faint: 'var(--color-faint)',
  placeholder: 'var(--color-placeholder)',
  scrollbar: 'var(--color-scrollbar)',
  overlay: 'var(--color-overlay)',
  rowStripe: 'var(--color-row-stripe)',
  shadowModal: 'var(--shadow-modal)',

  // accent / interaction
  accent: 'var(--color-accent)',
  accentHover: 'var(--color-accent-hover)',
  onAccent: 'var(--color-on-accent)',
  accentWash: 'var(--color-accent-wash)',
  focusRing: 'var(--color-focus-ring)',
  link: 'var(--color-link)',
  linkHover: 'var(--color-link-hover)',

  // status
  success: 'var(--color-success)',
  successWash: 'var(--color-success-wash)',
  successBorder: 'var(--color-success-border)',
  danger: 'var(--color-danger)',
  dangerWash: 'var(--color-danger-wash)',
  dangerBorder: 'var(--color-danger-border)',
  warning: 'var(--color-warning)',
  warningWash: 'var(--color-warning-wash)',
  warningBorder: 'var(--color-warning-border)',
  info: 'var(--color-info)',
  infoWash: 'var(--color-info-wash)',
  statusNeutral: 'var(--color-status-neutral)',
  statusNeutralWash: 'var(--color-status-neutral-wash)',

  // mode / categorical
  modeOcean: 'var(--color-mode-ocean)',
  modeOceanWash: 'var(--color-mode-ocean-wash)',
  modeAir: 'var(--color-mode-air)',
  modeAirWash: 'var(--color-mode-air-wash)',
  modeTruck: 'var(--color-mode-truck)',
  modeTruckWash: 'var(--color-mode-truck-wash)',
} as const
