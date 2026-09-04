import { FormEvent, useState } from 'react'
import { ArrowRight, CheckCircle2, FileCheck2, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { getApiError } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { LogoMark } from '../components/common/LogoMark'
import { SecretInput } from '../components/common/SecretInput'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from || '/'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  useDocumentTitle('Sign in')

  if (loading) return <div className="auth-loading">Loading workspace…</div>
  if (user) return <Navigate to={from} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!username.trim() || !password) {
      setError('Enter your username and password to continue.')
      return
    }
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
      <section className="login-visual" aria-label="DocFlow document control workspace">
        <div className="login-brand">
          <LogoMark />
          <div><strong>DocFlow</strong><span>Document control</span></div>
        </div>
        <div className="login-visual-copy">
          <span className="login-kicker">Engineering document control</span>
          <h1>Every document,<br />on the right route.</h1>
          <p>One operational workspace for project registers, submission progress, workflow feedback, and transmittals.</p>
          <div className="login-route-card" aria-hidden="true">
            <div className="route-card-head"><span>Live document route</span><b>NFS · Structural</b></div>
            <div className="route-line">
              <span className="complete"><i><FileCheck2 /></i><b>Register</b><small>Issued</small></span>
              <span className="complete"><i><CheckCircle2 /></i><b>Submission</b><small>Complete</small></span>
              <span className="current"><i><ShieldCheck /></i><b>Workflow</b><small>Reviewing</small></span>
              <span><i><ArrowRight /></i><b>Transmittal</b><small>Next</small></span>
            </div>
          </div>
        </div>
      </section>
      <section className="login-form-side">
        <form className="login-card" onSubmit={submit} noValidate>
          <div className="login-mobile-brand"><LogoMark compact /><strong>DocFlow</strong></div>
          <span className="eyebrow">Secure workspace</span>
          <h2>Welcome back</h2>
          <p>Sign in to continue to the document control workspace.</p>
          <label>
            <span>Username or email</span>
            <input autoFocus autoComplete="username" value={username} onChange={(event) => { setUsername(event.target.value); setError('') }} aria-invalid={!!error} required />
          </label>
          <label>
            <span>Password</span>
            <SecretInput autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} aria-invalid={!!error} required />
          </label>
          <div className="login-message-slot">{error && <div className="login-error" role="alert">{error}</div>}</div>
          <button className="primary-button login-submit" type="submit" disabled={submitting || !username.trim() || !password} aria-busy={submitting}>
            {submitting ? <LoaderCircle className="spin" /> : <LockKeyhole size={16} />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="login-security-note"><ShieldCheck /><span><strong>Protected access</strong>Role and project permissions are enforced by DocFlow.</span></div>
        </form>
      </section>
    </div>
  )
}
