import axios, { type InternalAxiosRequestConfig } from 'axios'
import { AuthSessionChangedError, AuthSessionCoordinator } from './authSession'
import type { AuthUser } from '../types/iam'

const clientOptions = {
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 12_000,
  withCredentials: true,
}
export const client = axios.create(clientOptions)
const sessionClient = axios.create(clientOptions)
export const authSession = new AuthSessionCoordinator<AuthUser>(task =>
  typeof navigator !== 'undefined' && navigator.locks?.request
    ? navigator.locks.request('docflow-auth-session', task)
    : task(),
)
const signedOutKey = 'docflow:signed-out'
let signedOut = false
let displayedAccountId: number | null = null

interface SessionRequest extends InternalAxiosRequestConfig {
  _authGeneration?: number
  _authAccountId?: number | null
  _retry?: boolean
}

export const setAuthAccountId = (accountId: number | null) => { displayedAccountId = accountId }
export function wasExplicitlySignedOut() {
  try { return signedOut || localStorage.getItem(signedOutKey) === '1' } catch { return signedOut }
}
function markSignedOut(value: boolean) {
  signedOut = value
  try {
    if (value) localStorage.setItem(signedOutKey, '1')
    else localStorage.removeItem(signedOutKey)
  } catch { /* The in-memory sign-out guard still applies. */ }
}
function sessionEvent(name: string, generation: number, isSignedOut = false) {
  window.dispatchEvent(new CustomEvent(name, { detail: { generation, signedOut: isSignedOut } }))
}
function expireSession(generation: number) {
  if (!authSession.isCurrent(generation)) return
  displayedAccountId = null
  sessionEvent('docflow:unauthorized', authSession.advance())
}
const statusOf = (error: unknown) => axios.isAxiosError(error) ? error.response?.status : undefined
const isIdentityRequest = (url = '') => url.split('?')[0] === '/auth/me'

function recoverSession(generation: number) {
  if (wasExplicitlySignedOut()) return Promise.reject(new AuthSessionChangedError())
  return authSession.recover(generation, async () => {
    // Another tab may already have refreshed the shared cookies while this one waited.
    try { return (await sessionClient.get<AuthUser>('/auth/me')).data } catch (error) {
      if (statusOf(error) !== 401) throw error
    }
    try { return (await sessionClient.post<AuthUser>('/auth/refresh')).data } catch (error) {
      if (statusOf(error) === 401) {
        try { return (await sessionClient.get<AuthUser>('/auth/me')).data } catch { /* Confirmed recovery failure below. */ }
      }
      throw error
    }
  })
}

client.interceptors.request.use(config => {
  const request = config as SessionRequest
  if (wasExplicitlySignedOut()) throw new AuthSessionChangedError()
  request._authGeneration ??= authSession.generation()
  request._authAccountId ??= displayedAccountId
  authSession.assertCurrent(request._authGeneration)
  return request
})

client.interceptors.response.use(
  (response) => {
    const generation = (response.config as SessionRequest)._authGeneration
    if (generation !== undefined) authSession.assertCurrent(generation)
    return response
  },
  async (error) => {
    const original = error.config as SessionRequest | undefined
    const generation = original?._authGeneration
    if (generation !== undefined && !authSession.isCurrent(generation)) throw new AuthSessionChangedError()
    if (statusOf(error) === 401 && original && generation !== undefined && !original._retry) {
      original._retry = true
      try {
        const current = await recoverSession(generation)
        authSession.assertCurrent(generation)
        if (!isIdentityRequest(original.url) && original._authAccountId != null && original._authAccountId !== current.id) {
          displayedAccountId = null
          sessionEvent('docflow:session-changed', authSession.advance())
          throw new AuthSessionChangedError()
        }
        return client(original)
      } catch (refreshError) {
        if (statusOf(refreshError) === 401) expireSession(generation)
        throw refreshError
      }
    }
    if (statusOf(error) === 401 && generation !== undefined) expireSession(generation)
    return Promise.reject(error)
  },
)

if (typeof window !== 'undefined') {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== signedOutKey) return
    signedOut = event.newValue === '1'
    displayedAccountId = null
    sessionEvent('docflow:session-changed', authSession.advance(), signedOut)
  }
  window.addEventListener('storage', onStorage)
  import.meta.hot?.dispose(() => window.removeEventListener('storage', onStorage))
}

export const authApi = {
  login: async (username: string, password: string) => {
    const generation = authSession.advance()
    const current = await authSession.exclusive(generation, async () => (await sessionClient.post<AuthUser>('/auth/login', { username, password })).data)
    authSession.assertCurrent(generation)
    markSignedOut(false)
    return current
  },
  logout: async () => {
    const generation = authSession.advance()
    displayedAccountId = null
    markSignedOut(true)
    sessionEvent('docflow:session-changed', generation, true)
    return authSession.exclusive(generation, () => sessionClient.post('/auth/logout'))
  },
  me: async () => (await client.get<AuthUser>('/auth/me')).data,
  changePassword: async (current_password: string, new_password: string) => {
    if (wasExplicitlySignedOut()) throw new AuthSessionChangedError()
    const generation = authSession.advance()
    const save = () => authSession.exclusive(generation, async () => (await sessionClient.post<AuthUser>('/auth/change-password', { current_password, new_password })).data)
    try { return await save() } catch (error) {
      if (statusOf(error) !== 401) throw error
      try { await recoverSession(generation) } catch (refreshError) {
        if (statusOf(refreshError) === 401) expireSession(generation)
        throw refreshError
      }
      try { return await save() } catch (retryError) {
        if (statusOf(retryError) === 401) expireSession(generation)
        throw retryError
      }
    }
  },
}
