import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Building2, Check, Download, FileJson, FileSpreadsheet, ListFilter, LoaderCircle, Plus, RotateCcw, Save, Upload, Workflow, X } from 'lucide-react'
import { toast } from 'sonner'
import { SyncedHorizontalScroll } from '../components/common/SyncedHorizontalScroll'
import { getApiError, metadataApi, packagesApi, settingsApi } from '../lib/api'
import type { ColumnConfig, CsvImportRow, FeedbackStatusCode, MetadataBackup, ProjectConfig, WorkflowConfig } from '../types/package'
import { useProjects } from '../hooks/useProjects'

type ImportMode = 'merge'|'replace'
type CsvImportPreview = { fileName:string; rows:CsvImportRow[] }
type SettingsSection = 'columns'|'projects'|'workflow'|'backup'
type ColumnRegister = 'documents'|'workflow'|'transmittal'
const palette=['#3164ce','#7453be','#21815d','#b06a1d','#b13f4c','#9b4d80','#3970c7','#68717e']

export function SettingsPage() {
  const queryClient=useQueryClient()
  const inputRef=useRef<HTMLInputElement>(null)
  const csvInputRef=useRef<HTMLInputElement>(null)
  const [backup,setBackup]=useState<MetadataBackup|null>(null)
  const [csvImport,setCsvImport]=useState<CsvImportPreview|null>(null)
  const [fileName,setFileName]=useState('')
  const [mode,setMode]=useState<ImportMode>('merge')
  const [csvMode,setCsvMode]=useState<ImportMode>('merge')
  const [section,setSection]=useState<SettingsSection>('columns')
  const [columnRegister,setColumnRegister]=useState<ColumnRegister>('documents')
  const configs=useQuery({queryKey:['column-configs'],queryFn:settingsApi.listColumns})
  const workflowConfig=useQuery({queryKey:['workflow-config'],queryFn:settingsApi.getWorkflow})
  const {query:projectConfig,codes:projectCodes}=useProjects()
  const resetColumns=useMutation({mutationFn:settingsApi.resetColumns,onSuccess:()=>{toast.success('Column settings reset to defaults');queryClient.invalidateQueries({queryKey:['column-configs']})},onError:e=>toast.error(getApiError(e))})
  const updateRegisterVisibility=useMutation({
    mutationFn:({field,register,isVisible}:{field:string;register:'workflow'|'transmittal';isVisible:boolean})=>settingsApi.updateColumnVisibility(field,register,isVisible),
    onMutate:async({field,register,isVisible})=>{
      await queryClient.cancelQueries({queryKey:['column-configs']})
      const previous=queryClient.getQueryData<ColumnConfig[]>(['column-configs'])
      const key=register==='workflow'?'is_visible_workflow':'is_visible_transmittal'
      queryClient.setQueryData<ColumnConfig[]>(['column-configs'],items=>items?.map(item=>item.field_name===field?{...item,[key]:isVisible}:item))
      return{previous}
    },
    onError:(error,_variables,context)=>{if(context?.previous)queryClient.setQueryData(['column-configs'],context.previous);toast.error(getApiError(error))},
    onSettled:()=>queryClient.invalidateQueries({queryKey:['column-configs']}),
  })
  const exportMutation=useMutation({mutationFn:metadataApi.export,onSuccess:data=>{
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a')
    a.href=url;a.download=`docflow-metadata-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);toast.success('Metadata backup exported')
  },onError:e=>toast.error(getApiError(e))})
  const csvMutation=useMutation({mutationFn:()=>packagesApi.list({period:'all',page_size:200}),onSuccess:data=>{
    const keys=['project_code','document_number','document_title','document_date','document_type','initiator','discipline','number_of_documents','transmittal_number','workflow_number','workflow_terminated','has_attachment','is_abandoned','notes'] as const
    const csv=[keys.join(','),...data.items.map(row=>keys.map(key=>`"${String(row[key]??'').replaceAll('"','""')}"`).join(','))].join('\n')
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=`docflow-documents-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);toast.success('Document CSV exported')
  },onError:e=>toast.error(getApiError(e))})
  const importMutation=useMutation({mutationFn:()=>metadataApi.import(backup!,mode),onSuccess:result=>{
    toast.success(`Import complete: ${result.packages_created} created, ${result.packages_updated} updated`);setBackup(null);setFileName('');queryClient.invalidateQueries()
  },onError:e=>toast.error(getApiError(e))})
  const csvImportMutation=useMutation({mutationFn:()=>metadataApi.importCsv(csvImport!.rows,csvMode),onSuccess:result=>{
    toast.success(`CSV import complete: ${result.packages_created} created, ${result.packages_updated} updated`);setCsvImport(null);queryClient.invalidateQueries()
  },onError:e=>toast.error(getApiError(e))})
  const chooseFile=async(file?:File)=>{
    if(!file)return
    try{const parsed=JSON.parse(await file.text()) as MetadataBackup;if(parsed.format_version!=='1.0'||!Array.isArray(parsed.packages)||!Array.isArray(parsed.column_configs))throw new Error();setBackup(parsed);setFileName(file.name)}
    catch{setBackup(null);toast.error('This is not a valid DocFlow metadata backup')}
  }
  const chooseCsv=async(file?:File)=>{
    if(!file)return
    try{const rows=parseDocumentCsv(await file.text(),projectCodes);setCsvImport({fileName:file.name,rows});setCsvMode('merge')}
    catch(error){setCsvImport(null);toast.error(error instanceof Error?error.message:'This is not a valid document CSV')}
  }
  return <><div className="page-header"><div><div className="breadcrumb">Document Control <span>/</span> Settings</div><h1>Settings</h1><p>Control data backups and how document metadata is entered.</p></div></div>
    <div className="settings-layout settings-navigation-layout">
      <nav className="settings-nav" aria-label="Settings sections"><button className={section==='columns'?'active':''} onClick={()=>setSection('columns')}><ListFilter/><span><strong>Columns & labels</strong><small>Width, names, colors</small></span></button><button className={section==='projects'?'active':''} onClick={()=>setSection('projects')}><Building2/><span><strong>Project setting</strong><small>Count and names</small></span></button><button className={section==='workflow'?'active':''} onClick={()=>setSection('workflow')}><Workflow/><span><strong>Workflow</strong><small>Stages, feedback, prefixes</small></span></button><button className={section==='backup'?'active':''} onClick={()=>setSection('backup')}><FileJson/><span><strong>Backup & restore</strong><small>JSON and CSV</small></span></button></nav>
      <div className="settings-view">
      {section==='backup'&&<section className="settings-panel wide"><div className="settings-heading icon-heading"><span><FileJson/></span><div><h2>Metadata backup & restore</h2><p>Export all document metadata and field settings, or restore them from a DocFlow JSON backup.</p></div></div>
        <div className="backup-grid">
          <div className="backup-card"><div className="backup-icon blue"><Download/></div><div><h3>Export metadata</h3><p>Download a dated JSON snapshot containing all packages, progress, feedback and column settings.</p><small>Recommended before bulk changes</small></div><button className="secondary-button" disabled={exportMutation.isPending} onClick={()=>exportMutation.mutate()}>{exportMutation.isPending?<LoaderCircle className="spin"/>:<Download/>} Export backup</button></div>
          <div className="backup-card"><div className="backup-icon green"><FileSpreadsheet/></div><div><h3>Export document CSV</h3><p>Download document metadata for reporting and review outside DocFlow.</p><small>Includes lifecycle and attachment fields</small></div><button className="secondary-button" disabled={csvMutation.isPending} onClick={()=>csvMutation.mutate()}>{csvMutation.isPending?<LoaderCircle className="spin"/>:<Download/>} Export CSV</button></div>
          <div className="backup-card"><div className="backup-icon purple"><Upload/></div><div><h3>Import metadata</h3><p>Merge into current data or replace the complete register from a DocFlow JSON backup.</p><small>Restores documents and settings</small></div><input ref={inputRef} hidden type="file" accept="application/json,.json" onChange={e=>chooseFile(e.target.files?.[0])}/><button className="secondary-button" onClick={()=>inputRef.current?.click()}><Upload/> Choose JSON</button></div>
          <div className="backup-card"><div className="backup-icon green"><FileSpreadsheet/></div><div><h3>Import document CSV</h3><p>Import exported CSV data, or a spreadsheet prepared with the same column headers.</p><small>Supports merge and replace modes</small></div><input ref={csvInputRef} hidden type="file" accept="text/csv,.csv" onChange={e=>chooseCsv(e.target.files?.[0])}/><button className="secondary-button" onClick={()=>csvInputRef.current?.click()}><Upload/> Choose CSV</button></div>
        </div>
        {backup&&<div className="import-review"><div className="file-summary"><FileJson/><div><strong>{fileName}</strong><span>{backup.packages.length} documents · {backup.column_configs.length} field settings</span></div><button onClick={()=>{setBackup(null);setFileName('')}}><X/></button></div><label><span>Import behaviour</span><select value={mode} onChange={e=>setMode(e.target.value as 'merge'|'replace')}><option value="merge">Merge — append all records (same document number allowed for revisions)</option><option value="replace">Replace — delete current records, then restore this backup</option></select></label><button className="primary-button" disabled={importMutation.isPending} onClick={()=>importMutation.mutate()}>{importMutation.isPending?<LoaderCircle className="spin"/>:<Check/>} Confirm import</button></div>}
        {csvImport&&<div className="import-review csv-import-review"><div className="file-summary"><FileSpreadsheet/><div><strong>{csvImport.fileName}</strong><span>{csvImport.rows.length} document rows · CSV data import</span></div><button onClick={()=>setCsvImport(null)}><X/></button></div><label><span>Import behaviour</span><select value={csvMode} onChange={e=>setCsvMode(e.target.value as ImportMode)}><option value="merge">Merge — append every row as a new record (revisions may share a document number)</option><option value="replace">Replace — delete current records, then import this CSV</option></select></label><button className="primary-button" disabled={csvImportMutation.isPending} onClick={()=>csvImportMutation.mutate()}>{csvImportMutation.isPending?<LoaderCircle className="spin"/>:<Check/>} Confirm CSV import</button></div>}
      </section>}
      {section==='projects'&&<section className="settings-panel wide"><div className="settings-heading icon-heading"><span><Building2/></span><div><h2>Project setting</h2><p>Add, rename, or remove projects. The sidebar switcher and document editor use this list.</p></div></div>
        {projectConfig.isLoading?<div className="config-loading"><LoaderCircle className="spin"/> Loading project settings…</div>:projectConfig.data?<ProjectConfigEditor config={projectConfig.data} onSaved={()=>{queryClient.invalidateQueries({queryKey:['project-config']});queryClient.invalidateQueries({queryKey:['packages']});queryClient.invalidateQueries({queryKey:['dashboard-packages']})}}/>:<div className="config-note"><strong>Project settings unavailable</strong><span>{projectConfig.error?getApiError(projectConfig.error):'Please refresh and try again.'}</span></div>}
      </section>}
      {section==='workflow'&&<section className="settings-panel wide"><div className="settings-heading icon-heading"><span><Workflow/></span><div><h2>Workflow & transmittal</h2><p>Edit Submission stages, Feedback behavior, and the quick-filter prefixes used by the Transmittal register.</p></div></div>
        {workflowConfig.isLoading?<div className="config-loading"><LoaderCircle className="spin"/> Loading workflow settings…</div>:workflowConfig.data?<WorkflowConfigEditor config={workflowConfig.data} onSaved={()=>{queryClient.invalidateQueries({queryKey:['workflow-config']});queryClient.invalidateQueries({queryKey:['packages']});queryClient.invalidateQueries({queryKey:['dashboard-packages']})}}/>:<div className="config-note"><strong>Workflow settings unavailable</strong><span>{workflowConfig.error?getApiError(workflowConfig.error):'Please refresh and try again.'}</span></div>}
      </section>}
      {section==='columns'&&<section className="settings-panel wide"><div className="settings-heading icon-heading column-settings-heading"><span><ListFilter/></span><div><h2>Column settings</h2><p>{columnRegister==='documents'?'Edit Document column names, visibility, width and metadata options.':'Choose which columns are visible on this register. Names, labels and field types are read-only here.'}</p></div><div className="column-settings-actions"><small>{configs.data?.filter(item=>columnRegister==='documents'?item.is_visible:columnRegister==='workflow'?item.is_visible_workflow:item.is_visible_transmittal).length||0} of {configs.data?.length||0} visible</small><button className="secondary-button" disabled={resetColumns.isPending} onClick={()=>{if(window.confirm('Reset all column names, widths, visibility, colors and input settings?'))resetColumns.mutate()}}>{resetColumns.isPending?<LoaderCircle className="spin"/>:<RotateCcw/>} Reset</button></div></div>
        <div className="column-register-tabs" role="tablist" aria-label="Register column settings"><button role="tab" aria-selected={columnRegister==='documents'} className={columnRegister==='documents'?'active':''} onClick={()=>setColumnRegister('documents')}>Document</button><button role="tab" aria-selected={columnRegister==='workflow'} className={columnRegister==='workflow'?'active':''} onClick={()=>setColumnRegister('workflow')}>Workflow Page</button><button role="tab" aria-selected={columnRegister==='transmittal'} className={columnRegister==='transmittal'?'active':''} onClick={()=>setColumnRegister('transmittal')}>Transmittal Page</button></div>
        {columnRegister==='documents'?<><SyncedHorizontalScroll className="config-table-scroll" contentClassName="config-table-scroll-body" deps={[configs.data?.length, configs.isLoading]} aria-label="Column settings table"><div className="config-table-block"><div className="config-table-head"><span>Column</span><span>Display name</span><span>Visible</span><span>Width</span><span>Input type</span><span>Dropdown options</span><span/></div><div className="config-list">{configs.isLoading?<div className="config-loading"><LoaderCircle className="spin"/> Loading field settings…</div>:configs.data?.map(config=><ColumnConfigRow key={config.field_name} config={config} onSaved={()=>queryClient.invalidateQueries({queryKey:['column-configs']})}/>)}</div></div></SyncedHorizontalScroll><div className="config-note"><strong>Document column design</strong><span>Width accepts 72–500 pixels. Hiding a column does not delete its data. Input type only affects editable metadata fields; progress columns remain read-only.</span></div></>:<><div className="register-visibility-list">{configs.isLoading?<div className="config-loading"><LoaderCircle className="spin"/> Loading field settings…</div>:configs.data?.map(config=>{const visible=columnRegister==='workflow'?config.is_visible_workflow:config.is_visible_transmittal;return <label key={config.field_name} className="register-visibility-row"><div><strong>{config.display_name}</strong><code>{config.field_name}</code></div><span>{visible?'Shown':'Hidden'}</span><span className="config-visibility"><input type="checkbox" checked={visible} disabled={updateRegisterVisibility.isPending} onChange={event=>updateRegisterVisibility.mutate({field:config.field_name,register:columnRegister,isVisible:event.target.checked})}/><i/></span></label>})}</div><div className="config-note"><strong>{columnRegister==='workflow'?'Workflow Page':'Transmittal Page'} visibility</strong><span>The available columns match Document. These settings only control whether each column is shown; names and labels remain managed by Document settings.</span></div></>}
      </section>}
      </div>
    </div>
  </>
}

const csvColumns = new Set(['project_code','document_number','document_title','document_date','document_type','initiator','discipline','number_of_documents','transmittal_number','workflow_number','workflow_terminated','has_attachment','is_abandoned','notes'])

function parseCsv(text:string):string[][]{
  const rows:string[][]=[];let row:string[]=[];let cell='';let quoted=false
  for(let index=0;index<text.length;index+=1){
    const char=text[index]
    if(quoted){if(char==='"'&&text[index+1]==='"'){cell+='"';index+=1}else if(char==='"')quoted=false;else cell+=char;continue}
    if(char==='"'){quoted=true;continue}
    if(char===','){row.push(cell);cell='';continue}
    if(char==='\n'){row.push(cell);rows.push(row);row=[];cell='';continue}
    if(char!=='\r')cell+=char
  }
  if(quoted)throw new Error('CSV contains an unmatched quote')
  if(cell||row.length){row.push(cell);rows.push(row)}
  return rows
}

function parseBoolean(value:string,field:string,row:number){
  if(!value.trim())return undefined
  const normalized=value.trim().toLowerCase()
  if(['true','1','yes'].includes(normalized))return true
  if(['false','0','no'].includes(normalized))return false
  throw new Error(`Row ${row}: ${field} must be true/false, yes/no, or 1/0`)
}

function parseOptionalDate(value:string,row:number):string|undefined{
  const trimmed=value.trim()
  if(!trimmed)return undefined
  // Accept ISO dates and common spreadsheet day-first / month-first forms.
  const iso=trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const slash=trimmed.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)
  let year=0,month=0,day=0
  if(iso){[year,month,day]=[Number(iso[1]),Number(iso[2]),Number(iso[3])]}
  else if(slash){
    const a=Number(slash[1]),b=Number(slash[2]),c=Number(slash[3])
    // Prefer day/month/year when the first part is > 12; otherwise treat as month/day/year.
    if(a>12){[day,month,year]=[a,b,c]}
    else if(b>12){[month,day,year]=[a,b,c]}
    else{[day,month,year]=[a,b,c]}
  }else throw new Error(`Row ${row}: document_date must be YYYY-MM-DD (got "${trimmed}")`)
  if(month<1||month>12||day<1||day>31)throw new Error(`Row ${row}: document_date is not a valid calendar date`)
  const date=new Date(Date.UTC(year,month-1,day))
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw new Error(`Row ${row}: document_date is not a valid calendar date`)
  return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function parseDocumentCsv(text:string,allowedProjects:string[]):CsvImportRow[]{
  const records=parseCsv(text)
  if(records.length<2)throw new Error('CSV must include a header row and at least one document')
  const headers=records[0].map((value,index)=>(index===0?value.replace(/^\uFEFF/,''):value).trim().toLowerCase())
  if(new Set(headers).size!==headers.length)throw new Error('CSV header contains duplicate column names')
  if(!headers.includes('document_number'))throw new Error('CSV must include the document_number column')
  if(!headers.some(header=>csvColumns.has(header)))throw new Error('CSV has no supported document columns')
  const rows=records.slice(1).filter(record=>record.some(value=>value.trim()))
  if(!rows.length)throw new Error('CSV does not contain any document rows')
  return rows.map((record,rowIndex)=>{
    const cells=Object.fromEntries(headers.map((header,index)=>[header,record[index]??'']))
    const has=(field:string)=>headers.includes(field)
    const textValue=(field:string)=>cells[field].trim()
    const value:CsvImportRow={}
    const rowNumber=rowIndex+2
    // Only send fields that actually have values so empty cells do not fail API validation.
    if(has('project_code')&&textValue('project_code')){const project=textValue('project_code').toUpperCase();if(!allowedProjects.includes(project))throw new Error(`Row ${rowNumber}: project_code must be one of ${allowedProjects.join(', ')}`);value.project_code=project}
    if(has('document_number')&&textValue('document_number'))value.document_number=textValue('document_number')
    if(has('document_title'))value.document_title=textValue('document_title')
    if(has('document_date')){const date=parseOptionalDate(cells.document_date??'',rowNumber);if(date)value.document_date=date}
    for(const field of ['document_type','initiator','discipline'] as const)if(has(field)&&textValue(field))value[field]=textValue(field)
    if(has('notes'))value.notes=cells.notes??''
    for(const field of ['transmittal_number','workflow_number'] as const)if(has(field))value[field]=textValue(field)||null
    if(has('number_of_documents')&&textValue('number_of_documents')){const number=Number(textValue('number_of_documents'));if(!Number.isInteger(number)||number<1)throw new Error(`Row ${rowNumber}: number_of_documents must be a positive integer`);value.number_of_documents=number}
    for(const field of ['workflow_terminated','has_attachment','is_abandoned'] as const)if(has(field)){const parsed=parseBoolean(cells[field],field,rowNumber);if(parsed!==undefined)value[field]=parsed}
    return value
  })
}

type ProjectDraft = {key:string;id?:number;code:string;name:string;document_count:number}

function ProjectConfigEditor({config,onSaved}:{config:ProjectConfig;onSaved:()=>void}){
  const [projects,setProjects]=useState<ProjectDraft[]>(()=>config.projects.map(project=>({key:`project-${project.id}`,id:project.id,code:project.code,name:project.name,document_count:project.document_count})))
  useEffect(()=>{setProjects(config.projects.map(project=>({key:`project-${project.id}`,id:project.id,code:project.code,name:project.name,document_count:project.document_count})))},[config])
  const save=useMutation({
    mutationFn:()=>settingsApi.updateProjects({projects:projects.map(project=>({id:project.id,code:project.code,name:project.name}))}),
    onSuccess:()=>{toast.success('Project settings updated');onSaved()},
    onError:e=>toast.error(getApiError(e)),
  })
  const codes=projects.map(project=>project.code.trim().toUpperCase())
  const invalid=!projects.length||projects.some(project=>!/^[A-Z0-9]{2,12}$/.test(project.code.trim().toUpperCase())||!project.name.trim())||new Set(codes).size!==codes.length
  const addProject=()=>setProjects(previous=>[...previous,{key:`draft-${Date.now()}-${Math.random()}`,code:'',name:'',document_count:0}])
  const removeProject=(key:string)=>setProjects(previous=>previous.length===1?previous:previous.filter(project=>project.key!==key))
  return <div className="project-config-editor">
    <div className="workflow-config-block">
      <div className="workflow-config-title"><div><strong>Projects</strong><span>Code is the short identifier used on documents. Name is shown in the project switcher.</span></div><small>{projects.length} {projects.length===1?'project':'projects'}</small></div>
      <div className="project-config-list">
        {projects.map((project,index)=><div className="project-config-row" key={project.key}>
          <b>{index+1}</b>
          <label><span>Code</span><input value={project.code} maxLength={12} aria-label={`Project ${index+1} code`} onChange={event=>setProjects(previous=>previous.map(item=>item.key===project.key?{...item,code:event.target.value.toUpperCase()}:item))}/></label>
          <label><span>Name</span><input value={project.name} maxLength={80} aria-label={`Project ${index+1} name`} onChange={event=>setProjects(previous=>previous.map(item=>item.key===project.key?{...item,name:event.target.value}:item))}/></label>
          <small>{project.document_count} {project.document_count===1?'document':'documents'}</small>
          <button type="button" aria-label={`Remove ${project.code||'project'}`} disabled={projects.length===1||project.document_count>0} title={project.document_count>0?'Move or delete documents before removing this project':'Remove project'} onClick={()=>removeProject(project.key)}><X/></button>
        </div>)}
      </div>
      <button type="button" className="secondary-button project-config-add" disabled={projects.length>=20} onClick={addProject}><Plus/> Add project</button>
    </div>
    <div className="workflow-config-actions"><p>Renaming a code updates existing documents. A project with documents cannot be removed.</p><button className="primary-button" disabled={save.isPending||invalid} onClick={()=>save.mutate()}>{save.isPending?<LoaderCircle className="spin"/>:<Save/>} Save project setting</button></div>
  </div>
}

function WorkflowConfigEditor({config,onSaved}:{config:WorkflowConfig;onSaved:()=>void}){
  const [steps,setSteps]=useState([...config.submission_steps])
  const [reviewers,setReviewers]=useState([...config.feedback_reviewers])
  const [labels,setLabels]=useState({...config.feedback_status_labels})
  const [colors,setColors]=useState({...config.feedback_status_colors})
  const [prefixes,setPrefixes]=useState([...config.transmittal_prefixes])
  const [prefixDraft,setPrefixDraft]=useState('')
  useEffect(()=>{setSteps([...config.submission_steps]);setReviewers([...config.feedback_reviewers]);setLabels({...config.feedback_status_labels});setColors({...config.feedback_status_colors});setPrefixes([...config.transmittal_prefixes]);setPrefixDraft('')},[config])
  const move=(index:number,direction:-1|1)=>setSteps(previous=>{const next=[...previous];const target=index+direction;if(target<0||target>=next.length)return previous;[next[index],next[target]]=[next[target],next[index]];return next})
  const save=useMutation({mutationFn:()=>settingsApi.updateWorkflow({submission_steps:steps,feedback_reviewers:reviewers,feedback_status_labels:labels,feedback_status_colors:colors,transmittal_prefixes:prefixes}),onSuccess:()=>{toast.success('Workflow and transmittal settings updated');onSaved()},onError:e=>toast.error(getApiError(e))})
  const invalid=[...steps,...reviewers,...Object.values(labels),...prefixes].some(value=>!value.trim())||!prefixes.length||new Set(steps.map(value=>value.trim().toLowerCase())).size!==steps.length||new Set(reviewers.map(value=>value.trim().toLowerCase())).size!==reviewers.length
  const addPrefix=()=>{const value=prefixDraft.trim();if(value&&!prefixes.includes(value))setPrefixes(previous=>[...previous,value]);setPrefixDraft('')}
  return <div className="workflow-config-editor">
    <div className="workflow-config-block"><div className="workflow-config-title"><div><strong>Submission Progress</strong><span>Exactly four stages. Use arrows to change the sequence.</span></div><small>4 stages</small></div><div className="workflow-step-list">{steps.map((step,index)=><div className="workflow-step-row" key={index}><b>{index+1}</b><input aria-label={`Submission step ${index+1}`} value={step} onChange={event=>setSteps(previous=>previous.map((value,i)=>i===index?event.target.value:value))}/><button type="button" disabled={index===0} onClick={()=>move(index,-1)} aria-label="Move stage up"><ArrowUp/></button><button type="button" disabled={index===steps.length-1} onClick={()=>move(index,1)} aria-label="Move stage down"><ArrowDown/></button></div>)}</div></div>
    <div className="workflow-config-side"><div className="workflow-config-block"><div className="workflow-config-title"><div><strong>Feedback reviewers</strong><span>Names shown in Feedback progress.</span></div></div><div className="workflow-reviewer-list">{reviewers.map((reviewer,index)=><label key={index}><span>Reviewer {index+1}</span><input value={reviewer} onChange={event=>setReviewers(previous=>previous.map((value,i)=>i===index?event.target.value:value))}/></label>)}</div></div>
    <div className="workflow-config-block"><div className="workflow-config-title"><div><strong>Feedback status labels</strong><span>Edit the label and choose its display color.</span></div></div><div className="workflow-status-list">{(['A','B','C','P'] as FeedbackStatusCode[]).map(code=><label key={code}><b>{code}</b><input value={labels[code]} onChange={event=>setLabels(previous=>({...previous,[code]:event.target.value}))}/><input className="label-color-input" type="color" aria-label={`${code} label color`} value={colors[code]} onChange={event=>setColors(previous=>({...previous,[code]:event.target.value}))}/></label>)}</div></div>
    <div className="workflow-config-block"><div className="workflow-config-title"><div><strong>Transmittal number filters</strong><span>Quick-filter prefixes shown beside the Transmittal search box.</span></div><small>{prefixes.length} types</small></div><div className="workflow-prefix-list">{prefixes.map(prefix=><div key={prefix}><code>{prefix}</code><button type="button" aria-label={`Remove ${prefix}`} disabled={prefixes.length===1} onClick={()=>setPrefixes(previous=>previous.filter(value=>value!==prefix))}><X/></button></div>)}</div><div className="workflow-prefix-add"><input value={prefixDraft} maxLength={80} placeholder="Add a prefix" onChange={event=>setPrefixDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();addPrefix()}}}/><button type="button" onClick={addPrefix} disabled={!prefixDraft.trim()}><Plus/></button></div></div></div>
    <div className="workflow-config-actions"><p>Existing document progress is preserved by stage/reviewer position when names change.</p><button className="primary-button" disabled={save.isPending||invalid} onClick={()=>save.mutate()}>{save.isPending?<LoaderCircle className="spin"/>:<Save/>} Save workflow structure</button></div>
  </div>
}

function ColumnConfigRow({config,onSaved}:{config:ColumnConfig;onSaved:()=>void}){
  const [name,setName]=useState(config.display_name)
  const [visible,setVisible]=useState(config.is_visible)
  const [width,setWidth]=useState(config.column_width)
  const [type,setType]=useState(config.input_type)
  const [options,setOptions]=useState(config.options)
  const [optionColors,setOptionColors]=useState(config.option_colors||{})
  const [draft,setDraft]=useState('')
  const inputEditable=!['submission_progress','feedback'].includes(config.field_name)
  useEffect(()=>{setName(config.display_name);setVisible(config.is_visible);setWidth(config.column_width);setType(config.input_type);setOptions(config.options);setOptionColors(config.option_colors||{})},[config])
  const save=useMutation({mutationFn:()=>settingsApi.updateColumn(config.field_name,{display_name:name.trim(),is_visible:visible,column_width:width,input_type:type,options,option_colors:Object.fromEntries(options.map((option,index)=>[option,optionColors[option]||palette[index%palette.length]]))}),onSuccess:()=>{toast.success(`${name.trim()} column updated`);onSaved()},onError:e=>toast.error(getApiError(e))})
  const add=()=>{const value=draft.trim();if(value&&!options.includes(value)){setOptions([...options,value]);setOptionColors(previous=>({...previous,[value]:palette[options.length%palette.length]}))}setDraft('')}
  const remove=(option:string)=>{setOptions(options.filter(value=>value!==option));setOptionColors(previous=>{const next={...previous};delete next[option];return next})}
  return <div className="config-row"><div className="config-name"><strong>{config.display_name}</strong><code>{config.field_name}</code></div><input className="config-text-input" value={name} maxLength={120} onChange={event=>setName(event.target.value)}/><label className="config-visibility"><input type="checkbox" checked={visible} onChange={event=>setVisible(event.target.checked)}/><i/><span>{visible?'Shown':'Hidden'}</span></label><label className="config-width"><input type="number" min={72} max={500} value={width} onChange={event=>setWidth(Math.min(500,Math.max(72,Number(event.target.value)||72)))}/><span>px</span></label>{inputEditable?<div className="type-toggle"><button className={type==='text'?'active':''} onClick={()=>setType('text')}>Text</button><button className={type==='select'?'active':''} onClick={()=>setType('select')}>Dropdown</button></div>:<span className="config-na">Read only</span>}<div className={`option-editor ${!inputEditable||type==='text'?'disabled':''}`}><div className="option-chips">{inputEditable&&options.map((option,index)=><span key={option} style={{color:optionColors[option]||palette[index%palette.length],backgroundColor:`color-mix(in srgb, ${optionColors[option]||palette[index%palette.length]} 12%, white)`}}><input type="color" aria-label={`${option} color`} value={optionColors[option]||palette[index%palette.length]} onChange={event=>setOptionColors(previous=>({...previous,[option]:event.target.value}))}/>{option}<button onClick={()=>remove(option)}><X/></button></span>)}</div>{inputEditable&&type==='select'&&<div className="option-input"><input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add()}}} placeholder="Add an option"/><button onClick={add}><Plus/></button></div>}</div><button className="save-config" disabled={save.isPending||!name.trim()||(inputEditable&&type==='select'&&!options.length)} onClick={()=>save.mutate()}>{save.isPending?<LoaderCircle className="spin"/>:<Save/>}</button></div>
}
