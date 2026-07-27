import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, ArrowUpDown, Ban, Copy, Eye, GripVertical, MoreHorizontal, OctagonX, Paperclip, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import type { ColumnConfig, ColumnField, FeedbackStatusCode, Package, PageKind } from '../../types/package'
import { ProgressTrack } from '../common/ProgressTrack'
import { StatusBadge } from '../common/StatusBadge'
import { FeedbackStatus } from './FeedbackStatus'
interface Props {
  items: Package[]
  highlightedPackageId: number | null
  kind: PageKind
  configs: ColumnConfig[]
  submissionSteps: readonly string[]
  feedbackReviewers: readonly string[]
  feedbackStatusLabels: Record<FeedbackStatusCode, string>
  feedbackStatusColors: Record<FeedbackStatusCode, string>
  sortBy: string
  sortOrder: 'asc' | 'desc'
  selectionMode?: boolean
  selectedIds?: Set<number>
  onToggleSelect?: (id: number) => void
  onToggleSelectAll?: () => void
  onSort: (key: string) => void
  onColumnResize: (field: ColumnField, width: number) => void
  onView: (item: Package) => void
  onEdit: (item: Package) => void
  onReorder: (ids: number[]) => void
  onAdvance: (item: Package, type: 'submission' | 'feedback') => void
  onDuplicate: (item: Package) => void
  onToggleAbandoned: (item: Package) => void
  onToggleTerminate: (item: Package) => void
  onDelete: (item: Package) => void
}

const styleFor = (config?: ColumnConfig): CSSProperties | undefined =>
  config ? { width: config.column_width, minWidth: config.column_width, maxWidth: config.column_width } : undefined

function Header({
  label, field, config, sortBy, sortOrder, onSort, onResize,
}: {
  label: string
  field?: string
  config?: ColumnConfig
  sortBy: string
  sortOrder: string
  onSort: (s: string) => void
  onResize?: (field: ColumnField, width: number, commit?: boolean) => void
}) {
  const beginResize = (event: React.PointerEvent<HTMLSpanElement>) => {
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
    <th style={styleFor(config)}>
      {field ? (
        <button className="sort-button" onClick={() => onSort(field)}>
          {label}
          {sortBy === field ? (sortOrder === 'asc' ? <ArrowUp /> : <ArrowDown />) : <ArrowUpDown />}
        </button>
      ) : label}
      {config && onResize && (
        <span className="column-resize-handle" role="separator" aria-label={`Resize ${label}`} onPointerDown={beginResize} />
      )}
    </th>
  )
}

