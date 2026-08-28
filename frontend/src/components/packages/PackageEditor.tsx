import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, LoaderCircle, Save } from 'lucide-react'
import type { ColumnConfig, InputColumnField, Package, PackageInput, ProjectCode, WorkflowConfig } from '../../types/package'
import { feedbackSteps, submissionSteps, type FeedbackStatusCode } from '../../types/package'
import { useProjects } from '../../hooks/useProjects'
import { columnOptionsFor, isAutomaticTransmittalNumber, submissionStepsFor, transmittalPrefix } from '../../lib/projects'
import { SubmissionSlider } from './SubmissionSlider'

const emptyProgress = Object.fromEntries(submissionSteps.map(s => [s, false])) as PackageInput['submission_progress']
const emptyFeedback = {...Object.fromEntries(feedbackSteps.map(s => [s, false])),Terminate:false} as PackageInput['feedback']
const today = () => new Date().toISOString().slice(0, 10)
const blank = (project = 'NFS'): PackageInput => ({
  project_code: project,
  document_number: '', document_title: '', document_date: today(), document_type: 'Drawing', initiator: '', discipline: '', number_of_documents: 1,
  transmittal_number: transmittalPrefix(project,'Drawing'), workflow_number: '', workflow_terminated:false, notes:'', has_attachment:false, is_abandoned:false,
  submission_progress: emptyProgress, feedback: emptyFeedback, feedback_status:{UTIBER:'P',GDS:'P'}, order_index: 0,
})
type BaseField = InputColumnField
const fields: Array<{ name: BaseField; label: string; placeholder?: string }> = [
  {name:'document_number',label:'Document number',placeholder:'Auto-generated if left blank'},
  {name:'document_title',label:'Document title',placeholder:'Enter document title'},
  {name:'document_date',label:'Date'},
  {name:'document_type',label:'Document type'},
  {name:'initiator',label:'Initiator',placeholder:'Full name'},
  {name:'discipline',label:'Discipline'},
  {name:'number_of_documents',label:'Number of documents'},
  {name:'workflow_number',label:'Workflow number',placeholder:'WF-000000'},
  {name:'transmittal_number',label:'Transmittal number',placeholder:'Project-PCH-TRA-'},
]
const fallback: Partial<Record<BaseField, string[]>> = {
  document_type:['Drawing','Technical Report','Method Statement','Specification','Calculation'],
  discipline:['Civil','Structural','Architectural','Electrical','Mechanical','Geotechnical'],
}

