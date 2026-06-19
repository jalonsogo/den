import { useState, useRef, useEffect } from 'react'
import {
  Sun, Moon, Plus, Search, MoreVertical,
  Home, Box, FolderGit2, LayoutGrid, Layers, Package, Settings
} from 'lucide-react'
import { useStore } from '../store'
import { AgentIcon } from './AgentIcon'
import type { Sandbox, PageType } from '../types'

function initials(name: string): string {
  const parts = name.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  return (parts.slice(0, 2).map((p) => p[0]).join('') || name[0] || '?').toUpperCase()
}

function SandboxItem({ sandbox, active, collapsed }: { sandbox: Sandbox; active: boolean; collapsed: boolean }) {
  const { setActiveSandboxId, setContextMenu } = useStore()
  const isRunning = sandbox.status === 'running'
  const isDeleting = sandbox.status === 'deleting'
  const folder = sandbox.workspace.split('/').pop() || sandbox.workspace

  const openMenu = (e: React.MouseEvent, anchor: 'cursor' | 'button') => {
    e.preventDefault()
    e.stopPropagation()
    if (isDeleting) return
    if (anchor === 'button') {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setContextMenu({ visible: true, x: r.right - 200, y: r.bottom + 4, sandboxId: sandbox.id })
    } else {
      setContextMenu({ visible: true, x: e.clientX, y: e.clientY, sandboxId: sandbox.id })
    }
  }

  return (
    <div
      className={`sb-item${active ? ' active' : ''}${isRunning ? '' : ' is-stopped'}${isDeleting ? ' is-deleting' : ''}`}
      onClick={() => !isDeleting && setActiveSandboxId(sandbox.id)}
      onContextMenu={(e) => openMenu(e, 'cursor')}
      title={collapsed ? sandbox.name : undefined}
    >
      <div className="sb-avatar">
        {isDeleting
          ? <div className="sb-avatar-spinner" />
          : <span className="sb-avatar-txt">{initials(sandbox.name)}</span>}
        <span className="sb-avatar-badge"><AgentIcon agent={sandbox.agent} size={11} /></span>
      </div>

      {!collapsed && (
        <>
          <div className="sb-item-body">
            <div className="sb-item-name">{sandbox.name}</div>
            <div className="sb-item-sub">
              {isDeleting ? 'Deleting…' : isRunning ? folder : `${folder} · stopped`}
            </div>
          </div>

          {!isDeleting && (
            <button className="sb-item-menu" onClick={(e) => openMenu(e, 'button')} title="Actions">
              <MoreVertical size={15} />
            </button>
          )}
        </>
      )}
    </div>
  )
}

