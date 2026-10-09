import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, LoaderCircle, Mail, MessageSquareText, RefreshCw } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmailNotificationsPanel } from '../components/layout/EmailNotificationsPanel'
import { useAuth } from '../hooks/useAuth'
import { useProjects } from '../hooks/useProjects'
import { useWorkspaceAccess } from '../hooks/useWorkspaceAccess'
import { getApiError, notificationsApi } from '../lib/api'
import { notificationDate, notificationDestination } from '../lib/notifications'

const updateLabels: Record<string, string> = {submission_progress: 'Submission Progress', workflow_feedback: 'Feedback', workflow_comments: 'Comments'}

export function NotificationsPage() {
  const { can } = useAuth()
  const { project, viewOnly } = useWorkspaceAccess()
  const { labels } = useProjects()
  const [params, setParams] = useSearchParams()
  const emailTab = params.get('tab') === 'email'
  const [filter, setFilter] = useState('all')
  const queryClient = useQueryClient()
  const query = useQuery({queryKey: ['notifications', 'page', project], queryFn: () => notificationsApi.list(100, project === 'ALL' ? undefined : project), refetchInterval: 30_000, enabled: !emailTab})
  const mark = useMutation({mutationFn: notificationsApi.markRead, onSuccess: () => queryClient.invalidateQueries({queryKey: ['notifications']}), onError: failure => toast.error(getApiError(failure))})
  const selectTab = (email: boolean) => {
    const next = new URLSearchParams(params)
    if (email) next.set('tab', 'email'); else next.delete('tab')
    setParams(next)
  }
  const items = (query.data?.items || []).filter(item => filter === 'all' || item.notification_type === filter)
  return <>
    <div className="page-header"><div><div className="breadcrumb">{labels[project]} <span>/</span> Notification</div><h1>Notification</h1><p>Follow project changes and manage your notification emails.</p></div></div>
    <nav className="notification-page-tabs" aria-label="Notification sections"><button className={!emailTab ? 'active' : ''} aria-current={!emailTab ? 'page' : undefined} onClick={() => selectTab(false)}><Bell size={17}/> Updates</button><button className={emailTab ? 'active' : ''} aria-current={emailTab ? 'page' : undefined} onClick={() => selectTab(true)}><Mail size={17}/> Email addresses</button></nav>
    {emailTab ? <EmailNotificationsPanel/> : <section className="panel notification-updates-panel">
      <div className="panel-heading"><div><h2>Project updates</h2><p>{labels[project]} · Latest 100 updates, including comments</p></div><label className="notification-type-filter"><span className="sr-only">Filter updates</span><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All updates</option>{Object.entries(updateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      {query.isPending ? <div className="state-panel"><LoaderCircle className="spin"/> Loading updates…</div> : query.isError ? <div className="state-panel error" role="alert"><strong>{getApiError(query.error)}</strong><button className="secondary-button" onClick={() => query.refetch()}><RefreshCw size={16}/> Retry</button></div> : !items.length ? <div className="state-panel"><Bell/><strong>No updates yet</strong><span>New progress, feedback and comment changes will appear here.</span></div> : <div className="notification-update-list">{items.map(item => <article className={`notification-update ${item.is_read ? '' : 'unread'}`} key={item.id}>
        <div className="activity-icon">{item.notification_type === 'workflow_comments' ? <MessageSquareText/> : <Bell/>}</div>
        <div className="notification-update-copy"><div className="notification-update-meta"><span>{item.project_code || 'Workspace'} · {updateLabels[item.notification_type] || 'Update'}</span><time dateTime={notificationDate(item.created_at).toISOString()}>{notificationDate(item.created_at).toLocaleString('en-GB')}</time></div><Link to={notificationDestination(item, viewOnly || !can('packages:write', item.project_code || undefined))} onClick={() => {if (!item.is_read) mark.mutate(item.id)}}><strong>{item.title}</strong></Link><p>{item.message}</p></div>
        {!item.is_read && <button className="icon-button" disabled={mark.isPending} aria-label={`Mark ${item.title} as read`} onClick={() => mark.mutate(item.id)}><CheckCheck size={18}/></button>}
      </article>)}</div>}
      <footer className="notification-page-footer">Updates refresh automatically every 30 seconds.</footer>
    </section>}
  </>
}