function RowMenu({
  item,
  onDuplicate,
  onToggleAbandoned,
  onToggleTerminate,
  onDelete,
}: {
  item: Package
  onDuplicate: (item: Package) => void
  onToggleAbandoned: (item: Package) => void
  onToggleTerminate: (item: Package) => void
  onDelete: (item: Package) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  useLayoutEffect(() => {
    if (!menuOpen) {
      setCoords(null)
      return
    }
    const updatePosition = () => {
      const button = buttonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const menuHeight = 160
      const menuWidth = 200
      const spaceBelow = window.innerHeight - rect.bottom
      const openUp = spaceBelow < menuHeight + 12 && rect.top > menuHeight
      const left = Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8)
      const top = openUp ? rect.top - 6 : rect.bottom + 6
      setCoords({ top, left, openUp })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [menuOpen])

  return (
    <div className="row-menu">
      <button
        ref={buttonRef}
        onClick={(event) => {
          event.stopPropagation()
          setMenuOpen((value) => !value)
        }}
        aria-label="More actions"
        aria-expanded={menuOpen}
      >
        <MoreHorizontal size={18} />
      </button>
      {menuOpen && coords && createPortal(
        <div
          ref={popoverRef}
          className={`row-menu-popover ${coords.openUp ? 'open-up' : ''}`}
          style={{
            position: 'fixed',
            top: coords.openUp ? undefined : coords.top,
            bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
            left: coords.left,
            right: 'auto',
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button onClick={() => { setMenuOpen(false); onDuplicate(item) }}><Copy />Duplicate document</button>
          <button onClick={() => { setMenuOpen(false); onToggleAbandoned(item) }}>
            {item.is_abandoned ? <RotateCcw /> : <Ban />}
            {item.is_abandoned ? 'Restore submission' : 'Abandon submission'}
          </button>
          <button onClick={() => { setMenuOpen(false); onToggleTerminate(item) }}>
            {item.workflow_terminated ? <RotateCcw /> : <OctagonX />}
            {item.workflow_terminated ? 'Reopen workflow' : 'Terminate workflow'}
          </button>
          <button
            className="danger"
            onClick={() => {
              setMenuOpen(false)
              if (window.confirm(`Permanently delete ${item.document_number}? This cannot be undone.`)) onDelete(item)
            }}
          >
            <Trash2 />Delete document
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}

function SortableRow({
  item, highlighted, kind, configs, submissionSteps, feedbackReviewers, feedbackStatusLabels, feedbackStatusColors,
  selectionMode, selected, onToggleSelect, onView, onEdit, onAdvance, onDuplicate, onToggleAbandoned, onToggleTerminate, onDelete,
}: {
  item: Package
  highlighted: boolean
  kind: PageKind
  configs: ColumnConfig[]
  submissionSteps: Props['submissionSteps']
  feedbackReviewers: Props['feedbackReviewers']
  feedbackStatusLabels: Props['feedbackStatusLabels']
  feedbackStatusColors: Props['feedbackStatusColors']
  selectionMode: boolean
  selected: boolean
  onToggleSelect?: (id: number) => void
  onView: (p: Package) => void
  onEdit: (p: Package) => void
  onAdvance: Props['onAdvance']
  onDuplicate: Props['onDuplicate']
  onToggleAbandoned: Props['onToggleAbandoned']
  onToggleTerminate: Props['onToggleTerminate']
  onDelete: Props['onDelete']
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: selectionMode })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const primaryField: ColumnField = kind === 'workflow' ? 'workflow_number' : kind === 'transmittal' ? 'transmittal_number' : 'document_number'
  const first = item[primaryField]
  const config = (field: ColumnField) => configs.find((entry) => entry.field_name === field)
  const shown = (field: ColumnField) => {
    const entry = config(field)
    return kind === 'documents' ? entry?.is_visible !== false : kind === 'workflow' ? entry?.is_visible_workflow !== false : entry?.is_visible_transmittal !== false
  }
  return (
    <tr
      ref={setNodeRef}
      data-package-id={item.id}
      style={style}
      className={`${isDragging ? 'dragging' : ''} ${item.has_attachment ? 'has-attachment' : ''} ${item.is_abandoned ? 'abandoned' : ''} ${highlighted ? 'notification-highlight' : ''} ${selected ? 'row-selected' : ''}`}
      onDoubleClick={() => { if (!selectionMode) onView(item) }}
    >
      {selectionMode ? (
        <td className="select-cell">
          <label className="row-checkbox">
            <input type="checkbox" checked={selected} onChange={() => onToggleSelect?.(item.id)} aria-label={`Select ${item.document_number}`} />
            <i />
          </label>
        </td>
      ) : (
        <td className="drag-cell"><button {...attributes} {...listeners} aria-label="Drag to reorder"><GripVertical size={16} /></button></td>
      )}
      {shown(primaryField) && <td className="identifier-cell" style={styleFor(config(primaryField))}><strong>{first || '—'}</strong></td>}
      {kind !== 'documents' && shown('document_number') && <td className="identifier-cell" style={styleFor(config('document_number'))}><strong>{item.document_number || '—'}</strong></td>}
      {shown('document_title') && <td className="document-title-cell" style={styleFor(config('document_title'))}>{item.document_title || '—'}</td>}
      {shown('document_date') && <td className="mono-cell" style={styleFor(config('document_date'))}>{item.has_attachment ? <span className="attachment-label"><Paperclip /> Attachment</span> : item.document_date}</td>}
      {shown('document_type') && <td style={styleFor(config('document_type'))}><StatusBadge status={item.document_type} color={config('document_type')?.option_colors[item.document_type]} /></td>}
      {shown('initiator') && <td style={styleFor(config('initiator'))}><div className="person-cell"><span>{item.initiator.split(' ').map((s) => s[0]).join('').slice(0, 2)}</span>{item.initiator}</div></td>}
      {shown('discipline') && <td style={styleFor(config('discipline'))}>{item.discipline}</td>}
      {shown('number_of_documents') && <td className="number-cell" style={styleFor(config('number_of_documents'))}>{item.number_of_documents}</td>}
      {primaryField !== 'transmittal_number' && shown('transmittal_number') && <td className="mono-cell" style={styleFor(config('transmittal_number'))}>{item.transmittal_number || '—'}</td>}
      {primaryField !== 'workflow_number' && shown('workflow_number') && <td className="mono-cell" style={styleFor(config('workflow_number'))}>{item.workflow_number || '—'}</td>}
      {shown('submission_progress') && <td className="progress-cell" style={styleFor(config('submission_progress'))}><ProgressTrack steps={submissionSteps} values={item.submission_progress} disabled={item.is_abandoned} onAdvance={() => onAdvance(item, 'submission')} /></td>}
      {shown('feedback') && <td className="progress-cell feedback" style={styleFor(config('feedback'))}><FeedbackStatus item={item} reviewers={feedbackReviewers} statusLabels={feedbackStatusLabels} statusColors={feedbackStatusColors} compact /></td>}
      <td className="action-cell">
        <button onClick={(event) => { event.stopPropagation(); onView(item) }} aria-label="View document"><Eye size={17} /></button>
        <button onClick={(event) => { event.stopPropagation(); onEdit(item) }} aria-label="Edit document"><Pencil size={16} /></button>
        <RowMenu item={item} onDuplicate={onDuplicate} onToggleAbandoned={onToggleAbandoned} onToggleTerminate={onToggleTerminate} onDelete={onDelete} />
      </td>
    </tr>
  )
}

export function PackageTable({
  items, highlightedPackageId, kind, configs, submissionSteps, feedbackReviewers, feedbackStatusLabels, feedbackStatusColors,
  sortBy, sortOrder, selectionMode = false, selectedIds, onToggleSelect, onToggleSelectAll,
  onSort, onColumnResize, onView, onEdit, onReorder, onAdvance, onDuplicate, onToggleAbandoned, onToggleTerminate, onDelete,
}: Props) {
  const [widths, setWidths] = useState<Record<string, number>>({})
  useEffect(() => setWidths(Object.fromEntries(configs.map((item) => [item.field_name, item.column_width]))), [configs])
  const layoutConfigs = useMemo(() => configs.map((item) => ({ ...item, column_width: widths[item.field_name] ?? item.column_width })), [configs, widths])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const ids = useMemo(() => items.map((i) => i.id), [items])
  const allSelected = items.length > 0 && items.every((item) => selectedIds?.has(item.id))
  const someSelected = items.some((item) => selectedIds?.has(item.id)) && !allSelected
  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (selectionMode || !over || active.id === over.id) return
    const from = ids.indexOf(Number(active.id))
    const to = ids.indexOf(Number(over.id))
    const next = [...ids]
    next.splice(to, 0, next.splice(from, 1)[0])
    onReorder(next)
  }
  const primary = kind === 'workflow' ? ['Workflow Number', 'workflow_number'] : kind === 'transmittal' ? ['Transmittal Number', 'transmittal_number'] : ['Document Number', 'document_number']
  const primaryField = primary[1] as ColumnField
  const config = (field: ColumnField) => layoutConfigs.find((item) => item.field_name === field)
  const shown = (field: ColumnField) => {
    const item = config(field)
    return kind === 'documents' ? item?.is_visible !== false : kind === 'workflow' ? item?.is_visible_workflow !== false : item?.is_visible_transmittal !== false
  }
  const label = (field: ColumnField, fallback: string) => config(field)?.display_name || fallback
  const resize = (field: ColumnField, width: number, commit = false) => {
    setWidths((previous) => ({ ...previous, [field]: width }))
    if (commit) onColumnResize(field, width)
  }
  const configuredWidth = layoutConfigs
    .filter((item) => (kind === 'documents' ? item.is_visible : kind === 'workflow' ? item.is_visible_workflow : item.is_visible_transmittal))
    .reduce((total, item) => total + item.column_width, 110)
  return (
    <div className="table-scroll">
      <DndContext sensors={sensors} onDragEnd={dragEnd}>
        <table className="package-table configurable-table" style={{ width: configuredWidth, minWidth: '100%' }}>
          <thead>
            <tr>
              {selectionMode ? (
                <th className="select-cell">
                  <label className="row-checkbox">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected }}
                      onChange={() => onToggleSelectAll?.()}
                      aria-label="Select all documents on this page"
                    />
                    <i />
                  </label>
                </th>
              ) : (
                <th className="drag-cell" />
              )}
              {shown(primaryField) && <Header label={label(primaryField, primary[0])} field={primaryField} config={config(primaryField)} onResize={resize} {...{ sortBy, sortOrder, onSort }} />}
              {kind !== 'documents' && shown('document_number') && <Header label={label('document_number', 'Document Number')} field="document_number" config={config('document_number')} onResize={resize} {...{ sortBy, sortOrder, onSort }} />}
              {shown('document_title') && <Header label={label('document_title', 'Document Title')} field="document_title" config={config('document_title')} onResize={resize} {...{ sortBy, sortOrder, onSort }} />}
              {shown('document_date') && <Header label={label('document_date', 'Date')} field="document_date" config={config('document_date')} onResize={resize} {...{ sortBy, sortOrder, onSort }} />}
              {shown('document_type') && <Header label={label('document_type', 'Document Type')} field="document_type" config={config('document_type')} onResize={resize} {...{ sortBy, sortOrder, onSort }} />}
              {shown('initiator') && <Header label={label('initiator', 'Initiator')} field="initiator" config={config('initiator')} onResize={resize} {...{ sortBy, sortOrder, onSort }} />}
              {shown('discipline') && <Header label={label('discipline', 'Discipline')} field="discipline" config={config('discipline')} onResize={resize} {...{ sortBy, sortOrder, onSort }} />}
              {shown('number_of_documents') && <Header label={label('number_of_documents', 'Docs')} field="number_of_documents" config={config('number_of_documents')} onResize={resize} {...{ sortBy, sortOrder, onSort }} />}
              {primaryField !== 'transmittal_number' && shown('transmittal_number') && <Header label={label('transmittal_number', 'Transmittal No.')} field="transmittal_number" config={config('transmittal_number')} onResize={resize} {...{ sortBy, sortOrder, onSort }} />}
              {primaryField !== 'workflow_number' && shown('workflow_number') && <Header label={label('workflow_number', 'Workflow No.')} field="workflow_number" config={config('workflow_number')} onResize={resize} {...{ sortBy, sortOrder, onSort }} />}
              {shown('submission_progress') && <Header label={label('submission_progress', 'Submission Progress')} config={config('submission_progress')} onResize={resize} {...{ sortBy, sortOrder, onSort }} />}
              {shown('feedback') && <Header label={label('feedback', 'Feedback')} config={config('feedback')} onResize={resize} {...{ sortBy, sortOrder, onSort }} />}
              <th />
            </tr>
          </thead>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <tbody>
              {items.map((item) => (
                <SortableRow
                  key={item.id}
                  highlighted={item.id === highlightedPackageId}
                  selectionMode={selectionMode}
                  selected={!!selectedIds?.has(item.id)}
                  onToggleSelect={onToggleSelect}
                  {...{ item, kind, configs: layoutConfigs, submissionSteps, feedbackReviewers, feedbackStatusLabels, feedbackStatusColors, onView, onEdit, onAdvance, onDuplicate, onToggleAbandoned, onToggleTerminate, onDelete }}
                />
              ))}
            </tbody>
          </SortableContext>
        </table>
      </DndContext>
    </div>
  )
}
