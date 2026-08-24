import { FormEvent, useState } from 'react'
import { LoaderCircle, LockKeyhole } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { getApiError } from '../lib/api'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from || '/'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <div className="auth-loading">Loading workspace…</div>
  if (user) return <Navigate to={from} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="brand-mark">D</div>
          <div>
            <strong>DocFlow</strong>
            <span>Project Controls</span>
          </div>
        </div>
        <h1>Sign in</h1>
        <p>Use your DocFlow account to open the document register.</p>
        <label>
          <span>Username or email</span>
          <input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
        </label>
        <label>
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error && <div className="login-error" role="alert">{error}</div>}
        <button className="primary-button" type="submit" disabled={submitting || !username.trim() || !password}>
          {submitting ? <LoaderCircle className="spin" /> : <LockKeyhole size={16} />}
          Sign in
        </button>
      </form>
    </div>
  )
}
