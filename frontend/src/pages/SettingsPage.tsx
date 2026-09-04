import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Building2, Check, Download, FileJson, FileSpreadsheet, ListFilter, LoaderCircle, Plus, RotateCcw, Save, Shield, Upload, Workflow, X } from 'lucide-react'
import { toast } from 'sonner'
import { AccessPanel } from '../components/iam/AccessPanel'
import { useAuth } from '../hooks/useAuth'
import { getApiError, metadataApi, packagesApi, settingsApi } from '../lib/api'
import type { ColumnConfig, CsvImportRow, FeedbackStatusCode, MetadataBackup, ProjectConfig, WorkflowConfig } from '../types/package'
import { useProjects } from '../hooks/useProjects'
import { ConfirmDialog } from '../components/common/ConfirmDialog'

type ImportMode = 'merge'|'replace'
type CsvImportPreview = { fileName:string; rows:CsvImportRow[] }
type SettingsSection = 'columns'|'projects'|'workflow'|'backup'|'access'
type ColumnRegister = 'documents'|'workflow'|'transmittal'
const palette=['#3164ce','#7453be','#21815d','#b06a1d','#b13f4c','#9b4d80','#3970c7','#68717e']

const sectionHint:Record<SettingsSection,string> = {
  columns:'Names, width, visibility, and dropdown pools.',
  projects:'The list used by the sidebar switcher and document editor.',
  workflow:'Submission stages, feedback labels, and transmittal filters.',
  backup:'Export or restore document metadata as JSON or CSV.',
  access:'Accounts, roles, and project scope.',
}

