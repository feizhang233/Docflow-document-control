import { Files } from 'lucide-react'

export function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`logo-mark ${compact ? 'compact' : ''}`} aria-hidden="true">
      <span className="logo-mark-sheet logo-mark-sheet-back" />
      <span className="logo-mark-sheet logo-mark-sheet-front" />
      <Files />
    </span>
  )
}
