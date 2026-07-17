import { T } from '../theme/tokens'
interface FieldErrorProps {
  message?: string
}

export default function FieldError({ message }: FieldErrorProps) {
  if (!message) return null
  return <div style={{ marginTop: 4, fontSize: 11.5, color: T.danger }}>{message}</div>
}