export function SettingsPage() {
  const queryClient=useQueryClient()
  const {can}=useAuth()
  const canSettings=can('settings:write')
  const canExport=can('metadata:export')
  const canImport=can('metadata:import')
  const canIam=can('iam:read')
  const inputRef=useRef<HTMLInputElement>(null)
  const csvInputRef=useRef<HTMLInputElement>(null)
  const [backup,setBackup]=useState<MetadataBackup|null>(null)
  const [csvImport,setCsvImport]=useState<CsvImportPreview|null>(null)
  const [fileName,setFileName]=useState('')
  const [mode,setMode]=useState<ImportMode>('merge')
  const [csvMode,setCsvMode]=useState<ImportMode>('merge')
  const [section,setSection]=useState<SettingsSection>(()=>canSettings?'columns':canIam?'access':'backup')
  const [columnRegister,setColumnRegister]=useState<ColumnRegister>('documents')
  const [resetColumnsOpen,setResetColumnsOpen]=useState(false)
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
  const csvMutation=useMutation({mutationFn:()=>packagesApi.listAll({period:'all'}),onSuccess:data=>{
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
  const visibleCount=configs.data?.filter(item=>columnRegister==='documents'?item.is_visible:columnRegister==='workflow'?item.is_visible_workflow:item.is_visible_transmittal).length||0
  return <>
    <div className="page-header">
      <div>
        <div className="breadcrumb">Document Control <span>/</span> Settings</div>
        <h1>Settings</h1>
        <p>{sectionHint[section]}</p>
      </div>
    </div>
    <div className="settings-layout settings-navigation-layout">
      <nav className="settings-nav" aria-label="Settings sections">
        <p className="settings-nav-label">Workspace</p>
        {canSettings&&<button type="button" className={section==='columns'?'active':''} onClick={()=>setSection('columns')}><ListFilter/><span><strong>Columns & labels</strong><small>Width, names, colors</small></span></button>}
        {canSettings&&<button type="button" className={section==='projects'?'active':''} onClick={()=>setSection('projects')}><Building2/><span><strong>Project setting</strong><small>Count and names</small></span></button>}
        {canSettings&&<button type="button" className={section==='workflow'?'active':''} onClick={()=>setSection('workflow')}><Workflow/><span><strong>Workflow</strong><small>Stages, feedback, prefixes</small></span></button>}
        {(canExport||canImport||canIam)&&<p className="settings-nav-label">System</p>}
        {(canExport||canImport)&&<button type="button" className={section==='backup'?'active':''} onClick={()=>setSection('backup')}><FileJson/><span><strong>Backup & restore</strong><small>JSON and CSV</small></span></button>}
        {canIam&&<button type="button" className={section==='access'?'active':''} onClick={()=>setSection('access')}><Shield/><span><strong>Users & access</strong><small>Accounts, roles, projects</small></span></button>}
      </nav>
      <div className="settings-view">
      {section==='backup'&&<section className="settings-panel wide">
        <div className="settings-heading icon-heading">
          <span><FileJson/></span>
          <div>
            <h2>Backup & restore</h2>
            <p>Export a snapshot before bulk changes, or restore documents from a DocFlow JSON backup or CSV file.</p>
          </div>
        </div>
        <div className="backup-groups">
          {canExport&&<div className="backup-group">
            <h3>Export</h3>
            <div className="backup-grid">
              <div className="backup-card">
                <div className="backup-card-copy">
                  <div className="backup-icon blue"><Download/></div>
                  <div>
                    <h3>Export metadata</h3>
                    <p>Download a dated JSON snapshot of all packages, progress, feedback and column settings.</p>
                    <small>Recommended before bulk changes</small>
                  </div>
                </div>
                <button className="secondary-button" disabled={exportMutation.isPending} onClick={()=>exportMutation.mutate()}>{exportMutation.isPending?<LoaderCircle className="spin"/>:<Download/>} Export backup</button>
              </div>
              <div className="backup-card">
                <div className="backup-card-copy">
                  <div className="backup-icon green"><FileSpreadsheet/></div>
                  <div>
                    <h3>Export document CSV</h3>
                    <p>Download document metadata for reporting and review outside DocFlow.</p>
                    <small>Includes lifecycle and attachment fields</small>
                  </div>
                </div>
                <button className="secondary-button" disabled={csvMutation.isPending} onClick={()=>csvMutation.mutate()}>{csvMutation.isPending?<LoaderCircle className="spin"/>:<Download/>} Export CSV</button>
              </div>
            </div>
          </div>}
          {canImport&&<div className="backup-group">
            <h3>Import</h3>
            <div className="backup-grid">
              <div className="backup-card">
                <div className="backup-card-copy">
                  <div className="backup-icon purple"><Upload/></div>
                  <div>
                    <h3>Import metadata</h3>
                    <p>Merge into current data or replace the complete register from a DocFlow JSON backup.</p>
                    <small>Restores documents and settings</small>
                  </div>
                </div>
                <input ref={inputRef} hidden type="file" accept="application/json,.json" onChange={e=>chooseFile(e.target.files?.[0])}/>
                <button className="secondary-button" onClick={()=>inputRef.current?.click()}><Upload/> Choose JSON</button>
              </div>
              <div className="backup-card">
                <div className="backup-card-copy">
                  <div className="backup-icon green"><FileSpreadsheet/></div>
                  <div>
                    <h3>Import document CSV</h3>
                    <p>Import exported CSV data, or a spreadsheet prepared with the same column headers.</p>
                    <small>Supports merge and replace modes</small>
                  </div>
                </div>
                <input ref={csvInputRef} hidden type="file" accept="text/csv,.csv" onChange={e=>chooseCsv(e.target.files?.[0])}/>
                <button className="secondary-button" onClick={()=>csvInputRef.current?.click()}><Upload/> Choose CSV</button>
              </div>
            </div>
          </div>}
        </div>
        {backup&&<div className="import-review">
          <div className="file-summary"><FileJson/><div><strong>{fileName}</strong><span>{backup.packages.length} documents · {backup.column_configs.length} field settings</span></div><button type="button" onClick={()=>{setBackup(null);setFileName('')}}><X/></button></div>
          <label><span>Import behaviour</span><select value={mode} onChange={e=>setMode(e.target.value as 'merge'|'replace')}><option value="merge">Merge — append all records (same document number allowed for revisions)</option><option value="replace">Replace — delete current records, then restore this backup</option></select></label>
          <button className="primary-button" disabled={importMutation.isPending} onClick={()=>importMutation.mutate()}>{importMutation.isPending?<LoaderCircle className="spin"/>:<Check/>} Confirm import</button>
        </div>}
        {csvImport&&<div className="import-review csv-import-review">
          <div className="file-summary"><FileSpreadsheet/><div><strong>{csvImport.fileName}</strong><span>{csvImport.rows.length} document rows · CSV data import</span></div><button type="button" onClick={()=>setCsvImport(null)}><X/></button></div>
          <label><span>Import behaviour</span><select value={csvMode} onChange={e=>setCsvMode(e.target.value as ImportMode)}><option value="merge">Merge — append every row as a new record (revisions may share a document number)</option><option value="replace">Replace — delete current records, then import this CSV</option></select></label>
          <button className="primary-button" disabled={csvImportMutation.isPending} onClick={()=>csvImportMutation.mutate()}>{csvImportMutation.isPending?<LoaderCircle className="spin"/>:<Check/>} Confirm CSV import</button>
        </div>}
      </section>}
      {section==='projects'&&<section className="settings-panel wide">
        <div className="settings-heading icon-heading">
          <span><Building2/></span>
          <div>
            <h2>Project setting</h2>
            <p>Add, rename, or remove projects. The sidebar switcher and document editor use this list.</p>
          </div>
        </div>
        {projectConfig.isLoading?<div className="config-loading"><LoaderCircle className="spin"/> Loading project settings…</div>:projectConfig.data?<ProjectConfigEditor config={projectConfig.data} onSaved={()=>{queryClient.invalidateQueries({queryKey:['project-config']});queryClient.invalidateQueries({queryKey:['packages']});queryClient.invalidateQueries({queryKey:['dashboard-packages']})}}/>:<div className="config-note"><strong>Project settings unavailable</strong><span>{projectConfig.error?getApiError(projectConfig.error):'Please refresh and try again.'}</span></div>}
      </section>}
      {section==='workflow'&&<section className="settings-panel wide">
        <div className="settings-heading icon-heading">
          <span><Workflow/></span>
          <div>
            <h2>Workflow & transmittal</h2>
            <p>Set default Submission Progress stages, optionally override them per project, and edit Feedback and Transmittal filters.</p>
          </div>
        </div>
        {workflowConfig.isLoading?<div className="config-loading"><LoaderCircle className="spin"/> Loading workflow settings…</div>:workflowConfig.data?<WorkflowConfigEditor config={workflowConfig.data} onSaved={()=>{queryClient.invalidateQueries({queryKey:['workflow-config']});queryClient.invalidateQueries({queryKey:['packages']});queryClient.invalidateQueries({queryKey:['dashboard-packages']})}}/>:<div className="config-note"><strong>Workflow settings unavailable</strong><span>{workflowConfig.error?getApiError(workflowConfig.error):'Please refresh and try again.'}</span></div>}
      </section>}
      {section==='access'&&<AccessPanel/>}
      {section==='columns'&&canSettings&&<section className="settings-panel wide">
        <div className="settings-heading icon-heading column-settings-heading">
          <span><ListFilter/></span>
          <div>
            <h2>Column settings</h2>
            <p>{columnRegister==='documents'?'Edit Document column names, visibility, width and metadata options.':'Choose which columns are visible on this register. Names, labels and field types are read-only here.'}</p>
          </div>
          <div className="column-settings-actions">
            <small>{visibleCount} of {configs.data?.length||0} visible</small>
            <button className="secondary-button" disabled={resetColumns.isPending} onClick={()=>setResetColumnsOpen(true)}>{resetColumns.isPending?<LoaderCircle className="spin"/>:<RotateCcw/>} Reset</button>
          </div>
        </div>
        <div className="column-register-tabs" role="tablist" aria-label="Register column settings">
          <button type="button" role="tab" aria-selected={columnRegister==='documents'} className={columnRegister==='documents'?'active':''} onClick={()=>setColumnRegister('documents')}>Document</button>
          <button type="button" role="tab" aria-selected={columnRegister==='workflow'} className={columnRegister==='workflow'?'active':''} onClick={()=>setColumnRegister('workflow')}>Workflow Page</button>
          <button type="button" role="tab" aria-selected={columnRegister==='transmittal'} className={columnRegister==='transmittal'?'active':''} onClick={()=>setColumnRegister('transmittal')}>Transmittal Page</button>
        </div>
        {columnRegister==='documents'?<>
          <div className="column-card-list">
            {configs.isLoading?<div className="config-loading"><LoaderCircle className="spin"/> Loading field settings…</div>:configs.data?.map(config=><ColumnConfigRow key={config.field_name} config={config} onSaved={()=>queryClient.invalidateQueries({queryKey:['column-configs']})}/>)}
          </div>
          <div className="config-note"><strong>Document column design</strong><span>Width accepts 72–500 pixels. Hiding a column does not delete its data. Input type only affects editable metadata fields; progress columns remain read-only.</span></div>
        </>:<>
          <div className="register-visibility-list">
            {configs.isLoading?<div className="config-loading"><LoaderCircle className="spin"/> Loading field settings…</div>:configs.data?.map(config=>{
              const visible=columnRegister==='workflow'?config.is_visible_workflow:config.is_visible_transmittal
              return <label key={config.field_name} className={`register-visibility-row ${visible?'':'is-hidden'}`}>
                <div><strong>{config.display_name}</strong><code>{config.field_name}</code></div>
                <span>{visible?'Shown':'Hidden'}</span>
                <span className="config-visibility"><input type="checkbox" checked={visible} disabled={updateRegisterVisibility.isPending} onChange={event=>updateRegisterVisibility.mutate({field:config.field_name,register:columnRegister,isVisible:event.target.checked})}/><i/></span>
              </label>
            })}
          </div>
          <div className="config-note"><strong>{columnRegister==='workflow'?'Workflow Page':'Transmittal Page'} visibility</strong><span>The available columns match Document. These settings only control whether each column is shown; names and labels remain managed by Document settings.</span></div>
        </>}
      </section>}
      </div>
    </div>
    <ConfirmDialog
      open={resetColumnsOpen}
      title="Reset every column setting?"
      description={<>This restores default column names, widths, visibility, colors, and input types across the document registers. <strong>Your saved column customizations will be replaced.</strong></>}
      confirmLabel="Reset column settings"
      tone="warning"
      onClose={()=>setResetColumnsOpen(false)}
      onConfirm={()=>resetColumns.mutateAsync()}
    />
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
  const {codes,labels:projectLabels}=useProjects()
  const [steps,setSteps]=useState([...config.submission_steps])
  const [projectSteps,setProjectSteps]=useState<Record<string,string[]>>({...(config.project_submission_steps||{})})
  const [scope,setScope]=useState('ALL')
  const [reviewers,setReviewers]=useState([...config.feedback_reviewers])
  const [labels,setLabels]=useState({...config.feedback_status_labels})
  const [colors,setColors]=useState({...config.feedback_status_colors})
  const [prefixes,setPrefixes]=useState([...config.transmittal_prefixes])
  const [prefixDraft,setPrefixDraft]=useState('')
  useEffect(()=>{setSteps([...config.submission_steps]);setProjectSteps({...(config.project_submission_steps||{})});setReviewers([...config.feedback_reviewers]);setLabels({...config.feedback_status_labels});setColors({...config.feedback_status_colors});setPrefixes([...config.transmittal_prefixes]);setPrefixDraft('')},[config])
  const custom=scope!=='ALL' && Array.isArray(projectSteps[scope])
  const activeSteps=(custom?projectSteps[scope]:steps)||steps
  const setActiveSteps=(updater:(current:string[])=>string[])=>{
    if(scope==='ALL')setSteps(updater)
    else setProjectSteps(previous=>({...previous,[scope]:updater(previous[scope]||[...steps])}))
  }
  const move=(index:number,direction:-1|1)=>setActiveSteps(previous=>{const next=[...previous];const target=index+direction;if(target<0||target>=next.length)return previous;[next[index],next[target]]=[next[target],next[index]];return next})
  const addStep=()=>setActiveSteps(previous=>previous.length>=12?previous:[...previous,`Stage ${previous.length+1}`])
  const removeStep=(index:number)=>setActiveSteps(previous=>previous.length<=1?previous:previous.filter((_,i)=>i!==index))
  const save=useMutation({mutationFn:()=>settingsApi.updateWorkflow({submission_steps:steps,project_submission_steps:projectSteps,feedback_reviewers:reviewers,feedback_status_labels:labels,feedback_status_colors:colors,transmittal_prefixes:prefixes}),onSuccess:()=>{toast.success('Workflow and transmittal settings updated');onSaved()},onError:e=>toast.error(getApiError(e))})
  const overrideLists=Object.values(projectSteps)
  const invalid=[...steps,...overrideLists.flat(),...reviewers,...Object.values(labels),...prefixes].some(value=>!value.trim())||!prefixes.length||new Set(steps.map(value=>value.trim().toLowerCase())).size!==steps.length||new Set(reviewers.map(value=>value.trim().toLowerCase())).size!==reviewers.length||new Set(activeSteps.map(value=>value.trim().toLowerCase())).size!==activeSteps.length||!steps.length||!activeSteps.length
  const addPrefix=()=>{const value=prefixDraft.trim();if(value&&!prefixes.includes(value))setPrefixes(previous=>[...previous,value]);setPrefixDraft('')}
  const editingLocked=scope!=='ALL'&&!custom
  return <div className="workflow-config-editor">
    <div className="workflow-config-block">
      <div className="workflow-config-title"><div><strong>Submission Progress</strong><span>Default stages apply to every project. Choose a project to use a different number of stages or names.</span></div><small>{activeSteps.length} stage{activeSteps.length===1?'':'s'}</small></div>
      <label className="submission-scope"><span>Applies to</span><select aria-label="Submission Progress project" value={scope} onChange={event=>setScope(event.target.value)}><option value="ALL">All projects (default)</option>{codes.map(code=><option key={code} value={code}>{code} · {projectLabels[code]}{projectSteps[code]?' · custom':''}</option>)}</select></label>
      {scope!=='ALL'&&<label className="editor-switch-row submission-custom-switch"><div><strong>Customize for {scope}</strong><span>{custom?'This project uses its own stages. Turn off to follow the default list.':'Currently using the default stages.'}</span></div><span className="switch"><input type="checkbox" checked={custom} onChange={event=>{if(event.target.checked)setProjectSteps(previous=>({...previous,[scope]:[...(previous[scope]||steps)]}));else setProjectSteps(previous=>{const next={...previous};delete next[scope];return next})}}/><i/></span></label>}
      <div className={`workflow-step-list ${editingLocked?'is-locked':''}`}>{activeSteps.map((step,index)=><div className="workflow-step-row" key={index}><b>{index+1}</b><input aria-label={`Submission step ${index+1}`} value={step} disabled={editingLocked} onChange={event=>setActiveSteps(previous=>previous.map((value,i)=>i===index?event.target.value:value))}/><button type="button" disabled={editingLocked||index===0} onClick={()=>move(index,-1)} aria-label="Move stage up"><ArrowUp/></button><button type="button" disabled={editingLocked||index===activeSteps.length-1} onClick={()=>move(index,1)} aria-label="Move stage down"><ArrowDown/></button><button type="button" disabled={editingLocked||activeSteps.length<=1} onClick={()=>removeStep(index)} aria-label="Remove stage"><X/></button></div>)}</div>
      <button type="button" className="secondary-button submission-add-step" disabled={editingLocked||activeSteps.length>=12} onClick={addStep}><Plus/> Add stage</button>
    </div>
    <div className="workflow-config-side">
      <div className="workflow-config-block">
        <div className="workflow-config-title"><div><strong>Feedback reviewers</strong><span>Names shown in Feedback progress.</span></div></div>
        <div className="workflow-reviewer-list">{reviewers.map((reviewer,index)=><label key={index}><span>Reviewer {index+1}</span><input value={reviewer} onChange={event=>setReviewers(previous=>previous.map((value,i)=>i===index?event.target.value:value))}/></label>)}</div>
      </div>
      <div className="workflow-config-block">
        <div className="workflow-config-title"><div><strong>Feedback status labels</strong><span>Edit the label and choose its display color.</span></div></div>
        <div className="workflow-status-list">{(['A','B','C','P'] as FeedbackStatusCode[]).map(code=><label key={code}><b>{code}</b><input value={labels[code]} onChange={event=>setLabels(previous=>({...previous,[code]:event.target.value}))}/><input className="label-color-input" type="color" aria-label={`${code} label color`} value={colors[code]} onChange={event=>setColors(previous=>({...previous,[code]:event.target.value}))}/></label>)}</div>
      </div>
    </div>
    <div className="workflow-config-block">
      <div className="workflow-config-title"><div><strong>Transmittal number filters</strong><span>Quick-filter prefixes shown beside the Transmittal search box.</span></div><small>{prefixes.length} types</small></div>
      <div className="workflow-prefix-list">{prefixes.map(prefix=><div key={prefix}><code>{prefix}</code><button type="button" aria-label={`Remove ${prefix}`} disabled={prefixes.length===1} onClick={()=>setPrefixes(previous=>previous.filter(value=>value!==prefix))}><X/></button></div>)}</div>
      <div className="workflow-prefix-add"><input value={prefixDraft} maxLength={80} placeholder="Add a prefix" onChange={event=>setPrefixDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();addPrefix()}}}/><button type="button" onClick={addPrefix} disabled={!prefixDraft.trim()}><Plus/></button></div>
    </div>
    <div className="workflow-config-actions"><p>Existing document progress is preserved by stage/reviewer position when names change.</p><button className="primary-button" disabled={save.isPending||invalid} onClick={()=>save.mutate()}>{save.isPending?<LoaderCircle className="spin"/>:<Save/>} Save workflow structure</button></div>
  </div>
}

function ColumnConfigRow({config,onSaved}:{config:ColumnConfig;onSaved:()=>void}){
  const {codes,labels}=useProjects()
  const poolField=config.field_name==='initiator'||config.field_name==='discipline'
  const [name,setName]=useState(config.display_name)
  const [visible,setVisible]=useState(config.is_visible)
  const [width,setWidth]=useState(config.column_width)
  const [type,setType]=useState(config.input_type)
  const [options,setOptions]=useState(config.options)
  const [optionColors,setOptionColors]=useState(config.option_colors||{})
  const [share,setShare]=useState(config.share_options!==false)
  const [projectOptions,setProjectOptions]=useState<Record<string,string[]>>({...(config.project_options||{})})
  const [projectColors,setProjectColors]=useState<Record<string,Record<string,string>>>({...(config.project_option_colors||{})})
  const [poolProject,setPoolProject]=useState(codes[0]||'NFS')
  const [draft,setDraft]=useState('')
  const inputEditable=!['submission_progress','feedback'].includes(config.field_name)
  useEffect(()=>{
    setName(config.display_name);setVisible(config.is_visible);setWidth(config.column_width);setType(config.input_type)
    setOptions(config.options);setOptionColors(config.option_colors||{})
    setShare(config.share_options!==false);setProjectOptions({...(config.project_options||{})});setProjectColors({...(config.project_option_colors||{})})
  },[config])
  const usingProjectPool=poolField&&!share&&type==='select'
  const activeOptions=usingProjectPool?(projectOptions[poolProject]||[]):options
  const activeColors=usingProjectPool?(projectColors[poolProject]||{}):optionColors
  const colorFor=(option:string,index:number)=>activeColors[option]||palette[index%palette.length]
  const setActiveOptions=(next:string[])=>{
    if(usingProjectPool)setProjectOptions(previous=>({...previous,[poolProject]:next}))
    else setOptions(next)
  }
  const setActiveColor=(option:string,color:string)=>{
    if(usingProjectPool)setProjectColors(previous=>({...previous,[poolProject]:{...(previous[poolProject]||{}),[option]:color}}))
    else setOptionColors(previous=>({...previous,[option]:color}))
  }
  const enablePerProject=()=>{
    setType('select');setShare(false)
    setProjectOptions(previous=>{
      const next={...previous}
      const seed=options.length?options:previous[poolProject]||[]
      for(const code of codes)if(!next[code]?.length)next[code]=[...seed]
      if(!next[poolProject]?.length)next[poolProject]=[...seed]
      return next
    })
  }
  const save=useMutation({mutationFn:()=>settingsApi.updateColumn(config.field_name,{
    display_name:name.trim(),is_visible:visible,column_width:width,input_type:type,
    options:type==='select'?options:[],
    option_colors:Object.fromEntries((type==='select'?options:[]).map((option,index)=>[option,optionColors[option]||palette[index%palette.length]])),
    share_options:!poolField||share,
    project_options:poolField&&!share?projectOptions:{},
    project_option_colors:poolField&&!share?projectColors:{},
  }),onSuccess:()=>{toast.success(`${name.trim()} column updated`);onSaved()},onError:e=>toast.error(getApiError(e))})
  const add=()=>{const value=draft.trim();if(value&&!activeOptions.includes(value)){setActiveOptions([...activeOptions,value]);setActiveColor(value,palette[activeOptions.length%palette.length])}setDraft('')}
  const remove=(option:string)=>{setActiveOptions(activeOptions.filter(value=>value!==option))}
  const dirty=name!==config.display_name||visible!==config.is_visible||width!==config.column_width||type!==config.input_type||JSON.stringify(options)!==JSON.stringify(config.options)||(poolField&&share!==(config.share_options!==false))||JSON.stringify(projectOptions)!==JSON.stringify(config.project_options||{})||JSON.stringify(optionColors)!==JSON.stringify(config.option_colors||{})||JSON.stringify(projectColors)!==JSON.stringify(config.project_option_colors||{})
  const saveDisabled=save.isPending||!name.trim()||(inputEditable&&type==='select'&&!activeOptions.length)||!dirty
  return <article className={`column-card ${dirty?'is-dirty':''} ${visible?'':'is-hidden'}`}>
    <header className="column-card-head">
      <div className="config-name"><strong>{config.display_name}</strong><code>{config.field_name}</code></div>
      {dirty&&<em className="column-dirty">Unsaved</em>}
      <label className="config-visibility"><input type="checkbox" checked={visible} onChange={event=>setVisible(event.target.checked)}/><i/><span>{visible?'Shown':'Hidden'}</span></label>
      <button type="button" className="save-config" disabled={saveDisabled} onClick={()=>save.mutate()}>{save.isPending?<LoaderCircle className="spin"/>:<Save/>} Save</button>
    </header>
    <div className="column-card-fields">
      <label><span>Display name</span><input className="config-text-input" value={name} maxLength={120} onChange={event=>setName(event.target.value)}/></label>
      <label><span>Width</span><span className="config-width"><input type="number" min={72} max={500} value={width} onChange={event=>setWidth(Math.min(500,Math.max(72,Number(event.target.value)||72)))}/><span>px</span></span></label>
      <div className="column-card-type"><span>Input type</span>{inputEditable?<div className="type-toggle"><button type="button" className={type==='text'?'active':''} onClick={()=>{setType('text');if(poolField)setShare(true)}}>Text</button><button type="button" className={type==='select'?'active':''} onClick={()=>setType('select')}>Dropdown</button></div>:<span className="config-na">Read only</span>}</div>
    </div>
    {inputEditable&&type==='select'&&<div className="column-card-options option-editor">
      {poolField&&<div className="pool-toggle" role="group" aria-label="Option pool sharing"><button type="button" className={share?'active':''} onClick={()=>setShare(true)}>Shared pool</button><button type="button" className={usingProjectPool?'active':''} onClick={enablePerProject}>Per project</button></div>}
      {usingProjectPool&&<label className="pool-project"><span>Project</span><select aria-label={`${config.display_name} project pool`} value={poolProject} onChange={event=>setPoolProject(event.target.value)}>{codes.map(code=><option key={code} value={code}>{code} · {labels[code]}</option>)}</select></label>}
      <div className="option-chips">{activeOptions.map((option,index)=><span key={option} style={{color:colorFor(option,index),backgroundColor:`color-mix(in srgb, ${colorFor(option,index)} 12%, white)`}}><input type="color" aria-label={`${option} color`} value={colorFor(option,index)} onChange={event=>setActiveColor(option,event.target.value)}/>{option}<button type="button" onClick={()=>remove(option)}><X/></button></span>)}</div>
      <div className="option-input"><input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add()}}} placeholder={usingProjectPool?`Add an option for ${poolProject}`:'Add an option'}/><button type="button" onClick={add}><Plus/></button></div>
    </div>}
  </article>
}
