import { Suspense, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu, Moon, Sun } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { NotificationsPopover } from './NotificationsPopover'
import { UserMenu } from './UserMenu'
import { useAuth } from '../../hooks/useAuth'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'

const readPreference = (key: string, fallback: string) => {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}

const writePreference = (key: string, value: string) => {
  try { localStorage.setItem(key, value) } catch { /* Storage can be unavailable in private browsing. */ }
}

export function AppShell() {
  const { can } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readPreference('docflow-sidebar-collapsed', 'false') === 'true')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => readPreference('docflow-theme', 'light') === 'dark' ? 'dark' : 'light')
  const routeLabel = useMemo(() => {
    if (location.pathname === '/') return 'Control room'
    if (location.pathname.startsWith('/documents')) return 'Document register'
    if (location.pathname.startsWith('/workflow')) return 'Workflow register'
    if (location.pathname.startsWith('/transmittal')) return 'Transmittal register'
    if (location.pathname.startsWith('/settings')) return 'Workspace settings'
    return 'Workspace'
  }, [location.pathname])
  useDocumentTitle(routeLabel)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])
  const toggleSidebar=()=>setSidebarCollapsed(value=>{
    const next=!value
    writePreference('docflow-sidebar-collapsed',String(next))
    return next
  })
  const toggleTheme=()=>setTheme(value=>{
    const next=value==='light'?'dark':'light'
    writePreference('docflow-theme',next)
    return next
  })
  return (
    <div className={`app-shell ${sidebarCollapsed?'sidebar-is-collapsed':''}`}>
      <Sidebar mobileOpen={mobileOpen} collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebar} onClose={() => setMobileOpen(false)} />
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-leading">
            <button className="icon-button menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
            <div className="topbar-context"><span className="status-dot" /><span><small>Live workspace</small><strong>{routeLabel}</strong></span></div>
          </div>
          <div className="topbar-actions">
            <button className="icon-button theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <UserMenu />
            {can('notifications:read') && <NotificationsPopover open={notificationsOpen} onToggle={() => setNotificationsOpen(value=>!value)} onClose={() => setNotificationsOpen(false)} />}
          </div>
        </header>
        <main className="page-content"><div className="route-transition" key={location.pathname}><Suspense fallback={<div className="state-panel">Loading workspace…</div>}><Outlet /></Suspense></div></main>
      </div>
    </div>
  )
}
