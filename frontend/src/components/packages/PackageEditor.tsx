import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LoaderCircle, Save, X } from 'lucide-react'
import type { ColumnConfig, InputColumnField, Package, PackageInput, ProjectCode, WorkflowConfig } from '../../types/package'
import { feedbackSteps, submissionSteps, type FeedbackStatusCode } from '../../types/package'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { ModalLayer } from '../common/ModalLayer'
import { useProjects } from '../../hooks/useProjects'
import { packagesApi } from '../../lib/api'
import { columnOptionsFor, defaultDisciplines, defaultDocumentTypes, findUsedTransmittal, isAutomaticTransmittalNumber, submissionStepsFor, transmittalPrefix } from '../../lib/projects'
import { SubmissionSlider } from './SubmissionSlider'
import { TransmittalSuggest } from './TransmittalSuggest'

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
  document_type: defaultDocumentTypes,
  discipline: defaultDisciplines,
}

export function PackageEditor({ item, configs, workflowConfig, open, saving, onClose, onSave, defaultProject }: { item: Package | null; configs: ColumnConfig[]; workflowConfig: WorkflowConfig; open: boolean; saving: boolean; onClose: () => void; onSave: (data: PackageInput) => void; defaultProject?: ProjectCode }) {
  const {projects, codes, labels, defaultCode} = useProjects()
  const createProject = defaultProject && codes.includes(defaultProject) ? defaultProject : defaultCode
  const [form, setForm] = useState<PackageInput>(() => blank(createProject))
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const configMap = useMemo(() => Object.fromEntries(configs.map(c => [c.field_name,c])) as Partial<Record<BaseField,ColumnConfig>>, [configs])
  const transmittalsQuery = useQuery({
    queryKey: ['transmittal-numbers', form.project_code],
    queryFn: () => packagesApi.transmittals(form.project_code),
    enabled: open && Boolean(form.project_code),
  })
  const seriesByPrefix = useMemo(() => Object.fromEntries((transmittalsQuery.data?.series || []).map((entry) => [entry.prefix, entry])), [transmittalsQuery.data])
  const suggestedFor = (project: string, documentType: string) => seriesByPrefix[transmittalPrefix(project, documentType)]
  const followsSeries = (value: string | null | undefined, project: string, documentType: string) => {
    const suggestion = suggestedFor(project, documentType)?.next
    return !value || isAutomaticTransmittalNumber(value, codes) || Boolean(suggestion && value === suggestion)
  }
  useEffect(() => {
    if (open) {
      const firstConfiguredOption=(field:BaseField,fallbackValue='')=>configMap[field]?.input_type==='select'?(columnOptionsFor(configMap[field],createProject,[fallbackValue])[0]||fallbackValue):fallbackValue
      const defaultDocumentType=firstConfiguredOption('document_type',fallback.document_type?.[0]||'')
      const defaultDiscipline=firstConfiguredOption('discipline',fallback.discipline?.[0]||'')
      setDuplicateOpen(false)
      setForm(item ? {
      project_code:item.project_code,
      document_number:item.document_number, document_title:item.document_title, document_date:item.document_date, document_type:item.document_type, initiator:item.initiator,
      discipline:item.discipline, number_of_documents:item.number_of_documents, transmittal_number:item.transmittal_number,
      workflow_terminated:item.workflow_terminated, notes:item.notes, has_attachment:item.has_attachment, is_abandoned:item.is_abandoned,
      workflow_number:item.workflow_number, submission_progress:{...item.submission_progress}, feedback:{...item.feedback}, feedback_status:{...item.feedback_status}, order_index:item.order_index,
    } : {...blank(createProject), document_date:today(), document_type:defaultDocumentType, discipline:defaultDiscipline, transmittal_number:transmittalPrefix(createProject,defaultDocumentType), submission_progress:Object.fromEntries(submissionStepsFor(workflowConfig,createProject).map(step=>[step,false])), feedback:{...Object.fromEntries(workflowConfig.feedback_reviewers.map(reviewer=>[reviewer,false])),Terminate:false},feedback_status:Object.fromEntries(workflowConfig.feedback_reviewers.map(reviewer=>[reviewer,'P']))})
    } else setDuplicateOpen(false)
  }, [item, open, workflowConfig, configMap, createProject])
  const currentSeries = suggestedFor(form.project_code, form.document_type)
  const duplicateUse = findUsedTransmittal(form.transmittal_number, transmittalsQuery.data?.used || [], item?.id)
  const payload = () => ({...form, document_date:form.document_date||today()})
  if (!open) return null
  const currentSteps=submissionStepsFor(workflowConfig,form.project_code)
  const remapProgress=(fromProject:ProjectCode,toProject:ProjectCode,progress:PackageInput['submission_progress'])=>{
    const previousSteps=submissionStepsFor(workflowConfig,fromProject)
    const nextSteps=submissionStepsFor(workflowConfig,toProject)
    return Object.fromEntries(nextSteps.map((step,index)=>[step,index<previousSteps.length?!!progress[previousSteps[index]]:false])) as PackageInput['submission_progress']
  }
  const set = <K extends keyof PackageInput>(key: K, value: PackageInput[K]) => setForm(prev => ({...prev,[key]:value}))
  const completeProgress = (project: ProjectCode) => Object.fromEntries(submissionStepsFor(workflowConfig, project).map(step => [step, true])) as PackageInput['submission_progress']
  const setBase = (field: BaseField, raw: string) => {
    if (field === 'number_of_documents') set(field, Math.max(1, Number(raw)))
    else if (field === 'document_type') setForm(previous => ({
      ...previous,
      document_type: raw,
      transmittal_number: !item && followsSeries(previous.transmittal_number, previous.project_code, previous.document_type)
        ? transmittalPrefix(previous.project_code,raw)
        : previous.transmittal_number,
    }))
    else if (field === 'workflow_number') setForm(previous => {
      const assigned = Boolean(raw.trim()) && !String(previous.workflow_number || '').trim()
      return {...previous, workflow_number: raw, submission_progress: assigned ? completeProgress(previous.project_code) : previous.submission_progress}
    })
    else set(field, raw)
  }
  return <ModalLayer open={open} onClose={() => { if (duplicateOpen) setDuplicateOpen(false); else onClose() }} label={item ? 'Edit document' : 'Create document'}>
    <form className="editor-modal" noValidate onSubmit={e=>{e.preventDefault(); if (duplicateUse) { setDuplicateOpen(true); return } onSave(payload())}}>
      <header><div><span className="eyebrow">{item?'Editing document':'New document'}</span><h2>{item?.document_number||'Create document'}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close editor"><X size={19}/></button></header>
      <div className="editor-body">
        <label className="project-choice"><span>Project</span><select value={form.project_code} onChange={event=>{const project=event.target.value as ProjectCode;setForm(previous=>({...previous,project_code:project,submission_progress:String(previous.workflow_number||'').trim()?completeProgress(project):remapProgress(previous.project_code,project,previous.submission_progress),transmittal_number:!item && followsSeries(previous.transmittal_number, previous.project_code, previous.document_type)?transmittalPrefix(project,previous.document_type):previous.transmittal_number}))}}>{!projects.some(project=>project.code===form.project_code)&&form.project_code&&<option value={form.project_code}>{form.project_code}</option>}{projects.map(project=><option key={project.code} value={project.code}>{project.code} · {labels[project.code]}</option>)}</select><small>WF numbering remains shared across all projects.</small></label>
        <div className="form-grid">{fields.map(field => {
          const config=configMap[field.name]
          const options=config?.input_type==='select' ? columnOptionsFor(config,form.project_code,fallback[field.name]||[]) : fallback[field.name]
          const value=String(form[field.name]??'')
          const inputType=field.name==='document_date'?'date':field.name==='number_of_documents'?'number':'text'
          return <label key={field.name}><span>{field.label}</span>{options?.length ? <select value={value} onChange={e=>setBase(field.name,e.target.value)}><option value="">Select {field.label.toLowerCase()}</option>{!options.includes(value)&&value&&<option value={value}>{value}</option>}{options.map(option=><option key={option} value={option}>{option}</option>)}</select> : <input type={inputType} min={inputType==='number'?1:undefined} value={value} placeholder={field.placeholder} onChange={e=>setBase(field.name,e.target.value)} aria-invalid={field.name==='transmittal_number'&&!!duplicateUse}/>}{field.name==='transmittal_number'&&duplicateUse&&<small className="field-warning" role="status">Already used on {duplicateUse.document_number}. You can still keep this number.</small>}</label>
        })}
        {!item && <TransmittalSuggest next={currentSeries?.next || transmittalPrefix(form.project_code, form.document_type) + '001'} applied={Boolean(currentSeries?.next && form.transmittal_number === currentSeries.next)} loading={transmittalsQuery.isLoading} error={transmittalsQuery.isError} onApply={() => currentSeries?.next && set('transmittal_number', currentSeries.next)} />}
        </div>
        <details className="editor-more">
          <summary>More</summary>
          <fieldset><legend>Submission progress</legend><SubmissionSlider steps={currentSteps} value={currentSteps.filter(step=>form.submission_progress[step]).length} onChange={value=>set('submission_progress',Object.fromEntries(currentSteps.map((step,index)=>[step,index<value])) as PackageInput['submission_progress'])} disabled={form.is_abandoned}/></fieldset>
          <fieldset><legend>Has attachment</legend><div className="editor-switch-row"><div><strong>Document has attachment</strong><span>Highlights the row and replaces the date display.</span></div><label className="switch"><input type="checkbox" checked={form.has_attachment} onChange={e=>set('has_attachment',e.target.checked)}/><i/></label></div></fieldset>
          <fieldset><legend>Feedback Status</legend><div className="feedback-status-editor">{workflowConfig.feedback_reviewers.map(reviewer=><label key={reviewer}><span>{reviewer}</span><select value={form.feedback_status[reviewer]||'P'} onChange={e=>{const status=e.target.value as FeedbackStatusCode;setForm(previous=>({...previous,feedback_status:{...previous.feedback_status,[reviewer]:status},feedback:{...previous.feedback,[reviewer]:status!=='P'}}))}}>{Object.entries(workflowConfig.feedback_status_labels).map(([code,label])=><option key={code} value={code}>{code} – {label}</option>)}</select></label>)}</div><div className="editor-switch-row terminate-feedback-row"><div><strong>Terminate workflow</strong><span>Terminates the feedback workflow and displays its progress bar in grey.</span></div><label className="switch"><input type="checkbox" checked={form.workflow_terminated||form.feedback.Terminate} onChange={e=>{const terminated=e.target.checked;setForm(previous=>({...previous,workflow_terminated:terminated,feedback:{...previous.feedback,Terminate:terminated}}))}}/><i/></label></div></fieldset>
        </details>
      </div>
      <footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving?<LoaderCircle className="spin" size={16}/>:<Save size={16}/>} {saving?'Saving…':'Save document'}</button></footer>
    </form>
    <ConfirmDialog
      open={duplicateOpen}
      title="Transmittal number already used"
      description={<>{form.transmittal_number} is already used{duplicateUse ? <> on <strong>{duplicateUse.document_number}</strong></> : null}. This is only a warning — continue if the duplicate is intentional.</>}
      confirmLabel="Continue"
      cancelLabel="Go back"
      tone="warning"
      onClose={() => setDuplicateOpen(false)}
      onConfirm={() => onSave(payload())}
    />
  </ModalLayer>
}
