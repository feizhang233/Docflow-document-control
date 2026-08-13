import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, Clock3, FileCheck2, Files, History, ListChecks, MessageSquareText, Send, TrendingUp } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { notificationsApi, packagesApi, settingsApi } from '../lib/api'
import { getEffectiveFeedbackStatus } from '../components/packages/FeedbackStatus'
import { feedbackStatusLabels, feedbackSteps, submissionSteps, type FeedbackStatusCode, type Package, type ProjectFilter, type WorkflowNotification } from '../types/package'
import { useProjects } from '../hooks/useProjects'
import { projectFilterFrom } from '../lib/projects'

const defaultColors:Record<FeedbackStatusCode,string>={A:'#21815d',B:'#9b6816',C:'#b13f4c',P:'#4267bd'}

export function DashboardPage() {
  const [searchParams]=useSearchParams()
  const {codes,labels}=useProjects()
  const selectedProject=projectFilterFrom(searchParams.get('project'),codes)
  const projectCode=selectedProject==='ALL'?undefined:selectedProject
  const {data}=useQuery({queryKey:['dashboard-packages',selectedProject],queryFn:()=>packagesApi.listAll({period:'all',project_code:projectCode})})
  const {data:workflowConfig}=useQuery({queryKey:['workflow-config'],queryFn:settingsApi.getWorkflow})
  const {data:notifications}=useQuery({queryKey:['notifications','dashboard'],queryFn:()=>notificationsApi.list(100),refetchInterval:30_000})
  const currentSubmissionSteps=workflowConfig?.submission_steps||submissionSteps
  const currentFeedbackReviewers=workflowConfig?.feedback_reviewers||feedbackSteps
  const statusLabels=workflowConfig?.feedback_status_labels||feedbackStatusLabels
  const statusColors=workflowConfig?.feedback_status_colors||defaultColors
  const items=data?.items||[]
  const complete=items.filter(item=>currentSubmissionSteps.every(step=>item.submission_progress[step])).length
  const feedbackPending=items.filter(item=>!item.feedback.Terminate&&currentFeedbackReviewers.some(step=>!item.feedback[step])).length
  const active=items.length-complete
  const [utiberReviewer='UTIBER',gdsReviewer='GDS']=currentFeedbackReviewers
  const approvalFinished=(item:typeof items[number],reviewer:string)=>['A','B','C'].includes(item.feedback_status[reviewer]||'P')
  const terminated=items.filter(item=>item.feedback.Terminate).length
  const gdsCompleted=items.filter(item=>!item.feedback.Terminate&&approvalFinished(item,gdsReviewer)).length
  const utiberCompleted=items.filter(item=>!item.feedback.Terminate&&!approvalFinished(item,gdsReviewer)&&approvalFinished(item,utiberReviewer)).length
  const awaitingApproval=items.length-terminated-gdsCompleted-utiberCompleted
  const overviewRows=[
    {label:'GDS completed',count:gdsCompleted,color:'#32a87b'},
    {label:'UTIBER completed and Waiting GDS',count:utiberCompleted,color:'#4974e9'},
    {label:'Awaiting Utiber',count:awaitingApproval,color:'#e0a044'},
    {label:'Terminate',count:terminated,color:'#858d99'},
  ]
  let overviewOffset=0
  const overviewGradient=items.length?`conic-gradient(${overviewRows.map(row=>{const start=overviewOffset;overviewOffset+=row.count/items.length*100;return `${row.color} ${start}% ${overviewOffset}%`}).join(',')})`:'#e7ebf1'
  const pending=items.filter(item=>!item.is_abandoned&&!item.workflow_terminated&&!item.feedback.Terminate&&!currentSubmissionSteps.every(step=>item.submission_progress[step])).sort((left,right)=>completedSteps(right,currentSubmissionSteps)-completedSteps(left,currentSubmissionSteps)).slice(0,8)
  const today=new Date()
  const packageForNotification=(notification:WorkflowNotification)=>items.find(item=>item.id===notification.package_id)||items.find(item=>item.workflow_number===notification.workflow_number&&item.document_number===notification.document_number)
  const todayChanges=(notifications?.items||[]).filter(item=>new Date(item.created_at).toDateString()===today.toDateString()&&(selectedProject==='ALL'||!!packageForNotification(item)))
  const submissionChanges=todayChanges.filter(item=>item.notification_type==='submission_progress')
  const workflowChanges=todayChanges.filter(item=>item.notification_type!=='submission_progress')
  const workflowChangeDetail=(notification:WorkflowNotification)=>{
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
  return <>
    <div className="page-header dashboard-heading"><div><div className="breadcrumb">{dateLabel} <span>/</span> {labels[selectedProject]}</div><h1>Good morning, Zhang</h1><p>Here’s what needs attention across {labels[selectedProject].toLowerCase()}.</p></div><Link className="primary-button" to={`/documents/week${registerSearch()}`}>Open register <ArrowRight size={16}/></Link></div>
    <div className="metric-grid">
      <Metric icon={<Files/>} tone="blue" label="Total documents" value={data?.total||0} note={labels[selectedProject]}/>
      <Metric icon={<Clock3/>} tone="amber" label="Active workflows" value={active} note="In submission process"/>
      <Metric icon={<CheckCircle2/>} tone="green" label="Completed" value={complete} note="All submission stages complete"/>
      <Metric icon={<FileCheck2/>} tone="purple" label="Awaiting feedback" value={feedbackPending} note={`${currentFeedbackReviewers.join(' or ')} pending`}/>
    </div>

    <div className="dashboard-row dashboard-row-primary">
      <section className="panel dashboard-panel documents-complete-panel"><div className="panel-heading"><div><h2>Documents to complete</h2><p>Outstanding Submission Progress work</p></div><Link to={`/documents/all${registerSearch()}`}>View all <ArrowRight size={14}/></Link></div><div className="dashboard-list">{pending.map(item=>{const done=completedSteps(item,currentSubmissionSteps);const next=currentSubmissionSteps.find(step=>!item.submission_progress[step]);return <Link to={{pathname:'/documents/all',search:registerSearch(item.project_code,{package:String(item.id)})}} key={item.id}><div className="activity-icon"><Clock3/></div><div><strong>{item.document_number}</strong><span><b className={`dashboard-project project-${item.project_code.toLowerCase()}`}>{item.project_code}</b>{item.document_title||item.document_type} · Next: {next||'Complete'}</span><div className="mini-progress"><i style={{width:`${done/currentSubmissionSteps.length*100}%`}}/></div></div><div className="activity-meta"><strong>{done}/{currentSubmissionSteps.length}</strong><span>steps</span></div></Link>})}{!pending.length&&<div className="mini-empty"><CheckCircle2/>All documents have completed Submission Progress.</div>}</div></section>
      <div className="dashboard-change-column">
        <ChangePanel title="Progress Submission Change" subtitle="Submission updates received since midnight" items={submissionChanges} icon={<ListChecks/>} empty="No submission progress changes recorded today." detail={item=>item.message} destination={item=>notificationDestination(item,items)}/>
        <ChangePanel title="Workflow Update Change" subtitle="Feedback updates received since midnight" items={workflowChanges} icon={<MessageSquareText/>} empty="No workflow feedback changes recorded today." detail={workflowChangeDetail} destination={item=>notificationDestination(item,items)}/>
      </div>
    </div>

    <div className="dashboard-row dashboard-row-secondary">
      <section className="panel dashboard-panel status-panel"><div className="panel-heading"><div><h2>Workflow status</h2><p>Feedback status distribution across visible documents</p></div><span className="trend"><TrendingUp size={14}/> Live</span></div><div className="status-overview"><div className="status-donut" style={{background:statusGradient}}><div><strong>{items.length}</strong><span>workflows</span></div></div><div className="status-legend">{statusRows.map(row=><div key={row.code}><i style={{background:row.color}}/><b>{row.code}</b><span>{row.label}</span><strong>{items.length?Math.round(row.count/items.length*100):0}%</strong><small>{row.count}</small></div>)}</div></div><Link className="panel-action" to={`/workflow${registerSearch()}`}><Send/> Review status details <ArrowRight/></Link></section>
      <section className="panel dashboard-panel overview-panel"><div className="panel-heading"><div><h2>Workflow overview</h2><p>Current approval progress</p></div><span className="trend"><TrendingUp size={14}/> Live</span></div><div className="donut-wrap"><div className="donut" style={{background:overviewGradient}}><div><strong>{items.length}</strong><span>workflows</span></div></div><div className="donut-legend">{overviewRows.map(row=><div key={row.label}><i style={{background:row.color}}/><span>{row.label}</span><strong>{row.count}</strong></div>)}</div></div><Link className="panel-action" to={`/workflow${registerSearch()}`}><Send/> Review workflow register <ArrowRight/></Link></section>
    </div>
  </>
}

function completedSteps(item:{submission_progress:Record<string,boolean>},steps:readonly string[]){return steps.filter(step=>item.submission_progress[step]).length}
function Metric({icon,tone,label,value,note}:{icon:React.ReactNode;tone:string;label:string;value:number;note:string}){return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>}
function notificationDestination(item:WorkflowNotification,packages:Package[]){
  const focus=item.document_number||item.workflow_number
  const current=packages.find(entry=>entry.id===item.package_id)||packages.find(entry=>entry.workflow_number===item.workflow_number&&entry.document_number===item.document_number)
  const params=new URLSearchParams({...(focus?{focus}:{}),notification:String(item.id),...(item.package_id?{package:String(item.package_id)}:{}),...(current?{project:current.project_code}:{})})
  return{pathname:item.notification_type==='submission_progress'?'/documents/all':'/workflow',search:`?${params}`}
}
function ChangePanel({title,subtitle,items,icon,empty,detail,destination}:{title:string;subtitle:string;items:WorkflowNotification[];icon:React.ReactNode;empty:string;detail:(item:WorkflowNotification)=>string;destination:(item:WorkflowNotification)=>ReturnType<typeof notificationDestination>}){
  return <section className="panel dashboard-panel dashboard-change-panel"><div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><span className="trend"><History size={14}/> {items.length} today</span></div><div className="dashboard-list workflow-change-list">{items.map(item=><Link to={destination(item)} state={{notificationFocusNonce:item.id}} key={item.id}><div className="activity-icon green">{icon}</div><div><strong>{item.workflow_number||item.document_number||'Workflow not assigned'}</strong><span>{detail(item)}</span></div><div className="activity-meta"><strong>{new Date(item.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</strong><span>{item.document_number||'document'}</span></div></Link>)}{!items.length&&<div className="mini-empty"><History/>{empty}</div>}</div></section>
}
