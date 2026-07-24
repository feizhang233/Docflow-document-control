import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Ban, Calendar, FileStack, FileText, Hash, MessageSquareText, OctagonX, Paperclip, RefreshCw, Save, UserRound, X } from 'lucide-react'
import { getApiError, notificationsApi, packagesApi } from '../../lib/api'
import type { ColumnConfig, Package, PackageInput, WorkflowConfig } from '../../types/package'
import { StatusBadge } from '../common/StatusBadge'
import { FeedbackStatus } from './FeedbackStatus'
import { SubmissionSlider } from './SubmissionSlider'

export function PackageDrawer({item,configs,workflowConfig,saving,onUpdate,onClose}:{item:Package|null;configs:ColumnConfig[];workflowConfig:WorkflowConfig;saving:boolean;onUpdate:(data:Partial<PackageInput>)=>void;onClose:()=>void}){
  const [notes,setNotes]=useState('')
  const [sliderValue,setSliderValue]=useState(0)
  const commentsQuery=useQuery({
    queryKey:['workflow-comments',item?.id],
    queryFn:()=>packagesApi.listWorkflowComments(item!.id),
    enabled:!!item,
    refetchInterval:item?30_000:false,
  })
  const feedbackQuery=useQuery({
    queryKey:['notifications','workflow-feedback',item?.id],
    queryFn:()=>notificationsApi.listWorkflowFeedback(item!.id),
    enabled:!!item,
    refetchInterval:item?30_000:false,
  })
  useEffect(()=>{setNotes(item?.notes||'');setSliderValue(item?workflowConfig.submission_steps.filter(step=>item.submission_progress[step]).length:0)},[item,workflowConfig.submission_steps])
  if(!item)return null
  const comments=commentsQuery.data?.items||[]
  const legacyFeedback=feedbackQuery.data?.items||[]
  const feedbackLoading=commentsQuery.isLoading&&feedbackQuery.isLoading
  const feedbackError=commentsQuery.isError&&feedbackQuery.isError
  const feedbackFetching=commentsQuery.isFetching||feedbackQuery.isFetching
  const typeColor=configs.find(config=>config.field_name==='document_type')?.option_colors[item.document_type]
  const commitSlider=(value:number)=>onUpdate({submission_progress:Object.fromEntries(workflowConfig.submission_steps.map((step,index)=>[step,index<value])) as PackageInput['submission_progress']})
  return <div className="drawer-layer" role="dialog" aria-modal="true" aria-label="Document details"><div className="drawer-backdrop" onClick={onClose}/><aside className="detail-drawer"><header><div><span className="eyebrow">Document details</span><h2>{item.document_number}</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></header><div className="drawer-body">
    <div className={`detail-hero ${item.is_abandoned?'abandoned':''}`}><div className="hero-badges"><StatusBadge status={item.document_type||'Unclassified'} color={typeColor}/>{item.is_abandoned&&<span className="badge abandoned"><Ban/>Abandoned</span>}{item.workflow_terminated&&<span className="badge terminated"><OctagonX/>Workflow terminated</span>}</div><h3>{item.discipline||'No discipline'}</h3><p>Last updated {new Date(item.updated_at).toLocaleString()}</p></div>
    <div className="detail-grid"><div className="document-title-detail"><FileText/><span>Document Title</span><strong>{item.document_title||'—'}</strong></div><div><UserRound/><span>Initiator</span><strong>{item.initiator||'—'}</strong></div><div><FileStack/><span>Documents</span><strong>{item.number_of_documents}</strong></div><div><Hash/><span>Workflow</span><strong>{item.workflow_number||'—'}</strong></div><div><Hash/><span>Transmittal</span><strong>{item.transmittal_number||'—'}</strong></div><div><Calendar/><span>Date</span><strong>{item.has_attachment?'Attachment':item.document_date}</strong></div><div><OctagonX/><span>Terminate Workflow</span><strong>{item.workflow_terminated?'Terminated':'Not terminated'}</strong></div></div>
    <section className="drawer-section attachment-section"><div><Paperclip/><div><h4>Has attachment</h4><p>Highlight this document and replace its date display with an attachment label.</p></div></div><label className="switch"><input type="checkbox" checked={item.has_attachment} onChange={e=>onUpdate({has_attachment:e.target.checked})}/><i/></label></section>
    <section className="drawer-section notes-section"><div className="section-heading"><h4>Notes</h4><button className="secondary-button" disabled={saving||notes===item.notes} onClick={()=>onUpdate({notes})}><Save/>Save notes</button></div><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Add document control notes, decisions or follow-up context…"/></section>
    <section className={`drawer-section submission-slider-section ${item.is_abandoned?'disabled':''}`}>
      <div className="section-heading"><h4>Submission progress</h4><span>{item.is_abandoned?'Stopped':'Drag to update'}</span></div>
      <SubmissionSlider steps={workflowConfig.submission_steps} value={sliderValue} onChange={setSliderValue} onCommit={commitSlider} disabled={item.is_abandoned||saving}/>
    </section>
    <section className="drawer-section feedback-status-section">
      <div className="section-heading"><h4>External feedback</h4><span>Feedback Status</span></div>
      <FeedbackStatus item={item} reviewers={workflowConfig.feedback_reviewers} statusLabels={workflowConfig.feedback_status_labels} statusColors={workflowConfig.feedback_status_colors}/>
      <div className="workflow-feedback-response">
        <div className="workflow-feedback-response-heading"><span><MessageSquareText/>Workflow response</span>{feedbackFetching&&!feedbackLoading&&<RefreshCw className="spin"/>}</div>
        {feedbackLoading?<div className="workflow-feedback-state"><RefreshCw className="spin"/>Loading feedback…</div>
          :feedbackError?<div className="workflow-feedback-state error">{getApiError(commentsQuery.error||feedbackQuery.error)} <button type="button" onClick={()=>{commentsQuery.refetch();feedbackQuery.refetch()}}>Retry</button></div>
          :comments.length?<div className="workflow-feedback-list">{comments.map(comment=>{const timestamp=comment.commented_at||comment.synced_at;return <article key={comment.id}>{comment.author&&<strong>{comment.author}</strong>}<p>{comment.body}</p><time dateTime={timestamp}>{format(new Date(timestamp),'MMM d, yyyy · HH:mm')}</time></article>})}</div>
          :legacyFeedback.length?<div className="workflow-feedback-list">{legacyFeedback.map(feedback=><article key={feedback.id}><p>{feedback.message}</p><time dateTime={feedback.created_at}>{format(new Date(feedback.created_at),'MMM d, yyyy · HH:mm')}</time></article>)}</div>
          :<div className="workflow-feedback-state">No workflow feedback received yet.</div>}
      </div>
    </section>
  </div></aside></div>
}
