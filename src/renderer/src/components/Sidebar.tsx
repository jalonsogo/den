import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  Plus, ListFilter, X, MoreVertical, ChevronRight, ChevronDown, FolderPlus,
  FolderGit2, LayoutGrid, Layers, Package, Settings, Search, GitBranch,
  ArrowUp, ArrowDown, AlertTriangle
} from 'lucide-react'
import { useStore, unackedBlockCount, projectDisplayName } from '../store'
import { SandboxAvatar } from './SandboxAvatar'
import { formatUptime } from '../lib/utils'
import { AGENTS, type Sandbox, type PageType, type AgentType } from '../types'


function SandboxItem({ sandbox, active, collapsed }: { sandbox: Sandbox; active: boolean; collapsed: boolean }) {
  const { setActiveSandboxId, setContextMenu } = useStore()
  const isRunning = sandbox.status === 'running'
  const isDeleting = sandbox.status === 'deleting'
  const isCreating = sandbox.status === 'creating'
  const folder = sandbox.workspace.split('/').pop() || sandbox.workspace
  const hasBlocks = useStore((s) => unackedBlockCount(s.policyBlocks, s.blocksSeenAt, sandbox.name) > 0)
  const activity = useStore((s) => s.agentActivity[sandbox.name] ?? null)
  const justCreated = useStore((s) => s.highlightSandbox === sandbox.name)
  const showSub = useStore((s) => s.display.sandboxSub)
  const subLineMode = useStore((s) => s.display.subLineMode)
  const showChanges = useStore((s) => s.display.changeBadge)
  const changes = useStore((s) => s.sandboxChanges[sandbox.name] ?? 0)
  const agentLabel = AGENTS.find((a) => a.id === sandbox.agent)?.label ?? sandbox.agent

  // Collapsed-rail hover flyout: surfaces name/project/status/duration that are
  // otherwise hidden when the sidebar is a thin icon rail.
  const [hover, setHover] = useState(false)
  const [hoverPos, setHoverPos] = useState({ top: 0, left: 0 })
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>()
  const showHover = (e: React.MouseEvent) => {
    if (!collapsed) return
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setHoverPos({ top: r.top, left: r.right + 8 })
    setHover(true)
  }
  const hideHover = () => { hoverTimer.current = setTimeout(() => setHover(false), 120) }

  const statusLabel = isCreating ? 'Creating…' : isDeleting ? 'Deleting…'
    : isRunning ? (activity === 'working' ? 'Working…' : activity === 'waiting' ? 'Waiting for you' : 'Running')
    : 'Stopped'

  const openMenu = (e: React.MouseEvent, anchor: 'cursor' | 'button') => {
    e.preventDefault()
    e.stopPropagation()
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setHover(false)
    if (isDeleting || isCreating) return
    if (anchor === 'button') {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setContextMenu({ visible: true, x: r.right - 200, y: r.bottom + 4, sandboxId: sandbox.id, workspace: null })
    } else {
      setContextMenu({ visible: true, x: e.clientX, y: e.clientY, sandboxId: sandbox.id, workspace: null })
    }
  }

  return (
    <div
      className={`sb-item${active ? ' active' : ''}${isRunning ? '' : ' is-stopped'}${isDeleting || isCreating ? ' is-deleting' : ''}${justCreated ? ' just-created' : ''}`}
      onClick={() => !isDeleting && !isCreating && setActiveSandboxId(sandbox.id)}
      onContextMenu={(e) => openMenu(e, 'cursor')}
      onMouseEnter={showHover}
      onMouseLeave={hideHover}
    >
      <SandboxAvatar sandbox={sandbox} deleting={isDeleting} alert={hasBlocks} activity={isRunning ? activity : null} />

      {collapsed && hover && createPortal(
        <div
          className="sb-item-pop"
          style={{ top: hoverPos.top, left: hoverPos.left }}
          onMouseEnter={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }}
          onMouseLeave={hideHover}
        >
          <div className="sb-item-pop-hd">
            <span className="sb-item-pop-name">{sandbox.name}</span>
            <span className="sb-item-pop-status" data-on={isRunning}>{statusLabel}</span>
          </div>
          <div className="sb-item-pop-sep" />
          <div className="sb-item-pop-row"><FolderGit2 size={12} /> {folder}</div>
          <div className="sb-item-pop-row">{agentLabel}</div>
          {sandbox.branch && <div className="sb-item-pop-row"><GitBranch size={12} /> {sandbox.branch}</div>}
          {showChanges && isRunning && changes > 0 && (
            <div className="sb-item-pop-row">{changes} uncommitted change{changes > 1 ? 's' : ''}</div>
          )}
          {isRunning && sandbox.uptimeSeconds != null && (
            <>
              <div className="sb-item-pop-sep" />
              <div className="sb-item-pop-row">Up {formatUptime(sandbox.uptimeSeconds)}</div>
            </>
          )}
        </div>,
        document.body
      )}

      {!collapsed && (
        <>
          <div className="sb-item-body">
            <div className="sb-item-name">{sandbox.name}</div>
            {showSub && (
              <div className={`sb-item-sub${isRunning && activity === 'working' ? ' is-working' : ''}`}>
                {isCreating
                  ? 'Creating…'
                  : isDeleting
                  ? 'Deleting…'
                  : subLineMode === 'project'
                    ? folder
                    : !isRunning
                      ? 'Stopped'
                      : activity === 'working'
                        ? 'Working…'
                        : activity === 'waiting'
                          ? 'Waiting for you'
                          : 'Running'}
              </div>
            )}
          </div>

          {showChanges && isRunning && changes > 0 && (
            <span className="sb-item-changes" title={`${changes} uncommitted change${changes > 1 ? 's' : ''}`}>
              <GitBranch size={10} />{changes}
            </span>
          )}
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
    sandboxes, activeSandboxId, activePage, setModal, setActivePage,
    setNewSandboxWorkspace, setActiveProject, sidebarCollapsed,
    addProject, toggleSidebar, setContextMenu, projectNames, display, sandboxIsolation
  } = useStore()
  const openProjectMenu = (e: React.MouseEvent, workspace: string) => {
    e.preventDefault(); e.stopPropagation()
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, sandboxId: null, workspace })
  }
  const collapsed = sidebarCollapsed

  // Clicking blank sidebar space (not a row, button, header, input, or the
  // resize handle) toggles the whole sidebar collapsed/expanded.
  const onEmptyClick = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement
    if (el.closest('button, a, input, label, .sb-item, .sb-nav-item, .sb-proj, .sb-sec-head, .sb-group-hd, .sb-resize')) return
    toggleSidebar()
  }

  // Drag-to-resize the sidebar width (expanded only), persisted.
  const asideRef = useRef<HTMLElement>(null)
  const [sbWidth, setSbWidth] = useState(() => {
    const v = Number(localStorage.getItem('minipit:sidebarWidth'))
    return v >= 180 && v <= 480 ? v : 216
  })
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const left = asideRef.current?.getBoundingClientRect().left ?? 0
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    let latest = sbWidth
    const onMove = (ev: MouseEvent) => {
      latest = Math.min(480, Math.max(180, ev.clientX - left))
      setSbWidth(latest)
    }
    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem('minipit:sidebarWidth', String(Math.round(latest)))
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  const [filter, setFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [groupBy, setGroupBy] = useState<'none' | 'project' | 'agent'>(
    () => (localStorage.getItem('minipit:sbxGroupBy') as 'none' | 'project' | 'agent') ?? 'project'
  )
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'stopped'>(
    () => (localStorage.getItem('minipit:sbxStatus') as 'all' | 'active' | 'stopped') ?? 'all'
  )
  // Selected agents to filter by; empty = all agents.
  const [agentFilter, setAgentFilter] = useState<AgentType[]>(() => {
    try { return JSON.parse(localStorage.getItem('minipit:sbxAgents') ?? '[]') } catch { return [] }
  })
  // Sort order for the sandbox list. 'none' keeps the runtime's own ordering.
  const [sortBy, setSortBy] = useState<'none' | 'name' | 'status' | 'project'>(
    () => (localStorage.getItem('minipit:sbxSortBy') as 'none' | 'name' | 'status' | 'project') ?? 'none'
  )
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    () => (localStorage.getItem('minipit:sbxSortDir') as 'asc' | 'desc') ?? 'asc'
  )
  const [agentMenuOpen, setAgentMenuOpen] = useState(false)
  // Fixed-position coords for the dropdown so it escapes the sidebar's overflow.
  const [filterPos, setFilterPos] = useState<{ top: number; left: number } | null>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const [libOpen, setLibOpen] = useState(() => localStorage.getItem('minipit:libraryOpen') === '1')
  const [sbxOpen, setSbxOpen] = useState(() => localStorage.getItem('minipit:sandboxesOpen') !== '0')
  const toggleLib = () =>
    setLibOpen((o) => { const n = !o; localStorage.setItem('minipit:libraryOpen', n ? '1' : '0'); return n })
  const toggleSbx = () =>
    setSbxOpen((o) => { const n = !o; localStorage.setItem('minipit:sandboxesOpen', n ? '1' : '0'); return n })

  const setGrouping = (g: 'none' | 'project' | 'agent') => {
    setGroupBy(g)
    localStorage.setItem('minipit:sbxGroupBy', g)
  }
  const setAgents = (a: AgentType[]) => {
    setAgentFilter(a)
    localStorage.setItem('minipit:sbxAgents', JSON.stringify(a))
  }
  const toggleAgent = (id: AgentType) =>
    setAgents(agentFilter.includes(id) ? agentFilter.filter((x) => x !== id) : [...agentFilter, id])
  const setStatus = (s: 'all' | 'active' | 'stopped') => {
    setStatusFilter(s)
    localStorage.setItem('minipit:sbxStatus', s)
  }
  // Click a sort field: select it (ascending) when inactive, otherwise cycle
  // its direction asc → desc → off, so a third click clears the sort.
  const setSort = (field: 'name' | 'status' | 'project') => {
    let nextBy: 'none' | 'name' | 'status' | 'project' = field
    let nextDir: 'asc' | 'desc' = 'asc'
    if (sortBy === field) {
      if (sortDir === 'asc') { nextBy = field; nextDir = 'desc' }
      else { nextBy = 'none'; nextDir = 'asc' }
    }
    setSortBy(nextBy); localStorage.setItem('minipit:sbxSortBy', nextBy)
    setSortDir(nextDir); localStorage.setItem('minipit:sbxSortDir', nextDir)
  }
  const clearFilters = () => {
    setFilter(''); setGrouping('none'); setAgents([]); setStatus('all'); setAgentMenuOpen(false)
    setSortBy('none'); localStorage.setItem('minipit:sbxSortBy', 'none')
    setSortDir('asc'); localStorage.setItem('minipit:sbxSortDir', 'asc')
  }
  const hasFilter = !!filter || groupBy !== 'none' || agentFilter.length > 0 || statusFilter !== 'all' || sortBy !== 'none'

  // Agents that actually appear in the current sandboxes — the only ones worth
  // offering as a filter.
  const presentAgents = AGENTS.filter((a) => sandboxes.some((s) => s.agent === a.id))
  const agentBtnLabel = agentFilter.length === 0
    ? 'All agents'
    : agentFilter.length === 1
      ? (AGENTS.find((a) => a.id === agentFilter[0])?.label ?? agentFilter[0])
      : `${agentFilter.length} agents`

  // Filter by selected agents, then by the free-text query (name/agent/status).
  const q = filter.trim().toLowerCase()
  const filtered = sandboxes.filter((s) =>
    (statusFilter === 'all' || (statusFilter === 'active' ? s.status === 'running' : s.status !== 'running')) &&
    (agentFilter.length === 0 || agentFilter.includes(s.agent)) &&
    (!q ||
      s.name.toLowerCase().includes(q) ||
      s.agent.toLowerCase().includes(q) ||
      s.status.toLowerCase().includes(q))
  )

  // Optional explicit ordering. 'none' preserves the runtime's own order.
  const sorted = (() => {
    if (sortBy === 'none') return filtered
    const key = (s: Sandbox) =>
      sortBy === 'name' ? s.name
        : sortBy === 'status' ? s.status
          : projectDisplayName(projectNames, s.workspace)
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const r = key(a).localeCompare(key(b), undefined, { sensitivity: 'base', numeric: true })
      // Stable tie-break by name so equal keys keep a predictable order.
      return (r || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })) * dir
    })
  })()

  // Optional grouping for the sandbox list (by project folder or by agent).
  const grouped: [string, Sandbox[]][] | null = (() => {
    if (groupBy === 'none') return null
    const map = new Map<string, Sandbox[]>()
    for (const s of sorted) {
      const key = groupBy === 'project' ? projectDisplayName(projectNames, s.workspace) : s.agent
      const list = map.get(key) ?? []
      list.push(s)
      map.set(key, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  })()

  // Close the filter dropdown on outside click.
  useEffect(() => {
    if (!filterOpen) return
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [filterOpen])

  // Refresh uncommitted-change counts when the running set changes, then on a
  // slow poll. The poll matters because commits/edits made in the terminal emit
  // no file-change hook, so without it the badge would stay stale until a file
  // changed or a sandbox stopped/started.
  const refreshSandboxChanges = useStore((s) => s.refreshSandboxChanges)
  const runningKeys = sandboxes.filter((s) => s.status === 'running').map((s) => s.name).join('|')
  useEffect(() => {
    const refresh = () =>
      sandboxes.filter((s) => s.status === 'running').forEach((s) => refreshSandboxChanges(s.name, s.workspace))
    refresh()
    const id = setInterval(refresh, 15000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningKeys])

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
    <aside
      ref={asideRef}
      className={`sidebar${collapsed ? ' collapsed' : ''}`}
      style={collapsed ? undefined : { width: sbWidth }}
      onClick={onEmptyClick}
    >
      {/* Sandboxes — the landing view (Home dashboard); inline filter, add
          sandbox, add project. Grouped by project with per-project headers. */}
      <div className="sb-section sb-section-grow sb-section-first">
        {collapsed ? (
          tip('New Sandbox', <button className="sb-add sb-add-collapsed" onClick={() => openNew()}><Plus size={16} /></button>)
        ) : (
          <>
            <div className="sb-sec-head">
              <button
                className="sb-sec-chev"
                title={sbxOpen ? 'Collapse' : 'Expand'}
                aria-expanded={sbxOpen}
                onClick={toggleSbx}
              >
                {sbxOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              <button
                className={`sb-sec-title${activePage === 'sandboxes' || activePage === 'sandbox' ? ' active' : ''}`}
                onClick={() => setActivePage('sandboxes')}
              >
                Sandboxes
              </button>
              <div className="sb-filter-wrap" ref={filterRef}>
                <button
                  className={`sb-add${hasFilter ? ' has-filter' : ''}`}
                  onClick={(e) => {
                    if (filterOpen) { setFilterOpen(false); return }
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    const W = 208
                    // Right-align to the icon, but clamp so it never runs off either edge.
                    const left = Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8))
                    setFilterPos({ top: r.bottom + 5, left })
                    setAgentMenuOpen(false)
                    setFilterOpen(true)
                  }}
                  title="Filter & group sandboxes"
                >
                  <ListFilter size={15} />
                </button>
                {filterOpen && filterPos && (
                  <div className="sb-filter-pop" style={{ top: filterPos.top, left: filterPos.left }}>
                    <div className="sb-filter-row">
                      <Search size={13} className="sb-filter-row-ic" />
                      <input
                        autoFocus
                        value={filter}
                        placeholder="Filter by name…"
                        onChange={(e) => setFilter(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setFilterOpen(false) }}
                      />
                      {filter && (
                        <button className="sb-filter-row-x" onClick={() => setFilter('')} title="Clear"><X size={13} /></button>
                      )}
                    </div>
                    <div className="sb-filter-grp">
                      <span className="sb-filter-lbl">Status</span>
                      <div className="sb-filter-seg">
                        {(['all', 'active', 'stopped'] as const).map((s) => (
                          <button
                            key={s}
                            className={`sb-filter-seg-btn${statusFilter === s ? ' active' : ''}`}
                            onClick={() => setStatus(s)}
                          >
                            {s === 'all' ? 'All' : s === 'active' ? 'Active' : 'Stopped'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="sb-filter-grp">
                      <span className="sb-filter-lbl">Group by</span>
                      <div className="sb-filter-seg">
                        {(['project', 'agent'] as const).map((g) => (
                          <button
                            key={g}
                            className={`sb-filter-seg-btn${groupBy === g ? ' active' : ''}`}
                            onClick={() => setGrouping(groupBy === g ? 'none' : g)}
                          >
                            {g === 'project' ? 'Project' : 'Agent'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="sb-filter-grp">
                      <span className="sb-filter-lbl">Order by</span>
                      <div className="sb-filter-seg">
                        {([
                          { id: 'name', label: 'Name' },
                          { id: 'status', label: 'Status' },
                          { id: 'project', label: 'Project' },
                        ] as const).map(({ id, label }) => (
                          <button
                            key={id}
                            className={`sb-filter-seg-btn${sortBy === id ? ' active' : ''}`}
                            onClick={() => setSort(id)}
                            title={sortBy === id ? (sortDir === 'asc' ? 'Ascending — click for descending' : 'Descending — click to clear') : `Sort by ${label.toLowerCase()}`}
                          >
                            {label}
                            {sortBy === id && (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {presentAgents.length > 0 && (
                      <div className="sb-filter-grp">
                        <span className="sb-filter-lbl">Agent</span>
                        <div className="sb-filter-select">
                          <button
                            className={`sb-filter-select-btn${agentFilter.length ? ' active' : ''}`}
                            onClick={() => setAgentMenuOpen((o) => !o)}
                          >
                            <span>{agentBtnLabel}</span>
                            <ChevronDown size={13} />
                          </button>
                          {agentMenuOpen && (
                            <div className="sb-filter-menu">
                              {presentAgents.map((a) => (
                                <label key={a.id} className="sb-filter-opt">
                                  <input
                                    type="checkbox"
                                    checked={agentFilter.includes(a.id)}
                                    onChange={() => toggleAgent(a.id)}
                                  />
                                  {a.label}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {hasFilter && (
                      <div className="sb-filter-foot">
                        <button className="sb-filter-clear" onClick={clearFilters} title="Clear filters & grouping">
                          <X size={13} /> Clear filters
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button className="sb-add" onClick={newProject} title="New project — pick or create a folder"><FolderPlus size={16} /></button>
              <button className="sb-add" onClick={() => openNew()} title="New Sandbox"><Plus size={16} /></button>
            </div>
          </>
        )}
        {(collapsed || sbxOpen) && (
        <div className="sb-list">
          {filtered.length === 0 ? (
            !collapsed && <div className="sb-empty">{sandboxes.length === 0 ? 'No sandboxes' : 'No matches'}</div>
          ) : grouped && !collapsed ? (
            grouped.map(([key, list]) => (
              <div className="sb-group" key={key}>
                {/* When grouped by project, the header is a project: name,
                    count, and a hover + to add a sandbox. Right-click opens the
                    project context menu (all sandboxes share one workspace). */}
                <div
                  className="sb-group-hd"
                  onContextMenu={groupBy === 'project' ? (e) => openProjectMenu(e, list[0].workspace) : undefined}
                >
                  <span className="sb-group-name">{key}</span>
                  {display.projectCounts && <span className="sb-group-count">{list.length}</span>}
                  {groupBy === 'project' && list.filter((s) => sandboxIsolation[s.name] === false).length >= 2 && (
                    <span
                      className="sb-group-warn"
                      title="Multiple sandboxes mount this folder directly — their edits can collide. Use clone isolation for new ones."
                    >
                      <AlertTriangle size={12} />
                    </span>
                  )}
                  {groupBy === 'project' && (
                    <button
                      className="sb-group-add"
                      title="New sandbox in this project"
                      onClick={() => openNew(list[0].workspace)}
                    >
                      <Plus size={13} />
                    </button>
                  )}
                </div>
                {list.map((s) => (
                  <SandboxItem key={s.id} sandbox={s} active={activeSandboxId === s.id && activePage === 'sandbox'} collapsed={collapsed} />
                ))}
              </div>
            ))
          ) : (
            // Collapsed rail can't show group headers, but keep the grouped
            // ordering so the sequence matches the expanded view.
            (grouped ? grouped.flatMap(([, l]) => l) : sorted).map((s) => (
              <SandboxItem key={s.id} sandbox={s} active={activeSandboxId === s.id && activePage === 'sandbox'} collapsed={collapsed} />
            ))
          )}
        </div>
        )}
      </div>

      <div className="sb-div" />

      {/* Library — collapsible (collapsed by default), styled like Projects */}
      <div className="sb-section">
        {!collapsed && (
          <div className="sb-sec-head">
            <button
              className="sb-sec-chev"
              title={libOpen ? 'Collapse' : 'Expand'}
              aria-expanded={libOpen}
              onClick={toggleLib}
            >
              {libOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            <button className="sb-sec-title" onClick={toggleLib}>Library</button>
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

      {!collapsed && <div className="sb-resize" onMouseDown={startResize} title="Drag to resize" />}
    </aside>
    </Tooltip.Provider>
  )
}
