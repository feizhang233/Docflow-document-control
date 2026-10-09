import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Bell, CheckCircle2, Clock3, FileCheck2, Files, History, ListChecks, Mail, MessageSquareText, Radio, Send, TrendingUp } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { getApiError, notificationsApi, packagesApi, settingsApi } from '../lib/api'
import { getEffectiveFeedbackStatus } from '../components/packages/FeedbackStatus'
import { feedbackStatusLabels, feedbackSteps, type FeedbackStatusCode, type Package, type ProjectFilter, type WorkflowNotification } from '../types/package'
import { useProjects } from '../hooks/useProjects'
import { projectFilterFrom, submissionStepsFor } from '../lib/projects'
import { useAuth } from '../hooks/useAuth'
import { useWorkspaceAccess } from '../hooks/useWorkspaceAccess'
import { notificationDate, notificationDestination } from '../lib/notifications'

const defaultColors:Record<FeedbackStatusCode,string>={A:'#21815d',B:'#9b6816',C:'#b13f4c',P:'#4267bd'}

export function DashboardPage() {
  const { user, can } = useAuth()
  const { viewOnly } = useWorkspaceAccess()
  const [searchParams]=useSearchParams()
  const {codes,labels,canSeeAll}=useProjects()
  const selectedProject=projectFilterFrom(searchParams.get('project'),codes,canSeeAll)
  const projectCode=selectedProject==='ALL'?undefined:selectedProject
  const packagesQuery=useQuery({queryKey:['dashboard-packages',selectedProject],queryFn:()=>packagesApi.listAll({period:'all',project_code:projectCode})})
  const {data:workflowConfig}=useQuery({queryKey:['workflow-config'],queryFn:settingsApi.getWorkflow})
  const notificationQuery=useQuery({queryKey:['notifications','dashboard',selectedProject],queryFn:()=>notificationsApi.list(100,projectCode),refetchInterval:30_000})
  const {data}=packagesQuery
  const notifications=notificationQuery.data
  const stepsFor=(item:Package)=>submissionStepsFor(workflowConfig,item.project_code)
  const currentFeedbackReviewers=workflowConfig?.feedback_reviewers||feedbackSteps
  const statusLabels=workflowConfig?.feedback_status_labels||feedbackStatusLabels
  const statusColors=workflowConfig?.feedback_status_colors||defaultColors
  const items=data?.items||[]
  const complete=items.filter(item=>stepsFor(item).every(step=>item.submission_progress[step])).length
  const feedbackPending=items.filter(item=>!item.feedback.Terminate&&currentFeedbackReviewers.some(step=>!item.feedback[step])).length
  const active=items.length-complete
  const [utiberReviewer='UTIBER',gdsReviewer='GDS']=currentFeedbackReviewers
  const approvalFinished=(item:typeof items[number],reviewer:string)=>['A','B','C'].includes(item.feedback_status[reviewer]||'P')
  const terminated=items.filter(item=>item.feedback.Terminate).length
  const gdsCompleted=items.filter(item=>!item.feedback.Terminate&&approvalFinished(item,gdsReviewer)).length
  const utiberCompleted=items.filter(item=>!item.feedback.Terminate&&!approvalFinished(item,gdsReviewer)&&approvalFinished(item,utiberReviewer)).length
  const awaitingApproval=items.length-terminated-gdsCompleted-utiberCompleted
  const overviewRows=[
    {label:`${gdsReviewer} completed`,count:gdsCompleted,color:'#32a87b'},
    {label:`${utiberReviewer} completed and waiting ${gdsReviewer}`,count:utiberCompleted,color:'#4974e9'},
    {label:`Awaiting ${utiberReviewer}`,count:awaitingApproval,color:'#e0a044'},
    {label:'Terminate',count:terminated,color:'#858d99'},
  ]
  let overviewOffset=0
  const overviewGradient=items.length?`conic-gradient(${overviewRows.map(row=>{const start=overviewOffset;overviewOffset+=row.count/items.length*100;return `${row.color} ${start}% ${overviewOffset}%`}).join(',')})`:'#e7ebf1'
  const pending=items.filter(item=>!item.is_abandoned&&!item.workflow_terminated&&!stepsFor(item).every(step=>item.submission_progress[step])).sort((left,right)=>completedSteps(right,stepsFor(right))-completedSteps(left,stepsFor(left))).slice(0,8)
  const today=new Date()
  const todayChanges=(notifications?.items||[]).filter(item=>notificationDate(item.created_at).toDateString()===today.toDateString())
  const submissionChanges=todayChanges.filter(item=>item.notification_type==='submission_progress')
  const workflowChanges=todayChanges.filter(item=>item.notification_type!=='submission_progress')
  const workflowChangeDetail=(notification:WorkflowNotification)=>{
    if(notification.notification_type==='workflow_comments')return notification.message
    if(/\b[ABCP]\s*[–-]\s*/.test(notification.message)||/terminat|reopen/i.test(notification.message))return notification.message
    const current=items.find(item=>item.id===notification.package_id)||items.find(item=>item.workflow_number===notification.workflow_number&&item.document_number===notification.document_number)
    if(!current)return notification.message
    return currentFeedbackReviewers.map(reviewer=>{const code=current.feedback_status[reviewer]||'P';return `${reviewer} approval: ${code} – ${statusLabels[code]}`}).join(' · ')
  }
  const statusCounts={A:0,B:0,C:0,P:0,T:0}
  for(const item of items)statusCounts[getEffectiveFeedbackStatus(item,currentFeedbackReviewers,statusLabels).code]+=1
  const statusRows=(['A','B','C','P','T'] as const).map(code=>({code,label:code==='T'?'Terminated':statusLabels[code],count:statusCounts[code],color:code==='T'?'#737b88':statusColors[code]}))
  let offset=0
  const statusGradient=items.length?`conic-gradient(${statusRows.map(row=>{const start=offset;offset+=row.count/items.length*100;return `${row.color} ${start}% ${offset}%`}).join(',')})`:'#e7ebf1'
  const dateLabel=today.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  const registerSearch=(project:ProjectFilter=selectedProject,extra:Record<string,string>={})=>{const params=new URLSearchParams(extra);if(project!=='ALL')params.set('project',project);return params.toString()?`?${params}`:''}
  const firstName=user?.display_name?.trim().split(/\s+/)[0]||'there'
  const hour=today.getHours()
  const greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening'
  if (viewOnly) return <>
    <section className="dashboard-hero browse-dashboard-hero">
      <div className="dashboard-hero-copy"><div className="breadcrumb">{dateLabel} <span>/</span> {labels[selectedProject]}</div><span className="hero-live"><Files/> Document browsing</span><h1>{greeting}, {firstName}.</h1><p>Browse documents, check project updates and follow comments in {labels[selectedProject].toLowerCase()}.</p><div className="browse-dashboard-actions"><Link className="primary-button" to={`/documents/all${registerSearch()}`}>Browse documents <ArrowRight size={16}/></Link><Link className="secondary-button" to={`/notifications${registerSearch()}`}>View updates <Bell size={16}/></Link></div></div>
      <div className="dashboard-route-rail" aria-label="Browsing workspace"><div className="route-rail-head"><span>View only</span><strong>{labels[selectedProject]}</strong></div><div className="route-rail-stages"><div className="complete"><i><Files/></i><span><b>Documents</b><small>Browse project records</small></span></div><div><i><Bell/></i><span><b>Notification</b><small>Progress, feedback and comments</small></span></div><div><i><Mail/></i><span><b>Email addresses</b><small>Up to 5 personal recipients</small></span></div></div></div>
    </section>
    <div className="metric-grid"><Metric index={0} icon={<Files/>} tone="blue" label="Total documents" value={data?.total||0} note={labels[selectedProject]}/><Metric index={1} icon={<CheckCircle2/>} tone="green" label="Submission complete" value={complete} note="All submission stages complete"/><Metric index={2} icon={<FileCheck2/>} tone="amber" label="Awaiting feedback" value={feedbackPending} note="Documents under review"/><Metric index={3} icon={<MessageSquareText/>} tone="purple" label="Comment updates" value={todayChanges.filter(item=>item.notification_type==='workflow_comments').length} note="Received today"/></div>
    <div className="dashboard-row dashboard-row-primary">
      <section className="panel dashboard-panel"><div className="panel-heading"><div><h2>Recent documents</h2><p>Latest records in your project scope</p></div><Link to={`/documents/all${registerSearch()}`}>View all <ArrowRight size={14}/></Link></div>{packagesQuery.isPending?<div className="state-panel">Loading documents…</div>:packagesQuery.isError?<div className="state-panel error" role="alert">{getApiError(packagesQuery.error)}<button className="secondary-button" onClick={()=>packagesQuery.refetch()}>Retry</button></div>:<div className="dashboard-list">{[...items].sort((a,b)=>b.document_date.localeCompare(a.document_date)||b.id-a.id).slice(0,8).map(item=><Link to={{pathname:'/documents/all',search:registerSearch(item.project_code,{package:String(item.id)})}} key={item.id}><div className="activity-icon"><Files/></div><div><strong>{item.document_title||'Untitled document'}</strong><span>{item.project_code} · {item.document_type}</span></div><div className="activity-meta"><strong>{item.document_date}</strong><span>View document</span></div></Link>)}{!items.length&&<div className="mini-empty"><Files/>No documents in this project yet.</div>}</div>}</section>
      <section className="panel dashboard-panel dashboard-change-panel"><div className="panel-heading"><div><h2>Recent updates</h2><p>Progress, feedback and comments</p></div><Link to={`/notifications${registerSearch()}`}>View all <ArrowRight size={14}/></Link></div>{notificationQuery.isPending?<div className="state-panel">Loading updates…</div>:notificationQuery.isError?<div className="state-panel error" role="alert">{getApiError(notificationQuery.error)}<button className="secondary-button" onClick={()=>notificationQuery.refetch()}>Retry</button></div>:<div className="dashboard-list">{(notifications?.items||[]).slice(0,6).map(item=><Link to={notificationDestination(item,true)} key={item.id}><div className="activity-icon green"><MessageSquareText/></div><div><strong>{item.title}</strong><span>{item.message}</span></div><div className="activity-meta"><strong>{notificationDate(item.created_at).toLocaleDateString('en-GB')}</strong><span>{item.project_code}</span></div></Link>)}{!notifications?.items.length&&<div className="mini-empty"><Bell/>No project updates yet.</div>}</div>}<Link className="panel-action" to={`/notifications${registerSearch(selectedProject,{tab:'email'})}`}><Mail/> Manage notification emails <ArrowRight/></Link></section>
    </div>
  </>
  return <>
    <section className="dashboard-hero">
      <div className="dashboard-hero-copy">
        <div className="breadcrumb">{dateLabel} <span>/</span> {labels[selectedProject]}</div>
        <span className="hero-live"><Radio /> Live control room</span>
        <h1>{greeting}, {firstName}.</h1>
        <p>Here is the document route that needs attention across {labels[selectedProject].toLowerCase()}.</p>
        <Link className="primary-button" to={`/documents/week${registerSearch()}`}>Open register <ArrowRight size={16}/></Link>
      </div>
      <div className="dashboard-route-rail" aria-label="Current document route overview">
        <div className="route-rail-head"><span>Workspace route</span><strong>{items.length} tracked documents</strong></div>
        <div className="route-rail-stages">
          <div className="complete"><i><Files /></i><span><b>Register</b><small>{items.length} total</small></span></div>
          <div className="active"><i><Clock3 /></i><span><b>Submission</b><small>{active} active</small></span></div>
          <div><i><MessageSquareText /></i><span><b>Workflow</b><small>{feedbackPending} pending</small></span></div>
          <div><i><Send /></i><span><b>Transmittal</b><small>Issue control</small></span></div>
        </div>
      </div>
    </section>
    <div className="metric-grid">
      <Metric index={0} icon={<Files/>} tone="blue" label="Total documents" value={data?.total||0} note={labels[selectedProject]}/>
      <Metric index={1} icon={<Clock3/>} tone="amber" label="Active workflows" value={active} note="In submission process"/>
      <Metric index={2} icon={<CheckCircle2/>} tone="green" label="Completed" value={complete} note="All submission stages complete"/>
      <Metric index={3} icon={<FileCheck2/>} tone="purple" label="Awaiting feedback" value={feedbackPending} note={`${currentFeedbackReviewers.join(' or ')} pending`}/>
    </div>

    <div className="dashboard-row dashboard-row-primary">
      <section className="panel dashboard-panel documents-complete-panel"><div className="panel-heading"><div><h2>Documents to complete</h2><p>Outstanding Submission Progress work</p></div><Link to={`/documents/all${registerSearch()}`}>View all <ArrowRight size={14}/></Link></div><div className="dashboard-list">{pending.map(item=>{const steps=stepsFor(item);const done=completedSteps(item,steps);const next=steps.find(step=>!item.submission_progress[step]);return <Link to={{pathname:'/documents/all',search:registerSearch(item.project_code,{package:String(item.id)})}} key={item.id}><div className="activity-icon"><Clock3/></div><div><strong>{item.document_number}</strong><span><b className={`dashboard-project project-${item.project_code.toLowerCase()}`}>{item.project_code}</b>{item.document_title||item.document_type} · Next: {next||'Complete'}</span><div className="mini-progress"><i style={{width:`${done/steps.length*100}%`}}/></div></div><div className="activity-meta"><strong>{done}/{steps.length}</strong><span>steps</span></div></Link>})}{!pending.length&&<div className="mini-empty"><CheckCircle2/>All documents have completed Submission Progress.</div>}</div></section>
      <div className="dashboard-change-column">
        <ChangePanel title="Progress Submission Change" subtitle="Submission updates received since midnight" items={submissionChanges} icon={<ListChecks/>} empty="No submission progress changes recorded today." detail={item=>item.message} destination={item=>notificationDestination(item,!can('packages:write',item.project_code||undefined))}/>
        <ChangePanel title="Workflow Update Change" subtitle="Feedback updates received since midnight" items={workflowChanges} icon={<MessageSquareText/>} empty="No workflow feedback changes recorded today." detail={workflowChangeDetail} destination={item=>notificationDestination(item,!can('packages:write',item.project_code||undefined))}/>
      </div>
    </div>

    <div className="dashboard-row dashboard-row-secondary">
      <section className="panel dashboard-panel status-panel"><div className="panel-heading"><div><h2>Workflow status</h2><p>Feedback status distribution across visible documents</p></div><span className="trend"><TrendingUp size={14}/> Live</span></div><div className="status-overview"><div className="status-donut" style={{background:statusGradient}}><div><strong>{items.length}</strong><span>workflows</span></div></div><div className="status-legend">{statusRows.map(row=><div key={row.code}><i style={{background:row.color}}/><b>{row.code}</b><span>{row.label}</span><strong>{items.length?Math.round(row.count/items.length*100):0}%</strong><small>{row.count}</small></div>)}</div></div><Link className="panel-action" to={`/workflow${registerSearch()}`}><Send/> Review status details <ArrowRight/></Link></section>
      <section className="panel dashboard-panel overview-panel"><div className="panel-heading"><div><h2>Workflow overview</h2><p>Current approval progress</p></div><span className="trend"><TrendingUp size={14}/> Live</span></div><div className="donut-wrap"><div className="donut" style={{background:overviewGradient}}><div><strong>{items.length}</strong><span>workflows</span></div></div><div className="donut-legend">{overviewRows.map(row=><div key={row.label}><i style={{background:row.color}}/><span>{row.label}</span><strong>{row.count}</strong></div>)}</div></div><Link className="panel-action" to={`/workflow${registerSearch()}`}><Send/> Review workflow register <ArrowRight/></Link></section>
    </div>
  </>
}

