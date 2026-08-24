import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { Check, KeyRound, LoaderCircle, Plus, Shield, X } from 'lucide-react'
import { toast } from 'sonner'
import { getApiError, iamApi } from '../../lib/api'
import { useProjects } from '../../hooks/useProjects'
import { useAuth } from '../../hooks/useAuth'
import { initials, type AuthUser, type Role } from '../../types/iam'

const emptyCreate = {
  username: '',
  display_name: '',
  email: '',
  password: '',
  role_slugs: ['viewer'] as string[],
  all_projects: true,
  project_codes: [] as string[],
}

export function AccessPanel() {
  const queryClient = useQueryClient()
  const { user: currentUser, can } = useAuth()
  const { codes, labels } = useProjects()
  const canWrite = can('iam:write')
  const users = useQuery({ queryKey: ['iam-users'], queryFn: iamApi.listUsers })
  const roles = useQuery({ queryKey: ['iam-roles'], queryFn: iamApi.listRoles })
  const audit = useQuery({ queryKey: ['iam-audit'], queryFn: () => iamApi.listAudit(30) })
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AuthUser | null>(null)
  const [resetting, setResetting] = useState<AuthUser | null>(null)

  const userCount = users.data?.items.length || 0
  return (
    <section className="settings-panel wide">
      <div className="settings-heading icon-heading">
        <span><Shield /></span>
        <div>
          <h2>Users & access</h2>
          <p>Sign-in accounts, roles, and project scope. API automation still uses the separate external API key.</p>
        </div>
        {canWrite && <button className="primary-button" onClick={() => setCreating(true)}><Plus size={16} /> New user</button>}
      </div>
      {users.isLoading ? <div className="config-loading"><LoaderCircle className="spin" /> Loading users…</div> : (
        <div className="iam-user-list">
          <div className="workflow-config-title iam-list-heading">
            <div><strong>Accounts</strong><span>People who can sign in to this DocFlow workspace.</span></div>
            <small>{userCount} {userCount === 1 ? 'user' : 'users'}</small>
          </div>
          {users.data?.items.map((user) => (
            <article key={user.id} className={`iam-user-card ${user.is_active ? '' : 'inactive'}`}>
              <div className="avatar">{initials(user.display_name)}</div>
              <div className="iam-user-identity">
                <strong>{user.display_name}{user.id === currentUser?.id ? <em>You</em> : null}</strong>
                <span>@{user.username}{user.email ? ` · ${user.email}` : ''}</span>
              </div>
              <div className="iam-user-meta">
                <span className="badge blue">{user.roles.map((role) => role.name).join(', ') || 'No role'}</span>
                <small>{user.all_projects ? 'All projects' : user.project_codes.join(', ') || 'No projects'}</small>
              </div>
              <div className="iam-user-status">
                <span className={`iam-status-pill ${user.is_active ? 'active' : 'disabled'}`}>{user.is_active ? 'Active' : 'Disabled'}</span>
                <small>{user.last_login_at ? `Last sign-in ${formatDistanceToNow(new Date(user.last_login_at), { addSuffix: true })}` : 'Never signed in'}</small>
              </div>
              {canWrite && (
                <div className="iam-user-actions">
                  <button className="secondary-button" onClick={() => setEditing(user)}>Edit</button>
                  <button className="secondary-button" onClick={() => setResetting(user)}><KeyRound size={14} /> Reset</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <div className="config-note">
        <strong>Roles</strong>
        <span>Administrator manages access. Document Controller owns the register and settings. Editor can update documents. Viewer is read-only.</span>
      </div>
      <div className="iam-audit">
        <div className="workflow-config-title">
          <div><strong>Recent access events</strong><span>Sign-ins, user changes, and password resets.</span></div>
        </div>
        {audit.isLoading ? <div className="config-loading"><LoaderCircle className="spin" /> Loading audit log…</div> : !audit.data?.items.length ? <p className="iam-audit-empty">No events yet.</p> : (
          <ul>
            {audit.data.items.map((event) => (
              <li key={event.id}>
                <strong>{event.action}</strong>
                <span>{event.actor_username || 'system'}{event.target_id ? ` · ${event.target_type} ${event.target_id}` : ''}</span>
                <time>{formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}</time>
              </li>
            ))}
          </ul>
        )}
      </div>
      {creating && <UserEditor mode="create" roles={roles.data || []} projectCodes={codes} projectLabels={labels} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); queryClient.invalidateQueries({ queryKey: ['iam-users'] }); queryClient.invalidateQueries({ queryKey: ['iam-audit'] }) }} />}
      {editing && <UserEditor mode="edit" user={editing} roles={roles.data || []} projectCodes={codes} projectLabels={labels} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); queryClient.invalidateQueries({ queryKey: ['iam-users'] }); queryClient.invalidateQueries({ queryKey: ['iam-audit'] }) }} />}
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} onSaved={() => { setResetting(null); queryClient.invalidateQueries({ queryKey: ['iam-users'] }); queryClient.invalidateQueries({ queryKey: ['iam-audit'] }) }} />}
    </section>
  )
}

