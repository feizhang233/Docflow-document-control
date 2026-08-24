import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Bell, CheckCheck, ChevronDown, ListChecks, MessageSquareText, RefreshCw, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useDismissableLayer } from '../../hooks/useDismissableLayer'
import { notificationsApi } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'

export function NotificationsPopover({open,onToggle,onClose}:{open:boolean;onToggle:()=>void;onClose:()=>void}){
  const navigate=useNavigate();const queryClient=useQueryClient();const {can}=useAuth()
  const [collapsedGroups,setCollapsedGroups]=useState<Set<string>>(()=>new Set())
  const popoverRef=useDismissableLayer<HTMLDivElement>(open,onClose)
  const query=useQuery({queryKey:['notifications'],queryFn:()=>notificationsApi.list(),refetchInterval:30_000})
  const refresh=()=>queryClient.invalidateQueries({queryKey:['notifications']})
  const mark=useMutation({mutationFn:notificationsApi.markRead,onSuccess:refresh})
  const markAll=useMutation({mutationFn:notificationsApi.markAllRead,onSuccess:refresh})
  const clear=useMutation({mutationFn:notificationsApi.clear,onSuccess:refresh})
  const unread=query.data?.unread_count||0
  const items=query.data?.items||[]
  const groups=[
    {type:'submission_progress',label:'Submission Progress',icon:<ListChecks/>,items:items.filter(item=>item.notification_type==='submission_progress'),target:'/documents/all'},
    {type:'workflow_feedback',label:'Workflow Feedback',icon:<MessageSquareText/>,items:items.filter(item=>item.notification_type!=='submission_progress'),target:'/workflow'},
  ].filter(group=>group.items.length)
  const toggleGroup=(type:string)=>setCollapsedGroups(previous=>{const next=new Set(previous);if(next.has(type))next.delete(type);else next.add(type);return next})
  return <div className="notification-center" ref={popoverRef}><button className={`icon-button ${unread?'has-indicator':''}`} onClick={onToggle} aria-label={`Notifications${unread?` (${unread} unread)`:''}`}><Bell size={19}/>{unread>0&&<span className="notification-count">{unread>9?'9+':unread}</span>}</button>{open&&<div className="notification-popover"><header><div><strong>Notifications</strong><span>{unread?`${unread} updates unread`:'You’re all caught up'}</span></div><div className="notification-header-actions">{unread>0&&<button onClick={()=>markAll.mutate()}><CheckCheck/> Read all</button>}{can('notifications:write')&&!!items.length&&<button className="danger" disabled={clear.isPending} onClick={()=>{if(window.confirm('Clear all notifications? This cannot be undone.'))clear.mutate()}}><Trash2/> Clear</button>}</div></header><div className="notification-list">{query.isLoading?<div className="notification-state"><RefreshCw className="spin"/>Loading updates…</div>:!items.length?<div className="notification-state"><Bell/>No updates yet</div>:groups.map(group=>{const collapsed=collapsedGroups.has(group.type);return <section className={`notification-group ${collapsed?'collapsed':''}`} key={group.type}><button type="button" className="notification-group-heading" aria-expanded={!collapsed} onClick={()=>toggleGroup(group.type)}><span>{group.icon}{group.label}</span><span className="notification-group-meta"><small>{group.items.filter(item=>!item.is_read).length} unread · {group.items.length} total</small><ChevronDown/></span></button>{!collapsed&&group.items.map(item=><button key={item.id} className={item.is_read?'':'unread'} onClick={()=>{if(!item.is_read)mark.mutate(item.id);const focus=item.document_number||item.workflow_number;const queryString=new URLSearchParams({...(focus?{focus}:{}),notification:String(item.id),...(item.package_id?{package:String(item.package_id)}:{})});navigate(`${group.target}?${queryString}`,{state:{notificationFocusNonce:Date.now()}});onClose()}}><i/><div><strong>{item.title}</strong><p>{item.message}</p><span>{formatDistanceToNow(new Date(item.created_at),{addSuffix:true})}{item.document_number?` · ${item.document_number}`:''}</span></div></button>)}</section>})}</div><footer>Updates refresh automatically every 30 seconds.</footer></div>}</div>
}
