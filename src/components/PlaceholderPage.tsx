import { T } from '../theme/tokens'
interface PlaceholderPageProps {
  title: string
  description: string
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>{description}</div>
      </div>
    </div>
  )
}
