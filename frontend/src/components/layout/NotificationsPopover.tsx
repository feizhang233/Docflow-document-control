import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Bell, CheckCheck, ChevronDown, ListChecks, MessageSquareText, RefreshCw, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useDismissableLayer } from '../../hooks/useDismissableLayer'
import { notificationsApi } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { ConfirmDialog } from '../common/ConfirmDialog'

export function NotificationsPopover({open,onToggle,onClose}:{open:boolean;onToggle:()=>void;onClose:()=>void}){
  const navigate=useNavigate();const queryClient=useQueryClient();const {can}=useAuth()
  const [collapsedGroups,setCollapsedGroups]=useState<Set<string>>(()=>new Set())
  const [clearOpen,setClearOpen]=useState(false)
  const panelRef=useRef<HTMLDivElement>(null)
  const triggerRef=useDismissableLayer<HTMLDivElement>(open && !clearOpen,onClose,[panelRef])
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
  return <>
    <div className="notification-center" ref={triggerRef}>
      <button className={`icon-button ${unread?'has-indicator':''}`} onClick={onToggle} aria-expanded={open} aria-label={`Notifications${unread?` (${unread} unread)`:''}`}>
        <Bell size={19}/>{unread>0&&<span className="notification-count">{unread>9?'9+':unread}</span>}
      </button>
    </div>
    {open && createPortal(
      <div className="notification-popover" ref={panelRef} role="dialog" aria-label="Notifications">
        <header>
          <div>
            <strong>Notifications</strong>
            <span>{unread?`${unread} updates unread`:'You’re all caught up'}</span>
          </div>
          <div className="notification-header-actions">
            {unread>0&&<button onClick={()=>markAll.mutate()}><CheckCheck/> Read all</button>}
            {can('notifications:write')&&!!items.length&&<button className="danger" disabled={clear.isPending} onClick={()=>setClearOpen(true)}><Trash2/> Clear</button>}
          </div>
        </header>
        <div className="notification-list">
          {query.isLoading?<div className="notification-state"><RefreshCw className="spin"/>Loading updates…</div>
            :!items.length?<div className="notification-state"><Bell/>No updates yet</div>
            :groups.map(group=>{
              const collapsed=collapsedGroups.has(group.type)
              return <section className={`notification-group ${collapsed?'collapsed':''}`} key={group.type}>
                <button type="button" className="notification-group-heading" aria-expanded={!collapsed} onClick={()=>toggleGroup(group.type)}>
                  <span>{group.icon}{group.label}</span>
                  <span className="notification-group-meta"><small>{group.items.filter(item=>!item.is_read).length} unread · {group.items.length} total</small><ChevronDown/></span>
                </button>
                {!collapsed&&group.items.map(item=><button key={item.id} className={item.is_read?'':'unread'} onClick={()=>{
                  if(!item.is_read)mark.mutate(item.id)
                  const focus=item.document_number||item.workflow_number
                  const queryString=new URLSearchParams({...(focus?{focus}:{}),notification:String(item.id),...(item.package_id?{package:String(item.package_id)}:{})})
                  navigate(`${group.target}?${queryString}`,{state:{notificationFocusNonce:Date.now()}})
                  onClose()
                }}><i/><div><strong>{item.title}</strong><p>{item.message}</p><span>{formatDistanceToNow(new Date(item.created_at),{addSuffix:true})}{item.document_number?` · ${item.document_number}`:''}</span></div></button>)}
              </section>
            })}
        </div>
        <footer>Updates refresh automatically every 30 seconds.</footer>
      </div>,
      document.body,
    )}
    <ConfirmDialog
      open={clearOpen}
      title="Clear all notifications?"
      description={<>This permanently removes <strong>{items.length} notification{items.length===1?'':'s'}</strong> from this workspace. The document records are not changed.</>}
      confirmLabel="Clear notifications"
      onClose={()=>setClearOpen(false)}
      onConfirm={()=>clear.mutateAsync()}
    />
  </>
}
