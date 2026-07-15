import { useState, useRef, useEffect } from 'react'
import { Search, PanelLeftClose, PanelLeftOpen, ChevronDown, Check, LogOut, X, Minus, Square, Copy } from 'lucide-react'
import { useStore } from '../store'
import type { Sandbox } from '../types'

export function Toolbar() {
  const { sandboxes, activeSandboxId, activePage, sidebarCollapsed, toggleSidebar, dockerAccount, activeOrg, setActiveOrg, loadDockerAccount, setSandboxes } = useStore()
  const sandbox = sandboxes.find((s) => s.id === activeSandboxId)

  const [acctOpen, setAcctOpen] = useState(false)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const acctRef = useRef<HTMLDivElement>(null)

  const account = dockerAccount ?? { loggedIn: false }
  // Selectable namespaces: the user's own username (personal) + their orgs.
  const namespaces = [account.username, ...(account.orgs ?? [])].filter((n): n is string => !!n)
  // The active namespace shown under the name; falls back to the username.
  const org = activeOrg ?? account.username ?? ''

  useEffect(() => { setAvatarFailed(false) }, [account.gravatar])

  useEffect(() => {
    if (!window.windowControls.isCustomChrome) return
    let mounted = true
    let receivedEvent = false
    const unsubscribe = window.windowControls.onMaximizedChanged((next) => {
      receivedEvent = true
      if (mounted) setMaximized(next)
    })
    window.windowControls.getState()
      .then((initial) => {
        if (mounted && !receivedEvent) setMaximized(initial)
      })
      .catch(() => {})
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  // Name shown in the account button: the Docker username if signed in, else a
  // neutral placeholder (never a hardcoded personal identity).
  const name = account.username || 'Docker account'
  // Real email from the Docker Hub API; absent when offline or the token can't
  // read it, so the header hides the sub-line when we don't have one.
  const email = account.email
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
    const r = await window.minipit?.signOut().catch((e) => ({ ok: false, error: String(e), netError: false }))
    if (r && !r.ok) {
      alert(r.netError
        ? 'Couldn’t reach Docker Hub to sign out — check your network/DNS and try again.'
        : `Sign out failed: ${r.error ?? 'unknown error'}`)
      return
    }
    // Reflect the signed-out state immediately: refresh the account (now logged
    // out) and the sandbox list (logout stopped them all).
    loadDockerAccount()
    window.minipit?.listSandboxes().then((s) => setSandboxes(s as Sandbox[])).catch(() => {})
  }

  const getTitle = () => {
    if (activePage === 'sandboxes')  return { title: 'Sandboxes', sub: 'Overview' }
    if (activePage === 'projects')   return { title: 'Projects', sub: 'Workspaces & their sandboxes' }
    if (activePage === 'templates')  return { title: 'Templates', sub: 'Reusable sandbox images' }
    if (activePage === 'mixins')     return { title: 'Mixin Kits', sub: 'Add-ons layered onto an agent' }
    if (activePage === 'kits')       return { title: 'Sandbox Kits', sub: 'Full agents, defined from scratch' }
    if (activePage === 'settings')   return { title: 'Settings', sub: 'den preferences' }
    // On the sandbox detail page the sandbox's own header owns the name +
    // status + uptime, so keep the window header clear of that duplicate.
    if (sandbox) return { title: '', sub: '' }
    return { title: 'den', sub: 'No sandbox selected' }
  }

  const { title, sub } = getTitle()

  return (
    <div className={`toolbar${window.windowControls.isCustomChrome ? ' toolbar-custom-chrome' : ''}`}>
      {window.windowControls.isCustomChrome && (
        <div className="window-controls" role="group" aria-label="Window controls">
          <button
            type="button"
            className="window-control window-control-close"
            onClick={() => { window.windowControls.close().catch(() => {}) }}
            title="Close"
            aria-label="Close"
          >
            <X size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="window-control"
            onClick={() => { window.windowControls.minimize().catch(() => {}) }}
            title="Minimize"
            aria-label="Minimize"
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="window-control"
            onClick={() => { window.windowControls.toggleMaximize().catch(() => {}) }}
            title={maximized ? 'Restore' : 'Maximize'}
            aria-label={maximized ? 'Restore' : 'Maximize'}
          >
            {maximized ? <Copy size={13} aria-hidden="true" /> : <Square size={13} aria-hidden="true" />}
          </button>
        </div>
      )}
      <button
        type="button"
        className="tb-icon-btn"
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      <div className="tb-center">
        {title && <div className="tb-title">{title}</div>}
        {sub && <div className="tb-sub">{sub}</div>}
      </div>

      <div style={{ flex: 1 }} />

      <button className="tb-search" onClick={() => useStore.getState().setPaletteOpen(true)}>
        <Search size={12} style={{ color: 'var(--t3)' }} />
        <span className="tb-search-ph">Search…</span>
        <span className="tb-search-kbd">⌘K</span>
      </button>

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
              {email && <div className="tb-acct-hd-sub">{email}</div>}
            </div>
            {namespaces.length > 0 && (
              <>
                <div className="tb-acct-divider" />
                <div className="tb-acct-label">Namespaces</div>
                <div className="tb-acct-scroll">
                  {namespaces.map((o) => (
                    <div key={o} className="tb-acct-item" onClick={() => { setActiveOrg(o); setAcctOpen(false) }}>
                      {o}
                      {o === account.username && <span className="tb-acct-item-tag">personal</span>}
                      {org === o && <Check size={13} style={{ marginLeft: 'auto', color: 'var(--accent, var(--primary))' }} />}
                    </div>
                  ))}
                </div>
              </>
            )}
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
