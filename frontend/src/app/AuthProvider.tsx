import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { authApi, authSession, setAuthAccountId, wasExplicitlySignedOut } from '../lib/httpClient'
import { AuthSessionChangedError } from '../lib/authSession'
import { hasPermission, type AuthUser } from '../types/iam'
import { ErrorState } from '../components/common/PageState'
import { AuthContext, type AuthContextValue } from '../hooks/useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState(false)
  const userRef = useRef<AuthUser | null>(null)
  const commitUser = useCallback((current: AuthUser | null) => {
    userRef.current = current
    setAuthAccountId(current?.id ?? null)
    setUser(current)
  }, [])

  const restoreUser = useCallback(async (isActive: () => boolean = () => true) => {
    const generation = authSession.generation()
    if (wasExplicitlySignedOut()) {
      if (isActive()) { commitUser(null); setSessionError(false); setLoading(false) }
      return null
    }
    if (!userRef.current) setLoading(true)
    setSessionError(false)
    try {
      const current = await authApi.me()
      if (!isActive() || !authSession.isCurrent(generation)) return null
      const access = (value: AuthUser | null) => value && JSON.stringify([value.id, value.permissions, value.all_projects, value.project_codes, value.read_only_projects])
      if (userRef.current && current.id !== userRef.current.id) authSession.advance()
      if (access(current) !== access(userRef.current)) queryClient.clear()
      commitUser(current)
      setLoading(false)
      return current
    } catch (error) {
      if (isActive() && authSession.isCurrent(generation) && !(error instanceof AuthSessionChangedError) && !userRef.current) setSessionError(true)
      return null
    } finally {
      if (isActive() && authSession.isCurrent(generation)) setLoading(false)
    }
  }, [queryClient, commitUser])
  const refreshUser = useCallback(() => restoreUser(), [restoreUser])

  useEffect(() => {
    let active = true
    const clearSession = () => { queryClient.clear(); commitUser(null); setSessionError(false); setLoading(false) }
    const onUnauthorized = (event: Event) => {
      if ((event as CustomEvent<{ generation: number }>).detail?.generation === authSession.generation()) clearSession()
    }
    const onSessionChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ generation: number; signedOut: boolean }>).detail
      if (detail?.generation !== authSession.generation()) return
      clearSession()
      if (!detail.signedOut) void restoreUser(() => active)
    }
    window.addEventListener('docflow:unauthorized', onUnauthorized)
    window.addEventListener('docflow:session-changed', onSessionChanged)
    void restoreUser(() => active)
    return () => {
      active = false
      window.removeEventListener('docflow:unauthorized', onUnauthorized)
      window.removeEventListener('docflow:session-changed', onSessionChanged)
    }
  }, [queryClient, commitUser, restoreUser])

  const login = useCallback(async (username: string, password: string) => {
    const pending = authApi.login(username, password)
    const generation = authSession.generation()
    const current = await pending
    if (!authSession.isCurrent(generation)) throw new AuthSessionChangedError()
    queryClient.clear()
    commitUser(current)
    setSessionError(false)
    setLoading(false)
    return current
  }, [queryClient, commitUser])

  const logout = useCallback(async () => {
    const pending = authApi.logout()
    const generation = authSession.generation()
    try { await pending } catch (error) {
      if (authSession.isCurrent(generation) && !(error instanceof AuthSessionChangedError)) toast.error('Signed out on this browser. Server sign-out could not be confirmed.')
    }
  }, [])

  const accountId = user?.id
  useEffect(() => {
    if (!accountId) return
    let active = true
    const update = () => { void restoreUser(() => active) }
    const timer = window.setInterval(update, 30_000)
    window.addEventListener('focus', update)
    return () => {active = false; window.clearInterval(timer); window.removeEventListener('focus', update)}
  }, [accountId, restoreUser])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const pending = authApi.changePassword(currentPassword, newPassword)
    const generation = authSession.generation()
    const current = await pending
    if (!authSession.isCurrent(generation)) throw new AuthSessionChangedError()
    commitUser(current)
    queryClient.invalidateQueries()
    return current
  }, [commitUser, queryClient])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    login,
    logout,
    changePassword,
    refreshUser,
    can: (permission, project) => hasPermission(user, permission, project),
  }), [user, loading, login, logout, changePassword, refreshUser])

  return <AuthContext.Provider value={value}>{loading && !user
    ? <div className="auth-loading">Restoring your session…</div>
    : sessionError && !user
      ? <div className="auth-loading"><ErrorState title="Could not restore your session" message="Check your connection and try again. Your saved sign-in has not been cleared." retry={() => { void refreshUser() }} /></div>
      : <Fragment key={user?.id ?? 'signed-out'}>{children}</Fragment>}</AuthContext.Provider>
}
