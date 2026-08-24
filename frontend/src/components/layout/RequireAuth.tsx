import { FormEvent, useState } from 'react'
import { LoaderCircle, ShieldCheck } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getApiError } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'

export function RequireAuth() {
  const { user, loading, changePassword } = useAuth()
  const location = useLocation()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (loading) return <div className="auth-loading">Loading workspace…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (newPassword !== confirm) {
      setError('New passwords do not match')
      return
    }
    setSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Outlet />
      {user.must_change_password && (
        <div className="modal-layer password-gate">
          <div className="modal-backdrop" />
          <form className="editor-modal password-gate-card" onSubmit={submit}>
            <header>
              <div>
                <span className="eyebrow">Security</span>
                <h2>Change your password</h2>
              </div>
              <ShieldCheck />
            </header>
            <div className="editor-body">
              <p className="password-gate-copy">Your account requires a new password before you can use DocFlow.</p>
              <div className="form-grid">
                <label className="span-2"><span>Current password</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
                <label><span>New password</span><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={10} required /></label>
                <label><span>Confirm new password</span><input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} minLength={10} required /></label>
              </div>
              {error && <div className="login-error" role="alert">{error}</div>}
            </div>
            <footer>
              <button className="primary-button" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <ShieldCheck size={16} />} Update password</button>
            </footer>
          </form>
        </div>
      )}
    </>
  )
}
