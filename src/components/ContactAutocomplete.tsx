import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { fetchContactOptions, type ContactOption } from '../api/contacts'

interface ContactAutocompleteProps {
  orgId: string
  kind: 'shipper' | 'consignee' | 'vendor'
  value: string
  onChange: (name: string) => void
  onSelectContact: (id: string | null) => void
  placeholder?: string
  inputStyle: CSSProperties
}

export default function ContactAutocomplete({
  orgId,
  kind,
  value,
  onChange,
  onSelectContact,
  placeholder,
  inputStyle,
}: ContactAutocompleteProps) {
  const [options, setOptions] = useState<ContactOption[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchContactOptions(orgId, kind).then((data) => {
      if (!cancelled) setOptions(data)
    })
    return () => {
      cancelled = true
    }
  }, [orgId, kind])

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return options.slice(0, 8)
    return options.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 8)
  }, [options, value])

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const next = e.target.value
          onChange(next)
          const exactMatch = options.find((o) => o.name.toLowerCase() === next.trim().toLowerCase())
          onSelectContact(exactMatch ? exactMatch.id : null)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        style={inputStyle}
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 10,
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 8,
            boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            maxHeight: 180,
            overflowY: 'auto',
          }}
        >
          {matches.map((m) => (
            <div
              key={m.id}
              onMouseDown={() => {
                onChange(m.name)
                onSelectContact(m.id)
                setOpen(false)
              }}
              style={{
                padding: '8px 11px',
                fontSize: 13,
                color: '#e2e8f0',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#111e33')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {m.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
