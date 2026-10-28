import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { closestCenter, DndContext, type CollisionDetection, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { horizontalListSortingStrategy, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Columns3 } from 'lucide-react'
import type { ColumnConfig, ColumnField, FeedbackStatusCode, Package, PageKind, RegisterColumnField } from '../../types/package'
import { moveVisibleRegisterColumn, primaryRegisterColumn, registerColumns } from '../../lib/columns'
import { SyncedHorizontalScroll } from '../common/SyncedHorizontalScroll'
import { PackageColumnHeader } from './PackageColumnHeader'
import { PackageColumnChooser, type ColumnMenuAnchor } from './PackageColumnChooser'
import { PackageTableRow, type PackageRowActions } from './PackageTableRow'

interface Props extends PackageRowActions {
  items: Package[]
  highlightedPackageId: number | null
  kind: PageKind
  configs: ColumnConfig[]
  submissionSteps: readonly string[]
  submissionStepsFor?: (projectCode: string) => readonly string[]
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
  onColumnVisibilityChange: (visibility: Partial<Record<ColumnField, boolean>>) => void
  columnOrder?: RegisterColumnField[]
  onColumnOrderChange: (order: RegisterColumnField[]) => void
  columnVisibilitySaving?: boolean
  columnVisibilityReady?: boolean
  onReorder: (ids: number[]) => void
  canWrite?: boolean
  canDelete?: boolean
  canWriteProject?: (code: string) => boolean
  canDeleteProject?: (code: string) => boolean
}

const registerCollision: CollisionDetection = args => closestCenter({
  ...args,
  droppableContainers: args.droppableContainers.filter(container => container.data.current?.type === args.active.data.current?.type),
})

export function PackageTable({
  items, highlightedPackageId, kind, configs, submissionSteps, submissionStepsFor, feedbackReviewers, feedbackStatusLabels, feedbackStatusColors,
  sortBy, sortOrder, selectionMode = false, selectedIds, onToggleSelect, onToggleSelectAll,
  onSort, onColumnResize, onColumnVisibilityChange, columnOrder = [], onColumnOrderChange, columnVisibilitySaving = false, columnVisibilityReady = true,
  onView, onEdit, onReorder, onAdvance, onDuplicate, onToggleAbandoned, onToggleTerminate, onDelete,
  canWrite = true, canDelete = true, canWriteProject, canDeleteProject,
}: Props) {
  const [widths, setWidths] = useState<Record<string, number>>({})
  const [columnMenu, setColumnMenu] = useState<ColumnMenuAnchor | null>(null)
  const columnButtonRef = useRef<HTMLButtonElement>(null)
  const columnTriggerRef = useRef<HTMLElement | null>(null)
  const pendingHeaderFocusRef = useRef<HTMLElement | null>(null)
  const columnMenuId = useId()
  useEffect(() => setWidths(Object.fromEntries(configs.map((item) => [item.field_name, item.column_width]))), [configs])
  const layoutConfigs = useMemo(() => configs.filter(item => item.field_name !== 'number_of_documents').map((item) => ({ ...item, column_width: widths[item.field_name] ?? item.column_width })), [configs, widths])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const ids = useMemo(() => items.map((i) => i.id), [items])
  const rowIds = useMemo(() => ids.map(id => `row:${id}`), [ids])
  const canReorder = canWrite && items.every(item => !canWriteProject || canWriteProject(item.project_code))
  const allSelected = items.length > 0 && items.every((item) => selectedIds?.has(item.id))
  const someSelected = items.some((item) => selectedIds?.has(item.id)) && !allSelected
  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (active.data.current?.type === 'column') {
      if (!canMoveColumns || !over || active.id === over.id) return
      const field = active.data.current.field as RegisterColumnField
      const target = over.data.current?.field as RegisterColumnField
      if (visibleFields.includes(field) && visibleFields.includes(target)) saveColumnOrder(moveVisibleRegisterColumn(orderedFields, visibleFields, field, target), field)
      return
    }
    if (!canReorder || selectionMode || !over || active.id === over.id) return
    const from = ids.indexOf(Number(String(active.id).slice(4)))
    const to = ids.indexOf(Number(String(over.id).slice(4)))
    if (from < 0 || to < 0) return
    const next = [...ids]
    next.splice(to, 0, next.splice(from, 1)[0])
    onReorder(next)
  }
  const keyboardMove = (id: number, direction: -1 | 1) => {
    if (!canReorder) return
    const from = ids.indexOf(id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= ids.length) return
    const next = [...ids]
    ;[next[from], next[to]] = [next[to], next[from]]
    onReorder(next)
  }
  const primaryField = primaryRegisterColumn(kind)
  const columnChoices = registerColumns(kind, layoutConfigs, columnOrder)
  const visibleColumns = columnChoices.filter(column => column.visible)
  const orderedFields = columnChoices.map(column => column.field)
  const visibleFields = visibleColumns.map(column => column.field)
  const canMoveColumns = columnVisibilityReady && !columnVisibilitySaving
  const saveColumnOrder = (order: RegisterColumnField[], focusField?: RegisterColumnField) => {
    if (!canMoveColumns) return
    pendingHeaderFocusRef.current = focusField ? document.querySelector<HTMLElement>(`th[data-column-field="${focusField}"] .column-drag-handle`) : null
    onColumnOrderChange(order)
  }
  const moveColumn = (field: RegisterColumnField, direction: -1 | 1) => {
    const index = visibleFields.indexOf(field)
    const target = visibleFields[index + direction]
    if (index >= 0 && target) saveColumnOrder(moveVisibleRegisterColumn(orderedFields, visibleFields, field, target), field)
  }
  useLayoutEffect(() => {
    if (columnVisibilitySaving || !pendingHeaderFocusRef.current) return
    const control = pendingHeaderFocusRef.current
    if (control.isConnected && document.activeElement === document.body) control.focus({ preventScroll: true })
    pendingHeaderFocusRef.current = null
  }, [columnVisibilitySaving, columnOrder])
  const closeColumnMenu = (restoreFocus = true) => {
    setColumnMenu(null)
    if (restoreFocus) {
      const trigger = columnTriggerRef.current
      ;(trigger?.isConnected ? trigger : columnButtonRef.current)?.focus({ preventScroll: true })
    }
  }
  const openHeaderColumns = (target: HTMLElement, x: number, y: number) => {
    const header = target.closest<HTMLTableCellElement>('th')
    columnTriggerRef.current = header?.querySelector<HTMLButtonElement>('button') || (header?.tabIndex === 0 ? header : columnButtonRef.current)
    setColumnMenu({ x, y, field: header?.dataset.columnField as ColumnField | undefined })
  }
  const resize = (field: ColumnField, width: number, commit = false) => {
    setWidths((previous) => ({ ...previous, [field]: width }))
    if (commit) onColumnResize(field, width)
  }
  const configuredWidth = visibleColumns.reduce((total, column) => total + (column.config?.column_width || 0), 110)
  const visibilityKey = layoutConfigs
    .map((item) => `${item.field_name}:${item.column_width}:${item.is_visible}:${item.is_visible_workflow}:${item.is_visible_transmittal}`)
    .join('|')
  return (
    <>
      <div className="column-visibility-toolbar">
        <span>Drag column handles to reorder. Right-click a heading to choose columns.</span>
        <button
          type="button"
          ref={columnButtonRef}
          className="secondary-button"
          aria-haspopup="dialog"
          aria-expanded={!!columnMenu}
          aria-controls={columnMenu ? columnMenuId : undefined}
          onClick={event => {
            if (columnMenu) { closeColumnMenu(); return }
            const rect = event.currentTarget.getBoundingClientRect()
            columnTriggerRef.current = event.currentTarget
            setColumnMenu({ x: rect.right - 300, y: rect.bottom + 6 })
          }}
        ><Columns3 size={16} aria-hidden="true" />Columns</button>
      </div>
      {columnMenu && (
        <PackageColumnChooser
          id={columnMenuId}
          anchor={columnMenu}
          choices={columnChoices}
          ready={columnVisibilityReady}
          saving={columnVisibilitySaving}
          orderCustomized={columnOrder.length > 0}
          buttonRef={columnButtonRef}
          onChange={onColumnVisibilityChange}
          onOrderChange={saveColumnOrder}
          onClose={closeColumnMenu}
        />
      )}
      <SyncedHorizontalScroll
        deps={[configuredWidth, visibilityKey, orderedFields.join('|'), items.length, selectionMode, kind]}
        aria-label="Document register table"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={registerCollision}
          onDragEnd={dragEnd}
          accessibility={{ screenReaderInstructions: { draggable: 'To move a column, focus its handle and use Alt plus Left or Right arrow keys. To move a document row, focus its handle and use Alt plus Up or Down arrow keys.' } }}
        >
          <table className="package-table configurable-table" style={{ width: configuredWidth, minWidth: '100%' }}>
            <caption className="sr-only">Document register</caption>
            <thead
              onContextMenu={event => {
                event.preventDefault()
                openHeaderColumns(event.target as HTMLElement, event.clientX, event.clientY)
              }}
              onKeyDown={event => {
                if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
                event.preventDefault()
                const target = event.target as HTMLElement
                const rect = target.getBoundingClientRect()
                openHeaderColumns(target, rect.left, rect.bottom + 6)
              }}
            >
              <SortableContext items={visibleFields.map(field => `column:${field}`)} strategy={horizontalListSortingStrategy}>
              <tr>
                {selectionMode ? (
                  <th className="select-cell" scope="col">
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
                  <th className="drag-cell" scope="col"><span className="sr-only">Reorder</span></th>
                )}
                {visibleColumns.map(choice => (
                  <PackageColumnHeader
                    key={choice.field}
                    label={choice.label}
                    columnField={choice.field}
                    field={choice.field === 'submission_progress' || choice.field === 'feedback' ? undefined : choice.field}
                    config={choice.config}
                    onResize={resize}
                    orderReady={canMoveColumns}
                    onMove={moveColumn}
                    onChooseColumns={target => {
                      const rect = target.getBoundingClientRect()
                      openHeaderColumns(target, rect.left, rect.bottom + 6)
                    }}
                    {...{ sortBy, sortOrder, onSort }}
                  />
                ))}
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
              </SortableContext>
            </thead>
            <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
              <tbody>
                {items.map((item) => (
                  <PackageTableRow
                    key={item.id}
                    highlighted={item.id === highlightedPackageId}
                    selectionMode={selectionMode}
                    selected={!!selectedIds?.has(item.id)}
                    onToggleSelect={onToggleSelect}
                    onKeyboardMove={keyboardMove}
                    {...{ item, columns: visibleColumns, primaryField, submissionSteps, submissionStepsFor, feedbackReviewers, feedbackStatusLabels, feedbackStatusColors, onView, onEdit, onAdvance, onDuplicate, onToggleAbandoned, onToggleTerminate, onDelete }}
                    canWrite={canWrite && (!canWriteProject || canWriteProject(item.project_code))}
                    canDelete={canDelete && (!canDeleteProject || canDeleteProject(item.project_code))}
                    canReorder={canReorder}
                  />
                ))}
              </tbody>
            </SortableContext>
          </table>
        </DndContext>
      </SyncedHorizontalScroll>
    </>
  )
}
