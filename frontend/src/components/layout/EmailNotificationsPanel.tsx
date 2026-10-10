import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Mail, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../hooks/useAuth'
import { useProjects } from '../../hooks/useProjects'
import { useWorkspaceAccess } from '../../hooks/useWorkspaceAccess'
import { emailSubscriptionsApi, getApiError } from '../../lib/api'
import { notificationDate } from '../../lib/notifications'
import { emailEventLabels, type EmailEventType, type EmailSubscription } from '../../types/notification'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { EmailDeliverySetupGuide } from './EmailDeliverySetupGuide'

export function EmailNotificationsPanel() {
  const {can} = useAuth()
  const {codes, labels} = useProjects()
  const {project: currentProject} = useWorkspaceAccess()
  const projects = codes.filter(code => can('notifications:subscribe', code))
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const query = useQuery({queryKey: ['email-subscriptions', page], queryFn: () => emailSubscriptionsApi.list(page), refetchInterval: 30_000})
  const [email, setEmail] = useState('')
  const [project, setProject] = useState('')
  const [events, setEvents] = useState<EmailEventType[]>(Object.keys(emailEventLabels) as EmailEventType[])
  const [error, setError] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)
  const [confirmAdd, setConfirmAdd] = useState(false)
  const [removing, setRemoving] = useState<EmailSubscription | null>(null)
  const selectedProject = projects.includes(project) ? project : projects.includes(currentProject) ? currentProject : projects[0] || ''
  const refresh = () => queryClient.invalidateQueries({queryKey: ['email-subscriptions']})
  const groups = new Map<string, EmailSubscription[]>()
  for (const item of query.data?.items || []) groups.set(item.email, [...(groups.get(item.email) || []), item])
  const limit = query.data?.address_limit || 5
  const atLimit = (query.data?.address_count || 0) >= limit
  const add = useMutation({
    mutationFn: () => emailSubscriptionsApi.create({email: email.trim(), project_code: selectedProject, event_types: events}),
    onSuccess: () => { toast.success('Notification email added'); setEmail(''); setError(''); setConfirmAdd(false); setPage(1); refresh() },
    onError: failure => setError(getApiError(failure)),
  })
  const toggle = useMutation({mutationFn: (item: EmailSubscription) => emailSubscriptionsApi.setActive(item.id, !item.is_active), onSuccess: () => { toast.success('Email subscription updated'); refresh() }, onError: failure => toast.error(getApiError(failure))})
  const remove = useMutation({mutationFn: (id: number) => emailSubscriptionsApi.remove(id), onSuccess: () => { toast.success('Email subscription removed'); setRemoving(null); if (query.data?.items.length === 1 && page > 1) setPage(page - 1); refresh() }})
  const retry = useMutation({mutationFn: emailSubscriptionsApi.retry, onSuccess: () => { toast.success('Failed emails queued for retry'); refresh() }, onError: failure => toast.error(getApiError(failure))})
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {setError('Enter a valid email address.'); emailRef.current?.focus(); return}
    if (!selectedProject || !events.length) {setError('Choose a project and at least one type of update.'); return}
    if (atLimit && page === 1 && (query.data?.total || 0) <= 100 && !groups.has(email.trim().toLowerCase())) {setError('You have reached 5 email addresses. Remove an address or use one already saved.'); emailRef.current?.focus(); return}
    setError(''); setConfirmAdd(true)
  }
  return <section className="settings-panel wide">
    <div className="settings-heading icon-heading"><span><Mail/></span><div><h2>Your notification emails</h2><p>Save up to 5 email addresses for your account. Each address can follow multiple projects you can view.</p></div><strong className="email-address-count">{query.data?.address_count || 0} / {limit}</strong></div>
    {query.data && !query.data.mail_configured && <div className="config-note email-setup-note"><strong>Email delivery is not enabled yet</strong><span>Your subscriptions are saved. An administrator must connect a sending mailbox on the server. Open the setup guide below for instructions.</span></div>}
    <EmailDeliverySetupGuide/>
    <form className="email-subscription-form" noValidate onSubmit={submit}>
      <div className="form-grid">
        <label><span>Project</span><select value={selectedProject} onChange={event => setProject(event.target.value)} disabled={!projects.length}>{projects.map(code => <option key={code} value={code}>{code} · {labels[code]}</option>)}</select></label>
        <label><span>Email address</span><input ref={emailRef} type="email" autoComplete="email" list="saved-notification-emails" value={email} placeholder="name@example.com" onChange={event => {setEmail(event.target.value); setError('')}} aria-invalid={!!error} aria-describedby={error ? 'email-subscription-error' : 'email-subscription-help'}/><datalist id="saved-notification-emails">{[...groups.keys()].map(address => <option key={address} value={address}/>)}</datalist></label>
      </div>
      <fieldset><legend>Send updates for</legend><div className="iam-project-grid">{(Object.entries(emailEventLabels) as [EmailEventType, string][]).map(([kind, label]) => <label className="check-card" key={kind}><input type="checkbox" checked={events.includes(kind)} onChange={() => setEvents(current => current.includes(kind) ? current.filter(value => value !== kind) : [...current, kind])}/><i/>{label}</label>)}</div></fieldset>
      <p id="email-subscription-help" className="password-gate-copy">Emails include changed fields and comments. Comment changes include previous and current content. To follow another project, add the same address with that project selected. Paused addresses still count towards the limit.</p>
      {!projects.length && <p className="form-error">No projects are available for your account. You can still remove saved subscriptions.</p>}
      {error && <p id="email-subscription-error" className="form-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={add.isPending || !projects.length || query.isPending || query.isError} type="submit">{add.isPending ? <LoaderCircle className="spin"/> : <Plus size={16}/>} Add notification email</button>
    </form>
    <div className="workflow-config-title"><div><strong>Saved email addresses</strong><span>Only your account can manage these subscriptions. Remove all projects under an address to free a slot.</span></div></div>
    {query.isPending ? <div className="config-loading"><LoaderCircle className="spin"/> Loading your emails…</div> : query.isError ? <div className="config-note" role="alert"><strong>{getApiError(query.error)}</strong><button className="secondary-button" onClick={() => query.refetch()}><RefreshCw size={16}/> Retry</button></div> : !query.data.items.length ? <div className="config-loading">No notification emails yet.</div> : <div className="email-subscription-list">{[...groups].map(([address, subscriptions]) => <article className="email-address-card" key={address}>
      <h3><Mail size={17}/><span>{address}</span></h3>{subscriptions.map(item => {
        const accessible = projects.includes(item.project_code)
        return <div className="email-subscription-card" key={item.id}>
          <div className="email-subscription-copy"><strong>{item.project_code} · {labels[item.project_code] || 'Project subscription'}</strong><span>{item.event_types.map(kind => emailEventLabels[kind]).join(', ')}</span><small>{!accessible ? 'Access removed · delivery stopped' : item.is_active ? 'Active' : 'Paused'} · {item.last_delivery_status ? `Last email: ${item.last_delivery_status}` : 'Waiting for a change'}{item.last_delivery_at ? ` · ${notificationDate(item.last_delivery_at).toLocaleString('en-GB')}` : ''}</small>{item.pending_count > 0 && <small>{item.pending_count} queued for delivery</small>}{item.last_error && <p className="form-error">{item.last_error}</p>}</div>
          <div className="iam-user-actions">{item.failed_count > 0 && <button className="secondary-button" disabled={retry.isPending || !item.is_active || !accessible} onClick={() => retry.mutate(item.id)}>Retry ({item.failed_count})</button>}<button className="secondary-button" disabled={toggle.isPending || (!item.is_active && !accessible)} onClick={() => toggle.mutate(item)}>{item.is_active ? 'Pause' : 'Resume'}</button><button className="icon-button danger-button" aria-label={`Remove ${item.email} from ${item.project_code}`} onClick={() => setRemoving(item)}><Trash2 size={16}/></button></div>
        </div>
      })}
    </article>)}</div>}
    {(query.data?.total || 0) > 100 && <div className="email-pagination"><button className="secondary-button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.ceil((query.data?.total || 0) / 100)}</span><button className="secondary-button" disabled={page * 100 >= (query.data?.total || 0)} onClick={() => setPage(page + 1)}>Next</button></div>}
    <ConfirmDialog open={confirmAdd} title="Add notification email?" description={<><strong>{email.trim()}</strong> will receive {events.map(kind => emailEventLabels[kind]).join(', ')} for <strong>{selectedProject}</strong>, including the selected project content and comments.</>} confirmLabel="Add email" tone="warning" onClose={() => setConfirmAdd(false)} onConfirm={() => add.mutateAsync()}/>
    <ConfirmDialog open={!!removing} title="Remove project subscription?" description={<><strong>{removing?.email}</strong> will stop receiving changes for <strong>{removing?.project_code}</strong>. Queued emails for this subscription are removed.</>} confirmLabel="Remove subscription" onClose={() => setRemoving(null)} onConfirm={() => removing ? remove.mutateAsync(removing.id) : Promise.resolve()}/>
  </section>
}
