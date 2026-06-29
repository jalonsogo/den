import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  Sun, Moon, Plus, Filter, X, MoreVertical,
  Home, FolderGit2, LayoutGrid, Layers, Package, Settings
} from 'lucide-react'
import { useStore } from '../store'
import { AgentIcon } from './AgentIcon'
import { ProjectAvatar } from './ProjectAvatar'
import type { Sandbox, PageType } from '../types'

// Collapsed-rail project icon with a hover popover: lists the project's
// sandboxes (click to switch), and a "New sandbox" action.
function CollapsedProject({
  project, active, onOpenProject, onNew, onOpenSandbox
}: {
  project: { workspace: string; list: Sandbox[] }
  active: boolean
  onOpenProject: () => void
  onNew: () => void
  onOpenSandbox: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const name = project.workspace.split('/').pop() || project.workspace

  const show = (e: React.MouseEvent) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPos({ top: r.top, left: r.right + 8 })
    setOpen(true)
  }
  const hide = () => { closeTimer.current = setTimeout(() => setOpen(false), 140) }

  return (
    <div
      className={`sb-nav-item${active ? ' active' : ''}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={onOpenProject}
    >
      <ProjectAvatar workspace={project.workspace} size={26} editable={false} />
      {open && createPortal(
        <div
          className="sb-proj-pop"
          style={{ top: pos.top, left: pos.left }}
          onMouseEnter={() => { if (closeTimer.current) clearTimeout(closeTimer.current) }}
          onMouseLeave={hide}
        >
          <div className="sb-proj-pop-hd">
            <ProjectAvatar workspace={project.workspace} size={20} editable={false} />
            <span className="sb-proj-pop-name">{name}</span>
            <span className="sb-proj-pop-count">{project.list.length}</span>
          </div>
          <button className="sb-proj-pop-new" onClick={() => { onNew(); setOpen(false) }}>
            <Plus size={13} /> New sandbox
          </button>
          <div className="sb-proj-pop-list">
            {project.list.map((s) => (
              <button
                key={s.id}
                className="sb-proj-pop-item"
                onClick={() => { onOpenSandbox(s.id); setOpen(false) }}
              >
                <span className="sb-proj-pop-dot" data-on={s.status === 'running'} />
                <span className="sb-proj-pop-name">{s.name}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

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
    sandboxes, activeSandboxId, activePage, setModal, setActivePage, setActiveSandboxId,
    setNewSandboxWorkspace, setActiveProject, theme, toggleTheme, sidebarCollapsed
  } = useStore()
  const collapsed = sidebarCollapsed
  const [filter, setFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)

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

  // Show a Radix tooltip only when collapsed (labels are visible when expanded).
  const tip = (label: string, node: React.ReactElement) =>
    collapsed ? (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{node}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="sb-tip" side="right" sideOffset={8}>
            {label}
            <Tooltip.Arrow className="sb-tip-arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    ) : node

  // Always-on tooltip (e.g. show a project's full path on hover, even expanded).
  const tipAlways = (label: string, node: React.ReactElement) => (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{node}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="sb-tip" side="right" sideOffset={8}>
          {label}
          <Tooltip.Arrow className="sb-tip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )

  const navItem = (page: PageType, label: string, icon: React.ReactNode) =>
    tip(
      label,
      <div
        className={`sb-nav-item${activePage === page ? ' active' : ''}`}
        onClick={() => setActivePage(page)}
      >
        {icon}
        <span className="sb-nav-label">{label}</span>
      </div>
    )

  return (
    <Tooltip.Provider delayDuration={250} skipDelayDuration={400}>
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sb-nav sb-nav-first">
        {navItem('home', 'Home', <Home size={16} />)}
      </div>

      <div className="sb-div" />

      {/* Sandboxes — icon + title (menu option), inline filter, borderless add */}
      <div className="sb-section sb-section-grow">
        {collapsed ? (
          tip('New Sandbox', <button className="sb-add sb-add-collapsed" onClick={() => openNew()}><Plus size={16} /></button>)
        ) : (
          <>
            <div className="sb-sec-head">
              <button
                className={`sb-sec-title${activePage === 'sandbox' ? ' active' : ''}`}
                onClick={() => setActivePage('sandbox')}
              >
                Sandboxes
              </button>
              <button
                className={`sb-add${filterOpen || filter ? ' has-filter' : ''}`}
                onClick={() => {
                  setFilterOpen((v) => {
                    if (v) setFilter('')
                    return !v
                  })
                }}
                title="Filter sandboxes"
              >
                <Filter size={15} />
              </button>
              <button className="sb-add" onClick={() => openNew()} title="New Sandbox"><Plus size={16} /></button>
            </div>
            {filterOpen && (
              <div className="sb-filter-row">
                <Filter size={13} className="sb-filter-row-ic" />
                <input
                  autoFocus
                  value={filter}
                  placeholder="Name, provider, or status"
                  onChange={(e) => setFilter(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setFilter(''); setFilterOpen(false) } }}
                />
                {filter && (
                  <button className="sb-filter-row-x" onClick={() => setFilter('')} title="Clear"><X size={13} /></button>
                )}
              </div>
            )}
          </>
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
            <button className="sb-add" onClick={() => openNew()} title="New project"><Plus size={16} /></button>
          </div>
        ) : projects.length === 0 ? (
          tip('Projects',
            <div
              className={`sb-nav-item${activePage === 'projects' ? ' active' : ''}`}
              onClick={() => { setActiveProject(null); setActivePage('projects') }}
            >
              <FolderGit2 size={16} />
            </div>
          )
        ) : (
          projects.map((p) => (
            <CollapsedProject
              key={p.workspace}
              project={p}
              active={activePage === 'projects'}
              onOpenProject={() => { setActiveProject(p.workspace); setActivePage('projects') }}
              onNew={() => openNew(p.workspace)}
              onOpenSandbox={(id) => { setActiveSandboxId(id); setActivePage('sandbox') }}
            />
          ))
        )}
        {!collapsed && (
          projects.length === 0
            ? <div className="sb-empty">No projects</div>
            : projects.map((p) => (
              <div className="sb-proj" key={p.workspace}>
                <div className="sb-proj-main" onClick={() => { setActiveProject(p.workspace); setActivePage('projects') }}>
                  <ProjectAvatar workspace={p.workspace} size={22} />
                  {tipAlways(
                    p.workspace,
                    <span className="sb-proj-name">{p.workspace.split('/').pop() || p.workspace}</span>
                  )}
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
    </Tooltip.Provider>
  )
}
