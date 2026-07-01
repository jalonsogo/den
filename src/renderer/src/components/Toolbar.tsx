import { useState, useRef, useEffect } from 'react'
import { Search, PanelLeftClose, PanelLeftOpen, ChevronDown, Check, LogOut } from 'lucide-react'
import { useStore } from '../store'
import { formatUptime } from '../lib/utils'

const ACCOUNT_EMAIL = 'javier.alonso@docker.com'
const ORGS = ['Docker', 'Personal']

export function Toolbar() {
  const { sandboxes, activeSandboxId, activePage, sidebarCollapsed, toggleSidebar } = useStore()
  const sandbox = sandboxes.find((s) => s.id === activeSandboxId)
  const activity = useStore((s) => (sandbox ? s.agentActivity[sandbox.name] ?? null : null))
  const showStatus = !!sandbox && activePage === 'sandbox' && sandbox.status === 'running' && !!activity

  const [acctOpen, setAcctOpen] = useState(false)
  const [org, setOrg] = useState(ORGS[0])
  const [account, setAccount] = useState<{ loggedIn: boolean; username?: string; email?: string; gravatar?: string }>({ loggedIn: false })
  const [avatarFailed, setAvatarFailed] = useState(false)
  const acctRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.minipit?.dockerAccount()
      .then((a) => { setAccount(a ?? { loggedIn: false }); setAvatarFailed(false) })
      .catch(() => {})
  }, [])

  // Name shown in the account button: the Docker username if signed in, else
  // the local part of the fallback email.
  const name = account.username || ACCOUNT_EMAIL.split('@')[0]
  const email = account.email || ACCOUNT_EMAIL
  const initials = name.slice(0, 2).toUpperCase()
  const gravatarUrl = account.gravatar
    ? `https://www.gravatar.com/avatar/${account.gravatar}?d=404&s=64`
    : null

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
    if (activePage === 'mixins')     return { title: 'Mixin Kits', sub: 'Add-ons layered onto an agent' }
    if (activePage === 'kits')       return { title: 'Sandbox Kits', sub: 'Full agents, defined from scratch' }
    if (activePage === 'settings')   return { title: 'Settings', sub: 'den preferences' }
    if (!sandbox) return { title: 'den', sub: 'No sandbox selected' }
    const uptime = sandbox.uptimeSeconds ? formatUptime(sandbox.uptimeSeconds) : ''
    if (sandbox.status !== 'running') return { title: sandbox.name, sub: 'Stopped' }
    const verb = activity === 'working' ? 'Working…' : activity === 'waiting' ? 'Waiting for you' : 'Running'
    return { title: sandbox.name, sub: uptime ? `${verb} · ${uptime}` : verb }
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
        <div className="tb-title">
          {showStatus && <span className={`tb-status-dot ${activity}`} />}
          {title}
        </div>
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
          {gravatarUrl && !avatarFailed ? (
            <img className="tb-acct-avatar" src={gravatarUrl} alt={name} onError={() => setAvatarFailed(true)} />
          ) : (
            <span className="tb-acct-avatar">{initials}</span>
          )}
          <span className="tb-acct-idy">
            <span className="tb-acct-name">{name}</span>
            <span className="tb-acct-org">{org}</span>
          </span>
          <ChevronDown size={13} style={{ color: 'var(--t3)' }} />
        </button>

        {acctOpen && (
          <div className="tb-acct-menu">
            <div className="tb-acct-hd">
              <div className="tb-acct-hd-name">{name}</div>
              <div className="tb-acct-hd-sub">{email}</div>
            </div>
            <div className="tb-acct-divider" />
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
