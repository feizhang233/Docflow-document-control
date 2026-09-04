import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function ModalLayer({
  open,
  onClose,
  label,
  children,
  variant = 'dialog',
  closeOnBackdrop = true,
  closeOnEscape = true,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: ReactNode
  variant?: 'dialog' | 'drawer'
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
}) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (!closeOnEscape || event.key !== 'Escape') return
      if (document.querySelector('.confirm-layer')) return
      event.preventDefault()
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, closeOnEscape])

  if (!open) return null

  const layerClass = variant === 'drawer' ? 'drawer-layer' : 'modal-layer'
  const backdropClass = variant === 'drawer' ? 'drawer-backdrop' : 'modal-backdrop'

  return createPortal(
    <div className={layerClass} role="dialog" aria-modal="true" aria-label={label}>
      <div className={backdropClass} onClick={closeOnBackdrop ? onClose : undefined} />
      {children}
    </div>,
    document.body,
  )
}
