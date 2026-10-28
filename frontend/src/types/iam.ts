export type PermissionCode =
  | 'packages:read'
  | 'packages:write'
  | 'packages:delete'
  | 'settings:write'
  | 'metadata:export'
  | 'metadata:import'
  | 'notifications:read'
  | 'notifications:subscribe'
  | 'notifications:write'
  | 'notifications:manage'
  | 'iam:read'
  | 'iam:write'

export interface Role {
  id: number
  slug: string
  name: string
  description: string
  is_system: boolean
  permissions: string[]
}

export interface AuthUser {
  id: number
  username: string
  email: string | null
  display_name: string
  is_active: boolean
  must_change_password: boolean
  password_locked: boolean
  all_projects: boolean
  read_only_projects: string[]
  project_codes: string[]
  roles: Role[]
  permissions: string[]
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface UserList {
  items: AuthUser[]
  total: number
}

export interface UserCreateInput {
  username: string
  display_name: string
  email?: string | null
  password: string
  role_slugs: string[]
  all_projects: boolean
  read_only_projects: string[]
  project_codes: string[]
  must_change_password: boolean
}

export interface UserUpdateInput {
  display_name?: string
  email?: string | null
  is_active?: boolean
  role_slugs?: string[]
  all_projects?: boolean
  read_only_projects?: string[]
  project_codes?: string[]
}

export interface AuditEvent {
  id: number
  actor_user_id: number | null
  actor_username: string | null
  action: string
  target_type: string | null
  target_id: string | null
  detail: string
  ip_address: string | null
  created_at: string
}

export interface AuditEventList {
  items: AuditEvent[]
  total: number
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return parts.map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export function roleLabel(user: AuthUser | null | undefined): string {
  return user?.roles[0]?.name || 'Signed in'
}

export function hasPermission(user: AuthUser | null | undefined, code: PermissionCode | string, project?: string): boolean {
  if (!user?.permissions.includes(code)) return false
  const readOnly = user.read_only_projects || []
  if ((code === 'settings:write' || code === 'metadata:import') && readOnly.length) return false
  if (project) {
    if (!user.all_projects && !user.project_codes.includes(project)) return false
    if (readOnly.includes(project) && ['packages:write', 'packages:delete', 'notifications:write', 'notifications:manage'].includes(code)) return false
  }
  return true
}
