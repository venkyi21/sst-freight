interface FieldErrorProps {
  message?: string
}

export default function FieldError({ message }: FieldErrorProps) {
  if (!message) return null
  return <div style={{ marginTop: 4, fontSize: 11.5, color: '#fb7185' }}>{message}</div>
}
