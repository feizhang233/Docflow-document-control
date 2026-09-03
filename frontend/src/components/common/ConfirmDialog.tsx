import { AlertTriangle, LoaderCircle, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onClose: () => void
  onConfirm: () => void | Promise<unknown>
  tone?: 'danger' | 'warning'
}

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = 'Cancel', onClose, onConfirm, tone = 'danger' }: Props) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const pendingRef = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => cancelRef.current?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') || [])
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      restoreFocusRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setPending(false)
      setError('')
    }
  }, [open])

  if (!open) return null

  const confirm = async () => {
    if (pending) return
    setPending(true)
    setError('')
    try {
      await onConfirm()
      onClose()
    } catch {
      setError('The action could not be completed. Check your connection and try again.')
    } finally {
      setPending(false)
    }
  }

  return createPortal(
    <div className="confirm-layer">
      <button className="confirm-backdrop" type="button" aria-label="Cancel" disabled={pending} onClick={onClose} />
      <div
        ref={dialogRef}
        className={`confirm-dialog tone-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header>
          <span className="confirm-icon"><AlertTriangle /></span>
          <div>
            <span className="eyebrow">Confirm action</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close" disabled={pending}><X size={18} /></button>
        </header>
        <div className="confirm-body" id={descriptionId}>{description}</div>
        {error && <div className="confirm-error" role="alert">{error}</div>}
        <footer>
          <button ref={cancelRef} type="button" className="secondary-button" onClick={onClose} disabled={pending}>{cancelLabel}</button>
          <button type="button" className={`confirm-button ${tone}`} onClick={confirm} disabled={pending} aria-busy={pending}>
            {pending ? <LoaderCircle className="spin" size={16} /> : <AlertTriangle size={16} />}
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
