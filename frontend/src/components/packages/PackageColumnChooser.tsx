import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { arrayMove } from '@dnd-kit/sortable'
import { ArrowLeft, ArrowRight, Columns3, LoaderCircle, X } from 'lucide-react'
import type { ColumnField, ColumnVisibility, RegisterColumnField } from '../../types/package'
import type { RegisterColumn } from '../../lib/columns'
import { useDismissableLayer } from '../../hooks/useDismissableLayer'

export interface ColumnMenuAnchor {
  x: number
  y: number
  field?: ColumnField
}

export function PackageColumnChooser({
  id, anchor, choices, ready, saving, orderCustomized, buttonRef, onChange, onOrderChange, onClose,
}: {
  id: string
  anchor: ColumnMenuAnchor
  choices: RegisterColumn[]
  ready: boolean
  saving: boolean
  orderCustomized: boolean
  buttonRef: RefObject<HTMLButtonElement | null>
  onChange: (visibility: ColumnVisibility) => void
  onOrderChange: (order: RegisterColumnField[]) => void
  onClose: (restoreFocus?: boolean) => void
}) {
  const ref = useDismissableLayer<HTMLDivElement>(true, onClose, [buttonRef])
  const pendingFocusRef = useRef<HTMLElement | null>(null)
  const [position, setPosition] = useState<CSSProperties>({ left: 8, top: 8 })
  const blocked = !ready || saving
  const current = choices.find(choice => choice.field === anchor.field)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const headerBottom = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0
    const minTop = Math.max(8, headerBottom + 8)
    const maxHeight = Math.max(0, window.innerHeight - minTop - 8)
    element.style.maxHeight = `${maxHeight}px`
    const rect = element.getBoundingClientRect()
    setPosition({
      left: Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8)),
      top: Math.max(minTop, Math.min(anchor.y, window.innerHeight - rect.height - 8)),
      maxHeight,
    })
    const input = element.querySelector<HTMLInputElement>(`input[data-column-field="${anchor.field || ''}"]:not(:disabled)`)
      || element.querySelector<HTMLInputElement>('input:not(:disabled)')
    ;(input || element).focus({ preventScroll: true })
  }, [anchor, ref])

  useLayoutEffect(() => {
    const element = ref.current
    const control = pendingFocusRef.current
    if (!element || !control) return
    if (saving) {
      // Keep keyboard focus in the chooser while its controls are disabled.
      element.focus({ preventScroll: true })
    } else {
      if (document.activeElement === element || document.activeElement === document.body) {
        const next = control.isConnected && !control.matches(':disabled')
          ? control
          : element.querySelector<HTMLElement>('input:not(:disabled)') || element
        next.focus({ preventScroll: true })
      }
      pendingFocusRef.current = null
    }
  }, [saving, ref])

  const rememberFocus = () => {
    const active = document.activeElement
    pendingFocusRef.current = active instanceof HTMLElement && ref.current?.contains(active) ? active : null
  }
  const changeVisibility = (visibility: ColumnVisibility) => {
    rememberFocus()
    onChange(visibility)
  }
  const changeOrder = (order: RegisterColumnField[]) => {
    rememberFocus()
    onOrderChange(order)
  }

  useEffect(() => {
    const onScroll = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onResize = () => onClose()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [onClose, ref])

  return createPortal(
    <div
      id={id}
      ref={ref}
      className="column-visibility-popover"
      role="dialog"
      aria-label="Columns"
      aria-describedby={`${id}-description`}
      aria-busy={saving || !ready}
      tabIndex={-1}
      style={position}
      onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && !buttonRef.current?.contains(event.relatedTarget)) onClose(false)
      }}
    >
      <header>
        <strong><Columns3 aria-hidden="true" />Columns</strong>
        <button type="button" className="icon-button" onClick={() => onClose()} aria-label="Close columns"><X aria-hidden="true" /></button>
      </header>
      <p id={`${id}-description`}>Saved to your account for this register.</p>
      {current && <button type="button" className="column-hide-current" disabled={blocked} onClick={() => changeVisibility({ [current.field]: !current.visible })}>{current.visible ? 'Hide' : 'Show'} {current.label}</button>}
      <div className="column-visibility-list" role="group" aria-label="Visible columns">
        {choices.map((choice, index) => (
          <div key={choice.field} className="column-visibility-row">
            <label className={blocked ? 'is-disabled' : undefined}>
              <input
                type="checkbox"
                data-column-field={choice.field}
                checked={choice.visible}
                disabled={blocked}
                onChange={event => changeVisibility({ [choice.field]: event.target.checked })}
              />
              <span>{choice.label}</span>
            </label>
            <div className="column-order-actions">
              {([-1, 1] as const).map(direction => (
                <button
                  type="button"
                  key={direction}
                  aria-label={`Move ${choice.label} ${direction === -1 ? 'left' : 'right'}`}
                  aria-disabled={blocked || index + direction < 0 || index + direction >= choices.length}
                  onClick={() => {
                    const target = index + direction
                    if (!blocked && target >= 0 && target < choices.length) changeOrder(arrayMove(choices.map(item => item.field), index, target))
                  }}
                >{direction === -1 ? <ArrowLeft aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <footer>
        <span role="status">{!ready ? 'Loading saved columns…' : saving ? <><LoaderCircle className="spin" aria-hidden="true" />Saving…</> : `${choices.filter(choice => choice.visible).length} of ${choices.length} shown`}</span>
        <div>
          <button type="button" aria-disabled={blocked || !orderCustomized} onClick={() => { if (!blocked && orderCustomized) changeOrder([]) }}>Reset order</button>
          <button type="button" disabled={blocked || choices.every(choice => choice.visible)} onClick={() => changeVisibility(Object.fromEntries(choices.map(choice => [choice.field, true])))}>Show all</button>
        </div>
      </footer>
    </div>,
    document.body,
  )
}
