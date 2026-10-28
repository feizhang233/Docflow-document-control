import type { PointerEvent as ReactPointerEvent } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical } from 'lucide-react'
import type { ColumnConfig, ColumnField, RegisterColumnField } from '../../types/package'
import { columnWidthStyle } from '../../lib/columns'

export function PackageColumnHeader({
  label, columnField, field, config, sortBy, sortOrder, onSort, onResize, orderReady, onMove, onChooseColumns,
}: {
  label: string
  columnField: RegisterColumnField
  field?: string
  config?: ColumnConfig
  sortBy: string
  sortOrder: string
  onSort: (s: string) => void
  onResize?: (field: ColumnField, width: number, commit?: boolean) => void
  orderReady: boolean
  onMove: (field: RegisterColumnField, direction: -1 | 1) => void
  onChooseColumns: (target: HTMLElement) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: `column:${columnField}`,
    disabled: !orderReady,
    data: { type: 'column', field: columnField },
  })
  const beginResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!config || !onResize) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = config.column_width
    let width = startWidth
    const clampWidth = (value: number) => Math.min(500, Math.max(72, Math.round(value)))
    document.body.classList.add('resizing-column')
    // API requires integer column_width; mouse deltas are often fractional (e.g. 183.5 → 422).
    const move = (moveEvent: PointerEvent) => {
      width = clampWidth(startWidth + moveEvent.clientX - startX)
      onResize(config.field_name, width)
    }
    const end = () => {
      onResize(config.field_name, clampWidth(width), true)
      document.body.classList.remove('resizing-column')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end, { once: true })
  }
  return (
    <th
      ref={setNodeRef}
      scope="col"
      data-column-field={columnField}
      className={isDragging ? 'column-dragging' : undefined}
      style={{ ...columnWidthStyle(config), transform: CSS.Transform.toString(transform ? { ...transform, y: 0, scaleX: 1, scaleY: 1 } : null), transition }}
      aria-sort={field && sortBy === field ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <div className="column-heading-content">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="column-drag-handle"
          {...attributes}
          {...listeners}
          aria-disabled={!orderReady}
          aria-label={`Move ${label}. Drag or use Alt and Left or Right arrows.`}
          onClick={event => {
            event.stopPropagation()
            if (orderReady) onChooseColumns(event.currentTarget)
          }}
          onKeyDown={event => {
            if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
            event.preventDefault()
            event.stopPropagation()
            if (orderReady) onMove(columnField, event.key === 'ArrowLeft' ? -1 : 1)
          }}
        ><GripVertical aria-hidden="true" /></button>
        {field ? (
          <button className="sort-button" onClick={() => onSort(field)}>
            {label}
            {sortBy === field ? (sortOrder === 'asc' ? <ArrowUp /> : <ArrowDown />) : <ArrowUpDown />}
          </button>
        ) : label}
      </div>
      {config && onResize && (
        <span className="column-resize-handle" role="separator" aria-label={`Resize ${label}`} onPointerDown={beginResize} />
      )}
    </th>
  )
}
