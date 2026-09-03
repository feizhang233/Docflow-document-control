export type PermissionCode =
  | 'packages:read'
  | 'packages:write'
  | 'packages:delete'
  | 'settings:write'
  | 'metadata:export'
  | 'metadata:import'
  | 'notifications:read'
  | 'notifications:write'
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

export interface Permission {
  id: number
  code: string
  name: string
  category: string
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
  project_codes: string[]
  must_change_password: boolean
}

export interface UserUpdateInput {
  display_name?: string
  email?: string | null
  is_active?: boolean
  role_slugs?: string[]
  all_projects?: boolean
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

export function hasPermission(user: AuthUser | null | undefined, code: PermissionCode | string): boolean {
  return !!user?.permissions.includes(code)
}
