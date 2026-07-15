import { useState } from 'react'

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
          border: '1px solid #475569',
          color: '#64748b',
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
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 11.5,
            fontWeight: 400,
            color: '#cbd5e1',
            lineHeight: 1.4,
            zIndex: 20,
            boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
