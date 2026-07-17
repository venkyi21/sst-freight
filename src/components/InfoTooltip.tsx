import { useState } from 'react'
import { T } from '../theme/tokens'

interface InfoTooltipProps {
  text: string
}

export default function InfoTooltip({ text }: InfoTooltipProps) {
  const [open, setOpen] = useState(false)

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', marginLeft: 5, verticalAlign: 'middle' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: `1px solid ${T.placeholder}`,
          color: T.muted,
          fontSize: 9.5,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'help',
        }}
      >
        i
      </span>
      {open && (
        <span
          style={{
            position: 'absolute',
            bottom: '130%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 220,
            // Inverted tooltip (ADR-0031): ink-on-light everywhere else, light-on-ink here —
            // the strongest affordance that this is a transient overlay, not page content.
            background: T.ink,
            border: 'none',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 11.5,
            fontWeight: 400,
            color: T.bg,
            lineHeight: 1.4,
            zIndex: 20,
            boxShadow: T.shadowModal,
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
