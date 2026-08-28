import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function ModalLayer({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: ReactNode
}) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={label}>
      <div className="modal-backdrop" onClick={onClose} />
      {children}
    </div>,
    document.body,
  )
}
