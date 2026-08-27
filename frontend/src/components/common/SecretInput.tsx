import { Eye, EyeOff } from 'lucide-react'
import { useState, type InputHTMLAttributes } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  revealLabel?: string
}

export function SecretInput({ revealLabel = 'password', className, ...props }: Props) {
  const [revealed, setRevealed] = useState(false)
  return (
    <span className={`secret-input ${className || ''}`}>
      <input {...props} type={revealed ? 'text' : 'password'} />
      <button
        type="button"
        className="secret-toggle"
        onClick={() => setRevealed((value) => !value)}
        aria-label={`${revealed ? 'Hide' : 'Show'} ${revealLabel}`}
        aria-pressed={revealed}
      >
        {revealed ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </span>
  )
}