export function PackageEditor({ item, configs, workflowConfig, saving, onClose, onSave }: { item: Package | null; configs: ColumnConfig[]; workflowConfig: WorkflowConfig; saving: boolean; onClose: () => void; onSave: (data: PackageInput) => void }) {
  const {projects, codes, labels, defaultCode} = useProjects()
  const [form, setForm] = useState<PackageInput>(() => blank(defaultCode))
  const configMap = useMemo(() => Object.fromEntries(configs.map(c => [c.field_name,c])) as Partial<Record<BaseField,ColumnConfig>>, [configs])
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const previous = document.title
    document.title = `${item ? `Edit ${item.document_number}` : 'Create document'} — DocFlow`
    return () => { document.title = previous }
  }, [item])
  useEffect(() => {
    const firstConfiguredOption=(field:BaseField,fallbackValue='')=>configMap[field]?.input_type==='select'?(columnOptionsFor(configMap[field],defaultCode,[fallbackValue])[0]||fallbackValue):fallbackValue
    const defaultDocumentType=firstConfiguredOption('document_type',fallback.document_type?.[0]||'')
    const defaultDiscipline=firstConfiguredOption('discipline',fallback.discipline?.[0]||'')
    setForm(item ? {
      project_code:item.project_code,
      document_number:item.document_number, document_title:item.document_title, document_date:item.document_date, document_type:item.document_type, initiator:item.initiator,
      discipline:item.discipline, number_of_documents:item.number_of_documents, transmittal_number:item.transmittal_number,
      workflow_terminated:item.workflow_terminated, notes:item.notes, has_attachment:item.has_attachment, is_abandoned:item.is_abandoned,
      workflow_number:item.workflow_number, submission_progress:{...item.submission_progress}, feedback:{...item.feedback}, feedback_status:{...item.feedback_status}, order_index:item.order_index,
    } : {...blank(defaultCode), document_date:today(), document_type:defaultDocumentType, discipline:defaultDiscipline, transmittal_number:transmittalPrefix(defaultCode,defaultDocumentType), submission_progress:Object.fromEntries(submissionStepsFor(workflowConfig,defaultCode).map(step=>[step,false])), feedback:{...Object.fromEntries(workflowConfig.feedback_reviewers.map(reviewer=>[reviewer,false])),Terminate:false},feedback_status:Object.fromEntries(workflowConfig.feedback_reviewers.map(reviewer=>[reviewer,'P']))})
  }, [item, workflowConfig, configMap, defaultCode])
  useEffect(() => {
    window.scrollTo(0, 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
  const currentSteps=submissionStepsFor(workflowConfig,form.project_code)
  const remapProgress=(project:ProjectCode,progress:PackageInput['submission_progress'])=>{
    const previousSteps=submissionStepsFor(workflowConfig,form.project_code)
    const nextSteps=submissionStepsFor(workflowConfig,project)
    return Object.fromEntries(nextSteps.map((step,index)=>[step,index<previousSteps.length?!!progress[previousSteps[index]]:false])) as PackageInput['submission_progress']
  }
  const set = <K extends keyof PackageInput>(key: K, value: PackageInput[K]) => setForm(prev => ({...prev,[key]:value}))
  const setBase = (field: BaseField, raw: string) => {
    if (field === 'number_of_documents') set(field, Math.max(1, Number(raw)))
    else if (field === 'document_type') setForm(previous => ({
      ...previous,
      document_type: raw,
      transmittal_number: !item || !previous.transmittal_number || isAutomaticTransmittalNumber(previous.transmittal_number, codes)
        ? transmittalPrefix(previous.project_code,raw)
        : previous.transmittal_number,
    }))
    else set(field, raw)
  }
  const projectLabel = labels[form.project_code] || form.project_code
  return (
    <form className="editor-page" noValidate onSubmit={e=>{e.preventDefault();onSave({...form,document_date:form.document_date||today()})}}>
      <div className="page-header">
        <div>
          <div className="breadcrumb">Document Control <span>/</span> {projectLabel} <span>/</span> {item ? 'Edit document' : 'New document'}</div>
          <h1>{item?.document_number || 'Create document'}</h1>
          <p>{item ? 'Update this document in the current register.' : 'Add a document to the current register.'}</p>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-button" onClick={onClose}><ChevronLeft size={16} /> Back to register</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} {saving ? 'Saving…' : 'Save document'}</button>
        </div>
      </div>
      <section className="data-card editor-card">
        <div className="editor-body">
          <label className="project-choice"><span>Project</span><select value={form.project_code} onChange={event=>{const project=event.target.value as ProjectCode;setForm(previous=>({...previous,project_code:project,submission_progress:remapProgress(project,previous.submission_progress),transmittal_number:!previous.transmittal_number||isAutomaticTransmittalNumber(previous.transmittal_number,codes)?transmittalPrefix(project,previous.document_type):previous.transmittal_number}))}}>{!projects.some(project=>project.code===form.project_code)&&form.project_code&&<option value={form.project_code}>{form.project_code}</option>}{projects.map(project=><option key={project.code} value={project.code}>{project.code} · {labels[project.code]}</option>)}</select><small>WF numbering remains shared across all projects.</small></label>
          <div className="form-grid">{fields.map(field => {
            const config=configMap[field.name]
            const options=config?.input_type==='select' ? columnOptionsFor(config,form.project_code,fallback[field.name]||[]) : fallback[field.name]
            const value=String(form[field.name]??'')
            const inputType=field.name==='document_date'?'date':field.name==='number_of_documents'?'number':'text'
            return <label key={field.name}><span>{field.label}</span>{options?.length ? <select value={value} onChange={e=>setBase(field.name,e.target.value)}><option value="">Select {field.label.toLowerCase()}</option>{!options.includes(value)&&value&&<option value={value}>{value}</option>}{options.map(option=><option key={option} value={option}>{option}</option>)}</select> : <input type={inputType} min={inputType==='number'?1:undefined} value={value} placeholder={field.placeholder} onChange={e=>setBase(field.name,e.target.value)}/>}</label>
          })}</div>
          <div className="editor-sections">
            <fieldset>
              <legend>Submission progress</legend>
              <SubmissionSlider steps={currentSteps} value={currentSteps.filter(step=>form.submission_progress[step]).length} onChange={value=>set('submission_progress',Object.fromEntries(currentSteps.map((step,index)=>[step,index<value])) as PackageInput['submission_progress'])} disabled={form.is_abandoned}/>
            </fieldset>
            <fieldset>
              <legend>Has attachment</legend>
              <div className="editor-switch-row"><div><strong>Document has attachment</strong><span>Highlights the row and replaces the date display.</span></div><label className="switch"><input type="checkbox" checked={form.has_attachment} onChange={e=>set('has_attachment',e.target.checked)}/><i/></label></div>
            </fieldset>
            <fieldset>
              <legend>Feedback Status</legend>
              <div className="feedback-status-editor">{workflowConfig.feedback_reviewers.map(reviewer=><label key={reviewer}><span>{reviewer}</span><select value={form.feedback_status[reviewer]||'P'} onChange={e=>{const status=e.target.value as FeedbackStatusCode;setForm(previous=>({...previous,feedback_status:{...previous.feedback_status,[reviewer]:status},feedback:{...previous.feedback,[reviewer]:status!=='P'}}))}}>{Object.entries(workflowConfig.feedback_status_labels).map(([code,label])=><option key={code} value={code}>{code} – {label}</option>)}</select></label>)}</div>
              <div className="editor-switch-row terminate-feedback-row"><div><strong>Terminate workflow</strong><span>Terminates the feedback workflow and displays its progress bar in grey.</span></div><label className="switch"><input type="checkbox" checked={form.feedback.Terminate} onChange={e=>set('feedback',{...form.feedback,Terminate:e.target.checked})}/><i/></label></div>
            </fieldset>
          </div>
        </div>
      </section>
    </form>
  )
}
