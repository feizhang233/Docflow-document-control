import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Ban, Copy, Eye, GripVertical, MoreHorizontal, OctagonX, Paperclip, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import type { FeedbackStatusCode, Package, RegisterColumnField } from '../../types/package'
import { columnWidthStyle, type RegisterColumn } from '../../lib/columns'
import { columnOptionColorsFor } from '../../lib/projects'
import { useDismissableLayer } from '../../hooks/useDismissableLayer'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { ProgressTrack } from '../common/ProgressTrack'
import { StatusBadge } from '../common/StatusBadge'
import { FeedbackStatus } from './FeedbackStatus'

export interface PackageRowActions {
  onView: (item: Package) => void
  onEdit: (item: Package) => void
  onAdvance?: (item: Package) => void
  onDuplicate: (item: Package) => void
  onToggleAbandoned: (item: Package) => void
  onToggleTerminate: (item: Package) => void
  onDelete: (item: Package) => void | Promise<unknown>
}

interface RowProps extends PackageRowActions {
  item: Package
  highlighted: boolean
  columns: RegisterColumn[]
  primaryField: RegisterColumnField
  submissionSteps: readonly string[]
  submissionStepsFor?: (projectCode: string) => readonly string[]
  feedbackReviewers: readonly string[]
  feedbackStatusLabels: Record<FeedbackStatusCode, string>
  feedbackStatusColors: Record<FeedbackStatusCode, string>
  selectionMode: boolean
  selected: boolean
  onToggleSelect?: (id: number) => void
  onKeyboardMove: (id: number, direction: -1 | 1) => void
  canWrite?: boolean
  canDelete?: boolean
  canReorder?: boolean
}

function RowMenu({
  item,
  onDuplicate,
  onToggleAbandoned,
  onToggleTerminate,
  onDelete,
  canWrite = true,
  canDelete = true,
}: {
  item: Package
  onDuplicate: (item: Package) => void
  onToggleAbandoned: (item: Package) => void
  onToggleTerminate: (item: Package) => void
  onDelete: (item: Package) => void | Promise<unknown>
  canWrite?: boolean
  canDelete?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const menuRef = useDismissableLayer<HTMLDivElement>(menuOpen && !deleteOpen, () => setMenuOpen(false), [popoverRef])

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
    <>
      <div className="row-menu" ref={menuRef}>
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
            className="row-menu-popover"
            style={{
              position: 'fixed',
              top: coords.openUp ? undefined : coords.top,
              bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              right: 'auto',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {canWrite && <button onClick={() => { setMenuOpen(false); onDuplicate(item) }}><Copy />Duplicate document</button>}
            {canWrite && <button onClick={() => { setMenuOpen(false); onToggleAbandoned(item) }}>
              {item.is_abandoned ? <RotateCcw /> : <Ban />}
              {item.is_abandoned ? 'Restore submission' : 'Abandon submission'}
            </button>}
            {canWrite && <button onClick={() => { setMenuOpen(false); onToggleTerminate(item) }}>
              {item.workflow_terminated ? <RotateCcw /> : <OctagonX />}
              {item.workflow_terminated ? 'Reopen workflow' : 'Terminate workflow'}
            </button>}
            {canDelete && <button
              className="danger"
              onClick={() => {
                setMenuOpen(false)
                setDeleteOpen(true)
              }}
            >
              <Trash2 />Delete document
            </button>}
          </div>,
          document.body,
        )}
      </div>
      <ConfirmDialog
        open={deleteOpen}
        title={`Permanently delete ${item.document_number}?`}
        description={<>This removes the document from its register and related DocFlow views. <strong>This action cannot be undone.</strong></>}
        confirmLabel="Delete document"
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => onDelete(item)}
      />
    </>
  )
}

export function PackageTableRow({
  item, highlighted, columns, primaryField, submissionSteps, submissionStepsFor, feedbackReviewers, feedbackStatusLabels, feedbackStatusColors,
  selectionMode, selected, onToggleSelect, onView, onEdit, onAdvance, onDuplicate, onToggleAbandoned, onToggleTerminate, onDelete, onKeyboardMove, canWrite = true, canDelete = true, canReorder = true,
}: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `row:${item.id}`, disabled: selectionMode || !canReorder, data: { type: 'row' } })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const renderCell = ({ field, config }: RegisterColumn) => {
    let className: string | undefined
    let content: ReactNode
    switch (field) {
      case 'document_number':
      case 'transmittal_number':
      case 'workflow_number': {
        const identifier = field === 'document_number' || field === primaryField
        className = identifier ? 'identifier-cell' : 'mono-cell'
        content = identifier ? <strong>{item[field] || '—'}</strong> : item[field] || '—'
        break
      }
      case 'document_title':
        className = 'document-title-cell'
        content = item.document_title || '—'
        break
      case 'document_date':
        className = 'mono-cell'
        content = item.has_attachment ? <span className="attachment-label"><Paperclip /> Attachment</span> : item.document_date
        break
      case 'document_type':
        content = <StatusBadge status={item.document_type} color={columnOptionColorsFor(config, item.project_code)[item.document_type]} />
        break
      case 'initiator':
        content = <div className="person-cell"><span>{item.initiator.split(' ').map((s) => s[0]).join('').slice(0, 2)}</span>{item.initiator}</div>
        break
      case 'discipline':
        content = item.discipline
        break
      case 'submission_progress':
        className = 'progress-cell'
        content = <ProgressTrack steps={submissionStepsFor?.(item.project_code) || submissionSteps} values={item.submission_progress} disabled={item.is_abandoned} onAdvance={canWrite && onAdvance ? () => onAdvance(item) : undefined} />
        break
      case 'feedback':
        className = 'progress-cell feedback'
        content = <FeedbackStatus item={item} reviewers={feedbackReviewers} statusLabels={feedbackStatusLabels} statusColors={feedbackStatusColors} compact />
        break
    }
    return <td key={field} data-column-field={field} className={className} style={columnWidthStyle(config)}>{content}</td>
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
        <td className="drag-cell">
          {canReorder ? (
            <button
              type="button"
              disabled={!canReorder}
              {...attributes}
              {...listeners}
              aria-label="Drag to reorder. Use Alt and arrow keys for keyboard reordering."
              onKeyDown={(event) => {
                if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
                event.preventDefault()
                onKeyboardMove(item.id, event.key === 'ArrowUp' ? -1 : 1)
              }}
            ><GripVertical size={16} /></button>
          ) : null}
        </td>
      )}
      {columns.map(renderCell)}
      <td className="action-cell">
        <button onClick={(event) => { event.stopPropagation(); onView(item) }} aria-label="View document"><Eye size={17} /></button>
        {canWrite && <button onClick={(event) => { event.stopPropagation(); onEdit(item) }} aria-label="Edit document"><Pencil size={16} /></button>}
        {(canWrite || canDelete) && <RowMenu item={item} onDuplicate={onDuplicate} onToggleAbandoned={onToggleAbandoned} onToggleTerminate={onToggleTerminate} onDelete={onDelete} canWrite={canWrite} canDelete={canDelete} />}
      </td>
    </tr>
  )
}
