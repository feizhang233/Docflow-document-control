import type { WorkflowNotification } from '../types/package'

export function notificationDestination(item: WorkflowNotification, viewOnly: boolean) {
  const focus = item.document_number || item.workflow_number
  const params = new URLSearchParams({
    ...(focus ? { focus } : {}),
    notification: String(item.id),
    ...(item.package_id ? { package: String(item.package_id) } : {}),
    ...(item.project_code ? { project: item.project_code } : {}),
  })
  return { pathname: viewOnly || item.notification_type === 'submission_progress' ? '/documents/all' : '/workflow', search: `?${params}` }
}

export function notificationDate(value: string) {
  return new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`)
}