function completedSteps(item:{submission_progress:Record<string,boolean>},steps:readonly string[]){return steps.filter(step=>item.submission_progress[step]).length}
function Metric({icon,tone,label,value,note,index}:{icon:ReactNode;tone:string;label:string;value:number;note:string;index:number}){return <div className="metric-card stagger-item" style={{animationDelay:`${index*45}ms`}}><div className={`metric-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>}
function ChangePanel({title,subtitle,items,icon,empty,detail,destination}:{title:string;subtitle:string;items:WorkflowNotification[];icon:ReactNode;empty:string;detail:(item:WorkflowNotification)=>string;destination:(item:WorkflowNotification)=>ReturnType<typeof notificationDestination>}){
  return <section className="panel dashboard-panel dashboard-change-panel"><div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><span className="trend"><History size={14}/> {items.length} today</span></div><div className="dashboard-list workflow-change-list">{items.map(item=><Link to={destination(item)} key={item.id}><div className="activity-icon green">{icon}</div><div><strong>{item.workflow_number||item.document_number||'Workflow not assigned'}</strong><span>{detail(item)}</span></div><div className="activity-meta"><strong>{notificationDate(item.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</strong><span>{item.document_number||'document'}</span></div></Link>)}{!items.length&&<div className="mini-empty"><History/>{empty}</div>}</div></section>
}
