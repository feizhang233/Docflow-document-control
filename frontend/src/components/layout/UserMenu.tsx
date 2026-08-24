import { FormEvent, useState } from 'react'
import { KeyRound, LoaderCircle, LogOut, X } from 'lucide-react'
import { toast } from 'sonner'
import { useDismissableLayer } from '../../hooks/useDismissableLayer'
import { useAuth } from '../../hooks/useAuth'
import { getApiError } from '../../lib/api'
import { initials, roleLabel } from '../../types/iam'

export function UserMenu() {
  const { user, logout, changePassword } = useAuth()
  const [open, setOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const menuRef = useDismissableLayer<HTMLDivElement>(open, () => setOpen(false))
  if (!user) return null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (newPassword !== confirm) {
      toast.error('New passwords do not match')
      return
    }
    setSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      toast.success('Password updated')
      setPasswordOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
    } catch (error) {
      toast.error(getApiError(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="user-menu" ref={menuRef}>
        <button className="user-chip user-chip-button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu">
          <div className="avatar">{initials(user.display_name)}</div>
          <div>
            <strong>{user.display_name}</strong>
            <span>{roleLabel(user)}</span>
          </div>
        </button>
        {open && (
          <div className="user-menu-popover" role="menu">
            <div className="user-menu-identity">
              <strong>{user.display_name}</strong>
              <span>@{user.username}</span>
            </div>
            <button onClick={() => { setOpen(false); setPasswordOpen(true) }}><KeyRound size={15} /> Change password</button>
            <button className="danger" onClick={() => { setOpen(false); logout() }}><LogOut size={15} /> Sign out</button>
          </div>
        )}
      </div>
      {passwordOpen && (
        <div className="modal-layer">
          <div className="modal-backdrop" onClick={() => setPasswordOpen(false)} />
          <form className="editor-modal password-gate-card" onSubmit={submit}>
            <header>
              <div>
                <span className="eyebrow">Account</span>
                <h2>Change password</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setPasswordOpen(false)} aria-label="Close"><X size={18} /></button>
            </header>
            <div className="editor-body">
              <div className="form-grid">
                <label className="span-2"><span>Current password</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
                <label><span>New password</span><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={10} required /></label>
                <label><span>Confirm new password</span><input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} minLength={10} required /></label>
              </div>
            </div>
            <footer>
              <button type="button" className="secondary-button" onClick={() => setPasswordOpen(false)}>Cancel</button>
              <button className="primary-button" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" /> : <KeyRound size={16} />} Update password</button>
            </footer>
          </form>
        </div>
      )}
    </>
  )
}
