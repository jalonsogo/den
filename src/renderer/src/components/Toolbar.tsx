import { useState, useRef, useEffect } from 'react'
import { Search, PanelLeftClose, PanelLeftOpen, ChevronDown, Check, LogOut } from 'lucide-react'
import { useStore } from '../store'
import { formatUptime } from '../lib/utils'

const ACCOUNT_EMAIL = 'javier.alonso@docker.com'
const ORGS = ['Docker', 'Personal']

export function Toolbar() {
  const { sandboxes, activeSandboxId, activePage, sidebarCollapsed, toggleSidebar } = useStore()
  const sandbox = sandboxes.find((s) => s.id === activeSandboxId)

  const [acctOpen, setAcctOpen] = useState(false)
  const [org, setOrg] = useState(ORGS[0])
  const acctRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!acctOpen) return
    const handler = (e: MouseEvent) => {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [acctOpen])

  const handleSignOut = async () => {
    setAcctOpen(false)
    if (!confirm('Sign out of Docker? This stops all running sandboxes.')) return
    await window.minipit?.signOut().catch((e) => console.error(e))
  }

  const getTitle = () => {
    if (activePage === 'home')       return { title: 'Home', sub: 'Overview' }
    if (activePage === 'projects')   return { title: 'Projects', sub: 'Workspaces & their sandboxes' }
    if (activePage === 'templates')  return { title: 'Templates', sub: 'Reusable sandbox images' }
    if (activePage === 'mixins')     return { title: 'Mixins', sub: 'Layer tools onto an agent' }
    if (activePage === 'kits')       return { title: 'Kits', sub: 'Define an agent from scratch' }
    if (activePage === 'settings')   return { title: 'Settings', sub: 'minipit preferences' }
    if (!sandbox) return { title: 'minipit', sub: 'No sandbox selected' }
    const uptime = sandbox.uptimeSeconds ? formatUptime(sandbox.uptimeSeconds) : ''
    const sub = sandbox.status === 'running' ? `Running · ${uptime}` : 'Stopped'
    return { title: sandbox.name, sub }
  }

  const { title, sub } = getTitle()

  return (
    <div className="toolbar">
      <button
        className="tb-icon-btn"
        onClick={toggleSidebar}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      <div className="tb-center">
        <div className="tb-title">{title}</div>
        <div className="tb-sub">{sub}</div>
      </div>

      <div style={{ flex: 1 }} />

      <div className="tb-search">
        <Search size={12} style={{ color: 'var(--t3)' }} />
        <span className="tb-search-ph">Search…</span>
        <span className="tb-search-kbd">⌘K</span>
      </div>

      <div className="tb-sep" />

      <div className="tb-acct-wrap" ref={acctRef}>
        <button className="tb-acct" onClick={() => setAcctOpen((v) => !v)}>
          <span className="tb-acct-avatar">JA</span>
          <span className="tb-acct-name">{ACCOUNT_EMAIL}</span>
          <ChevronDown size={13} style={{ color: 'var(--t3)' }} />
        </button>

        {acctOpen && (
          <div className="tb-acct-menu">
            <div className="tb-acct-hd">{ACCOUNT_EMAIL}</div>
            <div className="tb-acct-label">Organizations</div>
            {ORGS.map((o) => (
              <div key={o} className="tb-acct-item" onClick={() => { setOrg(o); setAcctOpen(false) }}>
                {o}
                {org === o && <Check size={13} style={{ marginLeft: 'auto', color: 'var(--accent, var(--primary))' }} />}
              </div>
            ))}
            <div className="tb-acct-divider" />
            <button className="tb-acct-signout" onClick={handleSignOut}>
              <LogOut size={13} />
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
