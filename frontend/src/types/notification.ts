export const emailEventLabels = {
  document: 'Document changes',
  submission_progress: 'Submission Progress',
  workflow_feedback: 'Workflow Feedback',
  workflow_comments: 'Comments',
} as const

export type EmailEventType = keyof typeof emailEventLabels
export interface EmailSubscription {
  id: number
  project_code: string
  email: string
  event_types: EmailEventType[]
  is_active: boolean
  created_at: string
  last_delivery_status: string | null
  last_delivery_at: string | null
  last_error: string | null
  failed_count: number
  pending_count: number
}
export interface EmailSubscriptionList {
  items: EmailSubscription[]
  total: number
  mail_configured: boolean
  address_count: number
  address_limit: number
}
