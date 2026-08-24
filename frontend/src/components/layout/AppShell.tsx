import { Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { NotificationsPopover } from './NotificationsPopover'
import { UserMenu } from './UserMenu'
import { useAuth } from '../../hooks/useAuth'

export function AppShell() {
  const { can } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('docflow-sidebar-collapsed') === 'true')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const toggleSidebar=()=>setSidebarCollapsed(value=>{
    const next=!value
    localStorage.setItem('docflow-sidebar-collapsed',String(next))
    return next
  })
  return (
    <div className={`app-shell ${sidebarCollapsed?'sidebar-is-collapsed':''}`}>
      <Sidebar mobileOpen={mobileOpen} collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebar} onClose={() => setMobileOpen(false)} />
      <div className="main-shell">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="topbar-context"><span className="status-dot" /> Systems operational</div>
          <div className="topbar-actions">
            <UserMenu />
            {can('notifications:read') && <NotificationsPopover open={notificationsOpen} onToggle={() => setNotificationsOpen(value=>!value)} onClose={() => setNotificationsOpen(false)} />}
          </div>
        </header>
        <main className="page-content"><Suspense fallback={<div className="state-panel">Loading…</div>}><Outlet /></Suspense></main>
      </div>
    </div>
  )
}
