import { createContext, useContext } from 'react'
import type { AuthUser, PermissionCode } from '../types/iam'

export interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthUser>
  refreshUser: () => Promise<AuthUser | null>
  can: (permission: PermissionCode | string, project?: string) => boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
