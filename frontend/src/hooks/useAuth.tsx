import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authApi } from '../lib/api'
import { hasPermission, type AuthUser, type PermissionCode } from '../types/iam'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthUser>
  refreshUser: () => Promise<AuthUser | null>
  can: (permission: PermissionCode | string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const current = await authApi.me()
      setUser(current)
      return current
    } catch {
      setUser(null)
      return null
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const current = await authApi.me()
        if (active) setUser(current)
      } catch {
        try {
          const current = await authApi.refresh()
          if (active) setUser(current)
        } catch {
          if (active) setUser(null)
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    const onUnauthorized = () => setUser(null)
    window.addEventListener('docflow:unauthorized', onUnauthorized)
    return () => {
      active = false
      window.removeEventListener('docflow:unauthorized', onUnauthorized)
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const current = await authApi.login(username, password)
    setUser(current)
    return current
  }, [])

  const logout = useCallback(async () => {
    try { await authApi.logout() } catch { /* still clear local session */ }
    setUser(null)
  }, [])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const current = await authApi.changePassword(currentPassword, newPassword)
    setUser(current)
    return current
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login,
    logout,
    changePassword,
    refreshUser,
    can: (permission) => hasPermission(user, permission),
  }), [user, loading, login, logout, changePassword, refreshUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
