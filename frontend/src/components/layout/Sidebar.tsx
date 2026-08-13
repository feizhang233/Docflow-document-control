import { BarChart3, Building2, ChevronDown, FileText, Menu, Repeat2, Send, Settings, X } from 'lucide-react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { projectFilterFrom, projectLabels } from '../../lib/projects'
import { projectCodes, type ProjectFilter } from '../../types/package'

const documentLinks = [
  ['This Week', '/documents/week'], ['This Month', '/documents/month'],
  ['This Year', '/documents/year'], ['All', '/documents/all'],
]

export function Sidebar({ mobileOpen, collapsed, onClose, onToggleCollapsed }: { mobileOpen: boolean; collapsed: boolean; onClose: () => void; onToggleCollapsed: () => void }) {
  const [documentsOpen,setDocumentsOpen]=useState(true)
  const location=useLocation()
  const navigate=useNavigate()
  const [searchParams]=useSearchParams()
  const selectedProject=projectFilterFrom(searchParams.get('project'))
  const documentsActive=location.pathname.startsWith('/documents')
  const projectUrl=(url:string)=>selectedProject==='ALL'?url:`${url}?project=${selectedProject}`
  const changeProject=(project:ProjectFilter)=>{
    const params=new URLSearchParams(searchParams)
    params.delete('focus');params.delete('package');params.delete('notification')
    if(project==='ALL')params.delete('project');else params.set('project',project)
    navigate({pathname:location.pathname,search:params.toString()?`?${params}`:''})
  }
  return <>
    {mobileOpen && <div className="sidebar-backdrop" onClick={onClose} />}
    <aside className={`sidebar ${mobileOpen ? 'open' : ''} ${collapsed ? 'desktop-collapsed' : ''}`}>
      <div className="brand"><div className="brand-mark">D</div><div className="brand-copy"><strong>DocFlow</strong><span>Project Controls</span></div><button className="sidebar-close" onClick={onClose} aria-label="Close navigation"><X size={18}/></button></div>
      <nav className="nav-list">
        <button className="sidebar-collapse-toggle" onClick={onToggleCollapsed} aria-label={collapsed?'Expand navigation':'Collapse navigation'} title={collapsed?'Expand navigation':'Collapse navigation'}><Menu size={19}/></button>
        <NavLink to="/" end className="nav-item" onClick={onClose} aria-label="Dashboard" title={collapsed?'Dashboard':undefined}><BarChart3 size={18}/><span>Dashboard</span></NavLink>
        <label className="project-switcher" title={collapsed?projectLabels[selectedProject]:undefined}>
          <Building2 size={18}/>
          <span><small>Project</small><select aria-label="Select project" value={selectedProject} onChange={event=>changeProject(event.target.value as ProjectFilter)}><option value="ALL">All Projects</option>{projectCodes.map(code=><option key={code} value={code}>{code} · {projectLabels[code]}</option>)}</select></span>
        </label>
        <div className={`nav-section ${documentsOpen?'expanded':'collapsed'}`}>
          <div className={`nav-parent-row ${documentsActive?'active':''}`}><NavLink to={projectUrl('/documents/week')} className="nav-parent" onClick={onClose} aria-label="Documents" title={collapsed?'Documents':undefined}><FileText size={18}/><span>Documents</span></NavLink><button type="button" className="nav-collapse-button" aria-label={documentsOpen?'Collapse Documents':'Expand Documents'} aria-expanded={documentsOpen} onClick={()=>setDocumentsOpen(open=>!open)}><ChevronDown size={15}/></button></div>
          {documentsOpen&&<div className="nav-children">{documentLinks.map(([label, url]) => <NavLink key={url} to={projectUrl(url)} className="nav-child" onClick={onClose}>{label}</NavLink>)}</div>}
        </div>
        <NavLink to={projectUrl('/workflow')} className="nav-item" onClick={onClose} aria-label="Workflow" title={collapsed?'Workflow':undefined}><Repeat2 size={18}/><span>Workflow</span></NavLink>
        <NavLink to={projectUrl('/transmittal')} className="nav-item" onClick={onClose} aria-label="Transmittal" title={collapsed?'Transmittal':undefined}><Send size={18}/><span>Transmittal</span></NavLink>
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/settings" className="nav-item" onClick={onClose} aria-label="Settings" title={collapsed?'Settings':undefined}><Settings size={18}/><span>Settings</span></NavLink>
      </div>
    </aside>
  </>
}
