export const submissionSteps = [
  'Transmittal Preparation', 'DCO Backup', 'Signature Process',
  'Workflow Initiation', 'Email Feedback',
] as const
export const feedbackSteps = ['UTIBER', 'GDS'] as const
export const feedbackStatusLabels = { A:'Approved', B:'Approved with comments', C:'Rejected', P:'Pending' } as const

export type FeedbackStatusCode = keyof typeof feedbackStatusLabels

export interface Package {
  id: number
  document_number: string
  document_title: string
  document_date: string
  document_type: string
  initiator: string
  discipline: string
  number_of_documents: number
  transmittal_number: string | null
  workflow_number: string | null
  workflow_terminated: boolean
  notes: string
  has_attachment: boolean
  is_abandoned: boolean
  submission_progress: Record<string, boolean>
  feedback: Record<string, boolean> & { Terminate: boolean }
  feedback_status: Record<string, FeedbackStatusCode>
  order_index: number
  created_at: string
  updated_at: string
}

export type PackageInput = Omit<Package, 'id' | 'created_at' | 'updated_at'>

export interface PackageListResponse {
  items: Package[]
  total: number
  page: number
  page_size: number
}

export type Period = 'week' | 'month' | 'year' | 'all'
export type PageKind = 'documents' | 'workflow' | 'transmittal'

export type FilterField = 'document_number'|'document_title'|'document_date'|'document_type'|'initiator'|'discipline'|'number_of_documents'|'transmittal_number'|'workflow_number'|'submission_progress'|'feedback'|'has_attachment'|'is_abandoned'|'workflow_terminated'
export interface FilterRule { id: string; field: FilterField; operator: 'contains'|'equals'|'not_equals'; value: string }

export interface ColumnConfig {
  id: number
  field_name: ColumnField
  display_name: string
  is_visible: boolean
  is_visible_workflow: boolean
  is_visible_transmittal: boolean
  column_width: number
  input_type: 'text' | 'select'
  options: string[]
  option_colors: Record<string,string>
  updated_at: string
}

export type InputColumnField = keyof Pick<Package, 'document_number'|'document_title'|'document_date'|'document_type'|'initiator'|'discipline'|'number_of_documents'|'transmittal_number'|'workflow_number'>
export type ColumnField = InputColumnField | 'submission_progress' | 'feedback'

export interface MetadataBackup {
  format_version: '1.0'
  exported_at: string
  packages: Array<Omit<Package, 'id'>>
  column_configs: ColumnConfig[]
  workflow_config: WorkflowConfig
}

export interface CsvImportRow {
  document_number?: string
  document_title?: string
  document_date?: string
  document_type?: string
  initiator?: string
  discipline?: string
  number_of_documents?: number
  transmittal_number?: string | null
  workflow_number?: string | null
  workflow_terminated?: boolean
  has_attachment?: boolean
  is_abandoned?: boolean
  notes?: string
}

export interface WorkflowConfig {
  id: number
  submission_steps: string[]
  feedback_reviewers: string[]
  feedback_status_labels: Record<FeedbackStatusCode,string>
  feedback_status_colors: Record<FeedbackStatusCode,string>
  transmittal_prefixes: string[]
  updated_at: string
}

export interface WorkflowNotification {
  id: number
  package_id: number | null
  notification_type: string
  title: string
  message: string
  workflow_number: string | null
  document_number: string | null
  is_read: boolean
  created_at: string
}

export interface NotificationList {
  items: WorkflowNotification[]
  unread_count: number
}

export interface WorkflowComment {
  id: number
  workflow_number: string
  external_id: string | null
  author: string | null
  body: string
  commented_at: string | null
  order_index: number
  synced_at: string
}

export interface WorkflowCommentList {
  items: WorkflowComment[]
  total: number
}
