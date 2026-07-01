import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  Plus, Filter, X, MoreVertical, ChevronRight, ChevronDown, Trash2,
  Home, FolderGit2, LayoutGrid, Layers, Package, Settings
} from 'lucide-react'
import { useStore, unackedBlockCount } from '../store'
import { ProjectAvatar } from './ProjectAvatar'
import { SandboxAvatar } from './SandboxAvatar'
import type { Sandbox, PageType } from '../types'

// Project row/icon with a hover popover that lists the project's sandboxes
// (click to switch), the full path, and a "New sandbox" action. Used for both
// the collapsed rail icon and the expanded project rows.
function ProjectHover({
  project, className, onClick, onNew, onOpenSandbox, children
}: {
  project: { workspace: string; list: Sandbox[] }
  className?: string
  onClick?: () => void
  onNew: () => void
  onOpenSandbox: (id: string) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [confirmDel, setConfirmDel] = useState(false)
  const [delFolder, setDelFolder] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>()
  const pickerOpen = useStore((s) => s.pickerOpen)
  const removeProject = useStore((s) => s.removeProject)
  const name = project.workspace.split('/').pop() || project.workspace
  const isEmpty = project.list.length === 0

  const show = (e: React.MouseEvent) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPos({ top: r.top, left: r.right + 8 })
    setOpen(true)
  }
  const hide = () => { closeTimer.current = setTimeout(() => { setOpen(false); setConfirmDel(false) }, 140) }

  return (
    <div className={className} onMouseEnter={show} onMouseLeave={hide} onClick={onClick}>
      {children}
      {open && !pickerOpen && createPortal(
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
          <div className="sb-proj-pop-path">{project.workspace}</div>
          <button className="sb-proj-pop-new" onClick={(e) => { e.stopPropagation(); onNew(); setOpen(false) }}>
            <Plus size={13} /> New sandbox
          </button>
          <div className="sb-proj-pop-list">
            {project.list.length === 0
              ? <div className="sb-proj-pop-empty">No sandboxes yet</div>
              : project.list.map((s) => (
                <button
                  key={s.id}
                  className="sb-proj-pop-item"
                  onClick={(e) => { e.stopPropagation(); onOpenSandbox(s.id); setOpen(false) }}
                >
                  <span className="sb-proj-pop-dot" data-on={s.status === 'running'} />
                  <span className="sb-proj-pop-name">{s.name}</span>
                </button>
              ))}
          </div>

          {/* Delete is only offered for empty projects (no sandboxes to orphan). */}
          {isEmpty && (
            <div className="sb-proj-pop-foot">
              {confirmDel ? (
                <>
                  <label className="sb-proj-pop-chk">
                    <input type="checkbox" checked={delFolder} onChange={(e) => setDelFolder(e.target.checked)} />
                    Also delete the folder from disk
                  </label>
                  <div className="sb-proj-pop-delrow">
                    <button className="sb-proj-pop-cancel" onClick={(e) => { e.stopPropagation(); setConfirmDel(false) }}>Cancel</button>
                    <button
                      className="sb-proj-pop-confirm"
                      onClick={(e) => { e.stopPropagation(); removeProject(project.workspace, delFolder); setOpen(false); setConfirmDel(false) }}
                    >
                      Delete{delFolder ? ' + folder' : ''}
                    </button>
                  </div>
                </>
              ) : (
                <button className="sb-proj-pop-rm" onClick={(e) => { e.stopPropagation(); setConfirmDel(true) }}>
                  <Trash2 size={12} /> Remove project
                </button>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

function SandboxItem({ sandbox, active, collapsed }: { sandbox: Sandbox; active: boolean; collapsed: boolean }) {
  const { setActiveSandboxId, setContextMenu } = useStore()
  const isRunning = sandbox.status === 'running'
  const isDeleting = sandbox.status === 'deleting'
  const isCreating = sandbox.status === 'creating'
  const folder = sandbox.workspace.split('/').pop() || sandbox.workspace
  const hasBlocks = useStore((s) => unackedBlockCount(s.policyBlocks, s.blocksSeenAt, sandbox.name) > 0)
  const activity = useStore((s) => s.agentActivity[sandbox.name] ?? null)
  const justCreated = useStore((s) => s.highlightSandbox === sandbox.name)

  const openMenu = (e: React.MouseEvent, anchor: 'cursor' | 'button') => {
    e.preventDefault()
    e.stopPropagation()
    if (isDeleting || isCreating) return
    if (anchor === 'button') {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setContextMenu({ visible: true, x: r.right - 200, y: r.bottom + 4, sandboxId: sandbox.id })
    } else {
      setContextMenu({ visible: true, x: e.clientX, y: e.clientY, sandboxId: sandbox.id })
    }
  }

  return (
    <div
      className={`sb-item${active ? ' active' : ''}${isRunning ? '' : ' is-stopped'}${isDeleting || isCreating ? ' is-deleting' : ''}${justCreated ? ' just-created' : ''}`}
      onClick={() => !isDeleting && !isCreating && setActiveSandboxId(sandbox.id)}
      onContextMenu={(e) => openMenu(e, 'cursor')}
      title={collapsed ? sandbox.name : undefined}
    >
      <SandboxAvatar sandbox={sandbox} deleting={isDeleting} alert={hasBlocks} activity={isRunning ? activity : null} />

      {!collapsed && (
        <>
          <div className="sb-item-body">
            <div className="sb-item-name">{sandbox.name}</div>
            <div className={`sb-item-sub${isRunning && activity === 'working' ? ' is-working' : ''}`}>
              {isCreating
                ? 'Creating…'
                : isDeleting
                ? 'Deleting…'
                : !isRunning
                  ? `${folder} · stopped`
                  : activity === 'working'
                    ? 'Working…'
                    : activity === 'waiting'
                      ? 'Waiting for you'
                      : folder}
            </div>
          </div>

          {!isDeleting && !isCreating && (
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
    setNewSandboxWorkspace, setActiveProject, sidebarCollapsed,
    customProjects, addProject
  } = useStore()
  const collapsed = sidebarCollapsed
  const [filter, setFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [libOpen, setLibOpen] = useState(() => localStorage.getItem('minipit:libraryOpen') === '1')

  // Filter by name, provider (agent), or status.
  const q = filter.trim().toLowerCase()
  const filtered = sandboxes.filter((s) =>
    !q ||
    s.name.toLowerCase().includes(q) ||
    s.agent.toLowerCase().includes(q) ||
    s.status.toLowerCase().includes(q)
  )

  // Group sandboxes into projects by workspace directory, then fold in any
  // empty projects the user created (folders with no sandbox yet).
  const projects: { workspace: string; list: Sandbox[] }[] = []
  for (const s of sandboxes) {
    let p = projects.find((x) => x.workspace === s.workspace)
    if (!p) { p = { workspace: s.workspace, list: [] }; projects.push(p) }
    p.list.push(s)
  }
  for (const ws of customProjects) {
    if (!projects.find((p) => p.workspace === ws)) projects.push({ workspace: ws, list: [] })
  }

  const newProject = () => {
    addProject().then((dir) => { if (dir) { setActiveProject(dir); setActivePage('projects') } })
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
                className={`sb-sec-title${activePage === 'sandboxes' || activePage === 'sandbox' ? ' active' : ''}`}
                onClick={() => setActivePage('sandboxes')}
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

      {/* Projects — title opens all; a row opens that project (hover = popover) */}
      <div className="sb-section">
        {!collapsed && (
          <div className="sb-sec-head">
            <button
              className={`sb-sec-title${activePage === 'projects' ? ' active' : ''}`}
              onClick={() => { setActiveProject(null); setActivePage('projects') }}
            >
              Projects
            </button>
            <button className="sb-add" onClick={newProject} title="New project — pick or create a folder"><Plus size={16} /></button>
          </div>
        )}

        {collapsed ? (
          projects.length === 0
            ? tip('Projects',
                <div
                  className={`sb-nav-item${activePage === 'projects' ? ' active' : ''}`}
                  onClick={() => { setActiveProject(null); setActivePage('projects') }}
                >
                  <FolderGit2 size={16} />
                </div>
              )
            : projects.map((p) => (
                <ProjectHover
                  key={p.workspace}
                  project={p}
                  className={`sb-nav-item${activePage === 'projects' ? ' active' : ''}`}
                  onClick={() => { setActiveProject(p.workspace); setActivePage('projects') }}
                  onNew={() => openNew(p.workspace)}
                  onOpenSandbox={(id) => { setActiveSandboxId(id); setActivePage('sandbox') }}
                >
                  <ProjectAvatar workspace={p.workspace} size={26} editable={false} />
                </ProjectHover>
              ))
        ) : (
          projects.length === 0
            ? <div className="sb-empty">No projects</div>
            : projects.map((p) => (
              <div className="sb-proj" key={p.workspace}>
                <ProjectAvatar workspace={p.workspace} size={22} />
                <ProjectHover
                  project={p}
                  className="sb-proj-label"
                  onClick={() => { setActiveProject(p.workspace); setActivePage('projects') }}
                  onNew={() => openNew(p.workspace)}
                  onOpenSandbox={(id) => { setActiveSandboxId(id); setActivePage('sandbox') }}
                >
                  <span className="sb-proj-name">{p.workspace.split('/').pop() || p.workspace}</span>
                  <span className="sb-proj-count">{p.list.length}</span>
                </ProjectHover>
                <button className="sb-proj-add" title="New sandbox in this project" onClick={() => openNew(p.workspace)}>
                  <Plus size={13} />
                </button>
              </div>
            ))
        )}
      </div>

      <div className="sb-div" />

      {/* Library — collapsible (collapsed by default), styled like Projects */}
      <div className="sb-section">
        {!collapsed && (
          <div className="sb-sec-head">
            <button
              className="sb-sec-title"
              onClick={() => setLibOpen((o) => { const n = !o; localStorage.setItem('minipit:libraryOpen', n ? '1' : '0'); return n })}
            >
              Library
            </button>
            <button
              className="sb-add"
              title={libOpen ? 'Collapse' : 'Expand'}
              onClick={() => setLibOpen((o) => { const n = !o; localStorage.setItem('minipit:libraryOpen', n ? '1' : '0'); return n })}
            >
              {libOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
          </div>
        )}
        {(collapsed || libOpen) && (
          <>
            {navItem('templates', 'Templates', <LayoutGrid size={16} />)}
            {navItem('mixins', 'Mixin Kits', <Layers size={16} />)}
            {navItem('kits', 'Sandbox Kits', <Package size={16} />)}
          </>
        )}
      </div>

      <div className="sb-div" />

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
      </div>
    </aside>
    </Tooltip.Provider>
  )
}