function UserEditor({
  mode, user, roles, projectCodes, projectLabels, onClose, onSaved,
}: {
  mode: 'create' | 'edit'
  user?: AuthUser
  roles: Role[]
  projectCodes: string[]
  projectLabels: Record<string, string>
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState(() => user ? {
    username: user.username,
    display_name: user.display_name,
    email: user.email || '',
    password: '',
    role_slugs: user.roles.map((role) => role.slug),
    all_projects: user.all_projects,
    project_codes: user.project_codes,
  } : { ...emptyCreate })
  const create = useMutation({
    mutationFn: () => iamApi.createUser({
      username: form.username,
      display_name: form.display_name,
      email: form.email || null,
      password: form.password,
      role_slugs: form.role_slugs,
      all_projects: form.all_projects,
      project_codes: form.project_codes,
      must_change_password: true,
    }),
    onSuccess: () => { toast.success('User created'); onSaved() },
    onError: (error) => toast.error(getApiError(error)),
  })
  const update = useMutation({
    mutationFn: () => iamApi.updateUser(user!.id, {
      display_name: form.display_name,
      email: form.email || null,
      role_slugs: form.role_slugs,
      all_projects: form.all_projects,
      project_codes: form.project_codes,
    }),
    onSuccess: () => { toast.success('User updated'); onSaved() },
    onError: (error) => toast.error(getApiError(error)),
  })
  const toggleActive = useMutation({
    mutationFn: () => iamApi.updateUser(user!.id, { is_active: !user!.is_active }),
    onSuccess: () => { toast.success(user!.is_active ? 'User disabled' : 'User enabled'); onSaved() },
    onError: (error) => toast.error(getApiError(error)),
  })
  const adminSelected = form.role_slugs.includes('admin')
  const pending = create.isPending || update.isPending
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (mode === 'create') create.mutate()
    else update.mutate()
  }
  const toggleRole = (slug: string) => {
    setForm((current) => {
      const selected = current.role_slugs.includes(slug)
        ? current.role_slugs.filter((item) => item !== slug)
        : [...current.role_slugs, slug]
      const nextAdmin = selected.includes('admin')
      return { ...current, role_slugs: selected.length ? selected : [slug], all_projects: nextAdmin ? true : current.all_projects }
    })
  }
  return (
    <div className="modal-layer">
      <div className="modal-backdrop" onClick={onClose} />
      <form className="editor-modal iam-editor" onSubmit={submit}>
        <header>
          <div>
            <span className="eyebrow">Access</span>
            <h2>{mode === 'create' ? 'New user' : `Edit ${user?.display_name}`}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="editor-body">
          <div className="form-grid">
            <label><span>Display name</span><input value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} required /></label>
            <label><span>Username</span><input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} required disabled={mode === 'edit'} autoComplete="off" /></label>
            <label className="span-2"><span>Email</span><input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
            {mode === 'create' && <label className="span-2"><span>Temporary password</span><input type="text" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} minLength={10} required autoComplete="new-password" /></label>}
          </div>
          <fieldset>
            <legend>Roles</legend>
            <div className="iam-role-grid">
              {roles.map((role) => (
                <label key={role.slug} className={`check-card ${form.role_slugs.includes(role.slug) ? 'selected' : ''}`}>
                  <input type="checkbox" checked={form.role_slugs.includes(role.slug)} onChange={() => toggleRole(role.slug)} />
                  <i />
                  <span><strong>{role.name}</strong><small>{role.description}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Projects</legend>
            <label className="editor-switch-row">
              <div><strong>All projects</strong><span>Administrators always have access to every project.</span></div>
              <span className="switch"><input type="checkbox" checked={form.all_projects || adminSelected} disabled={adminSelected} onChange={(event) => setForm((current) => ({ ...current, all_projects: event.target.checked }))} /><i /></span>
            </label>
            {!form.all_projects && !adminSelected && (
              <div className="iam-project-grid">
                {projectCodes.map((code) => (
                  <label key={code} className="check-card">
                    <input type="checkbox" checked={form.project_codes.includes(code)} onChange={() => setForm((current) => ({
                      ...current,
                      project_codes: current.project_codes.includes(code) ? current.project_codes.filter((item) => item !== code) : [...current.project_codes, code],
                    }))} />
                    <i />
                    {code} · {projectLabels[code] || code}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </div>
        <footer>
          {mode === 'edit' && user && <button type="button" className="secondary-button danger-button" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate()}>{user.is_active ? 'Disable user' : 'Enable user'}</button>}
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="submit" disabled={pending}>{pending ? <LoaderCircle className="spin" /> : <Check size={16} />} {mode === 'create' ? 'Create user' : 'Save changes'}</button>
        </footer>
      </form>
    </div>
  )
}

function ResetPasswordDialog({ user, onClose, onSaved }: { user: AuthUser; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState(() => randomPassword())
  const reset = useMutation({
    mutationFn: () => iamApi.resetPassword(user.id, password, true),
    onSuccess: () => { toast.success('Password reset. Share the new password once.'); onSaved() },
    onError: (error) => toast.error(getApiError(error)),
  })
  return (
    <div className="modal-layer">
      <div className="modal-backdrop" onClick={onClose} />
      <form className="editor-modal password-gate-card" onSubmit={(event) => { event.preventDefault(); reset.mutate() }}>
        <header>
          <div>
            <span className="eyebrow">Access</span>
            <h2>Reset password</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="editor-body">
          <p className="password-gate-copy">Set a temporary password for {user.display_name}. They will have to change it at next sign-in.</p>
          <div className="form-grid">
            <label className="span-2"><span>New temporary password</span><input value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} required /></label>
          </div>
        </div>
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="submit" disabled={reset.isPending}>{reset.isPending ? <LoaderCircle className="spin" /> : <KeyRound size={16} />} Reset password</button>
        </footer>
      </form>
    </div>
  )
}

function randomPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  return Array.from({ length: 12 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}
