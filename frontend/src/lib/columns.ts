import type { ColumnConfig, PageKind, RegisterColumnField } from '../types/package'

export interface RegisterColumn {
  field: RegisterColumnField
  label: string
  visible: boolean
  config?: ColumnConfig
}

const registerColumnLabels: Record<RegisterColumnField, string> = {
  document_number: 'Document Number',
  document_title: 'Document Title',
  document_date: 'Date',
  document_type: 'Document Type',
  initiator: 'Initiator',
  discipline: 'Discipline',
  transmittal_number: 'Transmittal No.',
  workflow_number: 'Workflow No.',
  submission_progress: 'Submission Progress',
  feedback: 'Feedback',
}

export function primaryRegisterColumn(kind: PageKind): RegisterColumnField {
  return kind === 'workflow' ? 'workflow_number' : kind === 'transmittal' ? 'transmittal_number' : 'document_number'
}

/** Keep every data column, including hidden ones, exactly once. */
export function registerColumnOrder(kind: PageKind, saved: readonly RegisterColumnField[] = []): RegisterColumnField[] {
  const primary = primaryRegisterColumn(kind)
  const defaults: RegisterColumnField[] = [
    primary,
    ...(kind !== 'documents' ? ['document_number' as const] : []),
    'document_title', 'document_date', 'document_type', 'initiator', 'discipline',
    ...(primary !== 'transmittal_number' ? ['transmittal_number' as const] : []),
    ...(primary !== 'workflow_number' ? ['workflow_number' as const] : []),
    'submission_progress', 'feedback',
  ]
  return Array.from(new Set([...saved.filter(field => defaults.includes(field)), ...defaults]))
}

/** One column model keeps headings, row cells and the chooser in the same order. */
export function registerColumns(kind: PageKind, configs: readonly ColumnConfig[], saved: readonly RegisterColumnField[] = []): RegisterColumn[] {
  const configMap = new Map(configs.map(config => [config.field_name, config]))
  const primary = primaryRegisterColumn(kind)
  const primaryLabel = kind === 'workflow' ? 'Workflow Number' : kind === 'transmittal' ? 'Transmittal Number' : 'Document Number'
  const visibilityKey = kind === 'documents' ? 'is_visible' : kind === 'workflow' ? 'is_visible_workflow' : 'is_visible_transmittal'
  return registerColumnOrder(kind, saved).map(field => {
    const config = configMap.get(field)
    return {
      field,
      label: config?.display_name || (field === primary ? primaryLabel : registerColumnLabels[field]),
      visible: config?.[visibilityKey] !== false,
      config,
    }
  })
}

export function columnWidthStyle(config?: ColumnConfig) {
  return config ? { width: config.column_width, minWidth: config.column_width, maxWidth: config.column_width } : undefined
}

/** Drag only visible columns through visible slots; hidden columns retain their slots. */
export function moveVisibleRegisterColumn(
  order: readonly RegisterColumnField[],
  visible: readonly RegisterColumnField[],
  active: RegisterColumnField,
  target: RegisterColumnField,
): RegisterColumnField[] {
  const from = visible.indexOf(active)
  const to = visible.indexOf(target)
  if (from < 0 || to < 0 || from === to) return [...order]
  const moved = [...visible]
  moved.splice(to, 0, moved.splice(from, 1)[0])
  const visibleSet = new Set(visible)
  let index = 0
  return order.map(field => visibleSet.has(field) ? moved[index++] : field)
}
