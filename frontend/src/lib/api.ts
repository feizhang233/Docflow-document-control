import axios from 'axios'
import type { AuditEventList, AuthUser, Permission, Role, UserCreateInput, UserList, UserUpdateInput } from '../types/iam'
import type { ColumnConfig, CsvImportRow, MetadataBackup, NotificationList, Package, PackageInput, PackageListResponse, Period, ProjectCode, ProjectConfig, TransmittalSuggestions, WorkflowCommentList, WorkflowConfig } from '../types/package'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 12_000,
  withCredentials: true,
})

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as { url?: string; _retry?: boolean } | undefined
    const url = original?.url || ''
    if (error.response?.status === 401 && original && !original._retry && !url.includes('/auth/')) {
      original._retry = true
      try {
        await client.post('/auth/refresh')
        return client(original)
      } catch {
        window.dispatchEvent(new Event('docflow:unauthorized'))
      }
    }
    return Promise.reject(error)
  },
)

export const authApi = {
  login: async (username: string, password: string) => (await client.post<AuthUser>('/auth/login', { username, password })).data,
  logout: async () => client.post('/auth/logout'),
  me: async () => (await client.get<AuthUser>('/auth/me')).data,
  refresh: async () => (await client.post<AuthUser>('/auth/refresh')).data,
  changePassword: async (current_password: string, new_password: string) => (await client.post<AuthUser>('/auth/change-password', { current_password, new_password })).data,
}

export const iamApi = {
  listUsers: async () => (await client.get<UserList>('/iam/users')).data,
  createUser: async (data: UserCreateInput) => (await client.post<AuthUser>('/iam/users', data)).data,
  updateUser: async (id: number, data: UserUpdateInput) => (await client.patch<AuthUser>(`/iam/users/${id}`, data)).data,
  resetPassword: async (id: number, password: string, must_change_password = true) => (await client.post<AuthUser>(`/iam/users/${id}/reset-password`, { password, must_change_password })).data,
  listRoles: async () => (await client.get<Role[]>('/iam/roles')).data,
  listPermissions: async () => (await client.get<Permission[]>('/iam/permissions')).data,
  listAudit: async (limit = 40) => (await client.get<AuditEventList>('/iam/audit', { params: { limit } })).data,
}

interface ListParams {
  period?: Period
  project_code?: ProjectCode
  search?: string
  discipline?: string
  document_type?: string
  transmittal_prefix?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

export const packagesApi = {
  list: async (params: ListParams) => (await client.get<PackageListResponse>('/packages', { params })).data,
  transmittals: async (project_code: ProjectCode) => (await client.get<TransmittalSuggestions>('/packages/transmittals', { params: { project_code } })).data,
  get: async (id: number) => (await client.get<Package>(`/packages/${id}`)).data,
  listWorkflowComments: async (id: number) => (await client.get<WorkflowCommentList>(`/packages/${id}/workflow-comments`)).data,
  listAll: async (params: Omit<ListParams,'page'|'page_size'> = {}) => {
    const first=(await client.get<PackageListResponse>('/packages',{params:{...params,page:1,page_size:200}})).data
    if(first.items.length>=first.total)return first
    const pages=Array.from({length:Math.ceil(first.total/200)-1},(_,index)=>index+2)
    const rest=await Promise.all(pages.map(page=>client.get<PackageListResponse>('/packages',{params:{...params,page,page_size:200}}).then(response=>response.data.items)))
    return {...first,items:[...first.items,...rest.flat()],page_size:first.total}
  },
  create: async (data: PackageInput) => (await client.post<Package>('/packages', data)).data,
  update: async (id: number, data: Partial<PackageInput>) => (await client.patch<Package>(`/packages/${id}`, data)).data,
  remove: async (id: number) => client.delete(`/packages/${id}`),
  reorder: async ({ids,startIndex}:{ids:number[];startIndex:number}) => client.post('/packages/reorder', { package_ids: ids, start_index:startIndex }),
  duplicate: async (id: number) => (await client.post<Package>(`/packages/${id}/duplicate`)).data,
}

export const settingsApi = {
  listColumns: async () => (await client.get<ColumnConfig[]>('/settings/columns')).data,
  updateColumn: async (field: string, data: Pick<ColumnConfig, 'display_name'|'is_visible'|'column_width'|'input_type'|'options'|'option_colors'> & Partial<Pick<ColumnConfig, 'share_options'|'project_options'|'project_option_colors'>>) => (await client.put<ColumnConfig>(`/settings/columns/${field}`, data)).data,
  updateColumnVisibility: async (field: string, register: 'workflow'|'transmittal', is_visible: boolean) => (await client.put<ColumnConfig>(`/settings/columns/${field}/visibility`, {is_visible}, {params:{register}})).data,
  resetColumns: async () => (await client.post<ColumnConfig[]>('/settings/columns/reset')).data,
  getWorkflow: async () => (await client.get<WorkflowConfig>('/settings/workflow')).data,
  updateWorkflow: async (data: Pick<WorkflowConfig,'submission_steps'|'project_submission_steps'|'feedback_reviewers'|'feedback_status_labels'|'feedback_status_colors'|'transmittal_prefixes'>) => (await client.put<WorkflowConfig>('/settings/workflow', data)).data,
  getProjects: async () => (await client.get<ProjectConfig>('/settings/projects')).data,
  updateProjects: async (data: {projects: Array<{id?: number; code: string; name: string}>}) => (await client.put<ProjectConfig>('/settings/projects', data)).data,
}

export const metadataApi = {
  export: async () => (await client.get<MetadataBackup>('/metadata/export')).data,
  import: async (data: MetadataBackup, mode: 'merge'|'replace') => (await client.post('/metadata/import', data, { params: { mode } })).data,
  importCsv: async (rows: CsvImportRow[], mode: 'merge'|'replace') => (await client.post('/metadata/import-csv', { rows }, { params: { mode } })).data,
}

export const notificationsApi = {
  list: async (limit=30) => (await client.get<NotificationList>('/notifications',{params:{limit}})).data,
  listWorkflowFeedback: async (packageId:number,limit=20) => (await client.get<NotificationList>('/notifications',{params:{limit,package_id:packageId,notification_type:'workflow_feedback'}})).data,
  markRead: async (id: number) => client.patch(`/notifications/${id}/read`),
  markAllRead: async () => client.patch('/notifications/read-all'),
  clear: async () => client.delete('/notifications'),
}

function formatApiDetail(detail: unknown): string | null {
  if (detail == null) return null
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        const entry = item as { loc?: unknown[]; msg?: unknown }
        const path = Array.isArray(entry.loc)
          ? entry.loc.filter((part) => part !== 'body').join('.')
          : ''
        const message = typeof entry.msg === 'string' ? entry.msg : 'Invalid value'
        return path ? `${path}: ${message}` : message
      }
      return null
    }).filter(Boolean)
    return messages.length ? messages.join('; ') : null
  }
  if (typeof detail === 'object') {
    try { return JSON.stringify(detail) } catch { return 'Request failed' }
  }
  return String(detail)
}

export const getApiError = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    return formatApiDetail(error.response?.data?.detail) || error.message || 'Request failed'
  }
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred.'
}