export function Sidebar() {
  const {
    sandboxes, activeSandboxId, activePage, setModal, setActivePage,
    setNewSandboxWorkspace, setActiveProject, theme, toggleTheme, sidebarCollapsed
  } = useStore()
  const collapsed = sidebarCollapsed
  const [filter, setFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!filterOpen) return
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [filterOpen])

  // Filter by name, provider (agent), or status.
  const q = filter.trim().toLowerCase()
  const filtered = sandboxes.filter((s) =>
    !q ||
    s.name.toLowerCase().includes(q) ||
    s.agent.toLowerCase().includes(q) ||
    s.status.toLowerCase().includes(q)
  )

  // Group sandboxes into projects by workspace directory.
  const projects: { workspace: string; list: Sandbox[] }[] = []
  for (const s of sandboxes) {
    let p = projects.find((x) => x.workspace === s.workspace)
    if (!p) { p = { workspace: s.workspace, list: [] }; projects.push(p) }
    p.list.push(s)
  }

  const openNew = (workspace?: string) => {
    setNewSandboxWorkspace(workspace ?? null)
    setModal('new-sandbox')
  }

  const navItem = (page: PageType, label: string, icon: React.ReactNode) => (
    <div
      className={`sb-nav-item${activePage === page ? ' active' : ''}`}
      onClick={() => setActivePage(page)}
      title={collapsed ? label : undefined}
    >
      {icon}
      <span className="sb-nav-label">{label}</span>
    </div>
  )

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sb-nav sb-nav-first">
        {navItem('home', 'Home', <Home size={16} />)}
      </div>

      <div className="sb-div" />

      {/* Sandboxes — icon + title (menu option), inline filter, borderless add */}
      <div className="sb-section sb-section-grow">
        {collapsed ? (
          <button className="sb-add sb-add-collapsed" onClick={() => openNew()} title="New Sandbox"><Plus size={16} /></button>
        ) : (
          <div className="sb-sec-head">
            <button
              className={`sb-sec-title sb-sec-title-ic${activePage === 'sandbox' ? ' active' : ''}`}
              onClick={() => setActivePage('sandbox')}
            >
              <Box size={16} />
              Sandboxes
            </button>
            <div className="sb-filter-wrap" ref={filterRef}>
              <button
                className={`sb-add${filter ? ' has-filter' : ''}`}
                onClick={() => setFilterOpen((v) => !v)}
                title="Filter sandboxes"
              >
                <Search size={15} />
              </button>
              {filterOpen && (
                <div className="sb-filter-pop">
                  <input
                    autoFocus
                    value={filter}
                    placeholder="Name, provider, or status"
                    onChange={(e) => setFilter(e.target.value)}
                  />
                  {filter && <button className="sb-filter-clear" onClick={() => setFilter('')}>Clear</button>}
                </div>
              )}
            </div>
            <button className="sb-add" onClick={() => openNew()} title="New Sandbox"><Plus size={16} /></button>
          </div>
        )}
        <div className="sb-list">
          {filtered.length === 0
            ? (!collapsed && <div className="sb-empty">{sandboxes.length === 0 ? 'No sandboxes' : 'No matches'}</div>)
            : filtered.map((s) => (
              <SandboxItem key={s.id} sandbox={s} active={activeSandboxId === s.id && activePage === 'sandbox'} collapsed={collapsed} />
            ))}
        </div>
      </div>

      <div className="sb-div" />

      {/* Projects — title shows all; a row opens that project */}
      <div className="sb-section">
        {!collapsed ? (
          <div className="sb-sec-head">
            <button
              className={`sb-sec-title${activePage === 'projects' ? ' active' : ''}`}
              onClick={() => { setActiveProject(null); setActivePage('projects') }}
            >
              Projects
            </button>
          </div>
        ) : (
          <div
            className={`sb-nav-item${activePage === 'projects' ? ' active' : ''}`}
            onClick={() => { setActiveProject(null); setActivePage('projects') }}
            title="Projects"
          >
            <FolderGit2 size={16} />
          </div>
        )}
        {!collapsed && (
          projects.length === 0
            ? <div className="sb-empty">No projects</div>
            : projects.map((p) => (
              <div className="sb-proj" key={p.workspace}>
                <div className="sb-proj-main" onClick={() => { setActiveProject(p.workspace); setActivePage('projects') }} title={p.workspace}>
                  <FolderGit2 size={15} style={{ color: 'var(--sb-muted)', flexShrink: 0 }} />
                  <span className="sb-proj-name">{p.workspace.split('/').pop() || p.workspace}</span>
                  <span className="sb-proj-count">{p.list.length}</span>
                </div>
                <button className="sb-proj-add" title="New sandbox in this project" onClick={() => openNew(p.workspace)}>
                  <Plus size={13} />
                </button>
              </div>
            ))
        )}
      </div>

      <div className="sb-div" />

      {/* Library */}
      <div className="sb-nav">
        {!collapsed && <span className="sb-label">Library</span>}
        {navItem('templates', 'Templates', <LayoutGrid size={16} />)}
        {navItem('mixins', 'Mixins', <Layers size={16} />)}
        {navItem('kits', 'Kits', <Package size={16} />)}
      </div>

      <div className="sb-bottom">
        {navItem('settings', 'Settings', <Settings size={16} />)}
      </div>

      <div className="sb-foot">
        {!collapsed && (
          <span className="sb-foot-text">
            <span className="sb-foot-dot" />
            sbx · connected
          </span>
        )}
        <button
          className="sb-icon-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        >
          {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>
    </aside>
  )
}
