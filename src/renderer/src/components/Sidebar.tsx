import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  Plus, ListFilter, X, MoreVertical, ChevronRight, ChevronDown, FolderPlus,
  FolderGit2, LayoutGrid, Layers, Package, Settings, Search, GitBranch,
  ArrowUp, ArrowDown, Plug
} from 'lucide-react'
import { useStore, unackedBlockCount } from '../store'
import { SandboxAvatar } from './SandboxAvatar'
import { formatUptime } from '../lib/utils'
import { AGENTS, type Sandbox, type PageType, type AgentType, type Group } from '../types'


function SandboxItem({ sandbox, active, collapsed, onReorder }: { sandbox: Sandbox; active: boolean; collapsed: boolean; onReorder?: (dragName: string, beforeName: string) => void }) {
  const { setActiveSandboxId, setContextMenu } = useStore()
  const isRunning = sandbox.status === 'running'
  const isDeleting = sandbox.status === 'deleting'
  const isCreating = sandbox.status === 'creating'
  const folder = sandbox.workspace.split('/').pop() || sandbox.workspace
  const hasBlocks = useStore((s) => unackedBlockCount(s.policyBlocks, s.blocksSeenAt, sandbox.name) > 0)
  const activity = useStore((s) => s.agentActivity[sandbox.name] ?? null)
  const justCreated = useStore((s) => s.highlightSandbox === sandbox.name)
  const showSub = useStore((s) => s.display.sandboxSub)
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
      setContextMenu({ visible: true, x: r.right - 200, y: r.bottom + 4, sandboxId: sandbox.id, workspace: null, groupId: null })
    } else {
      setContextMenu({ visible: true, x: e.clientX, y: e.clientY, sandboxId: sandbox.id, workspace: null, groupId: null })
    }
  }

  return (
    <div
      className={`sb-item${active ? ' active' : ''}${isRunning ? '' : ' is-stopped'}${isDeleting || isCreating ? ' is-deleting' : ''}${justCreated ? ' just-created' : ''}`}
      draggable={!collapsed && !isDeleting && !isCreating}
      onDragStart={(e) => { e.dataTransfer.setData('text/den-sandbox', sandbox.name); e.dataTransfer.effectAllowed = 'move' }}
      // Shift+drag onto a row = reorder (place before it); plain drag falls
      // through to the group section = move to that group.
      onDragOver={onReorder ? (e) => { if (e.shiftKey) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move' } } : undefined}
      onDrop={onReorder ? (e) => {
        if (!e.shiftKey) return
        e.preventDefault(); e.stopPropagation()
        const n = e.dataTransfer.getData('text/den-sandbox')
        if (n && n !== sandbox.name) onReorder(n, sandbox.name)
      } : undefined}
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
    setNewSandboxWorkspace, sidebarCollapsed,
    toggleSidebar, setContextMenu, groups, sandboxGroups, setSandboxGroup, createGroup, openPrompt,
    sandboxOrder, reorderGroups, reorderSandbox
  } = useStore()
  const newGroup = () => openPrompt({
    title: 'New group', label: 'Group name', placeholder: 'e.g. Feature work',
    confirmText: 'Create', onSubmit: (v) => { if (v.trim()) createGroup(v) }
  })
  // Which group section a dragged sandbox is hovering (for the drop highlight).
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  // When reordering a group, show an insertion line in the gap above/below the
  // hovered group rather than illuminating the whole group section.
  const [groupDrop, setGroupDrop] = useState<{ id: string; after: boolean } | null>(null)
  const openGroupMenu = (e: React.MouseEvent, groupId: string) => {
    e.preventDefault(); e.stopPropagation()
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, sandboxId: null, workspace: null, groupId })
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
  // Whether to show group sections (vs one flat list). Default on.
  const [showGroups, setShowGroups] = useState<boolean>(() => localStorage.getItem('minipit:showGroups') !== '0')
  const toggleShowGroups = () =>
    setShowGroups((v) => { const n = !v; localStorage.setItem('minipit:showGroups', n ? '1' : '0'); return n })
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'stopped'>(
    () => (localStorage.getItem('minipit:sbxStatus') as 'all' | 'active' | 'stopped') ?? 'all'
  )
  // Selected agents to filter by; empty = all agents.
  const [agentFilter, setAgentFilter] = useState<AgentType[]>(() => {
    try { return JSON.parse(localStorage.getItem('minipit:sbxAgents') ?? '[]') } catch { return [] }
  })
  // Sort order for the sandbox list. 'manual' uses the user's drag arrangement.
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'manual'>(() => {
    const v = localStorage.getItem('minipit:sbxSortBy')
    return v === 'name' || v === 'status' ? v : 'manual'
  })
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
  // Order-by: clicking Manual selects it; clicking Name/Status cycles asc → desc
  // → back to Manual (the default arrangement).
  const applySort = (by: 'name' | 'status' | 'manual', dir: 'asc' | 'desc') => {
    setSortBy(by); localStorage.setItem('minipit:sbxSortBy', by)
    setSortDir(dir); localStorage.setItem('minipit:sbxSortDir', dir)
  }
  const setSort = (field: 'name' | 'status' | 'manual') => {
    if (field === 'manual') return applySort('manual', 'asc')
    if (sortBy === field) return applySort(sortDir === 'asc' ? field : 'manual', sortDir === 'asc' ? 'desc' : 'asc')
    applySort(field, 'asc')
  }
  const clearFilters = () => {
    setFilter(''); setAgents([]); setStatus('all'); setAgentMenuOpen(false)
    if (!showGroups) toggleShowGroups()
    applySort('manual', 'asc')
  }
  const hasFilter = !!filter || !showGroups || agentFilter.length > 0 || statusFilter !== 'all' || sortBy !== 'manual'

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

  // Ordering. 'manual' uses the user's drag arrangement (sandboxOrder); names not
  // in it keep the runtime order (stable). Name/Status sort alphabetically.
  const sorted = (() => {
    if (sortBy === 'manual') {
      const pos = new Map(sandboxOrder.map((n, i) => [n, i]))
      return [...filtered].sort((a, b) => (pos.get(a.name) ?? Infinity) - (pos.get(b.name) ?? Infinity))
    }
    const key = (s: Sandbox) => (sortBy === 'name' ? s.name : s.status)
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const r = key(a).localeCompare(key(b), undefined, { sensitivity: 'base', numeric: true })
      return (r || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })) * dir
    })
  })()

  // Grouping. When on: a section per named group (in the groups' own manual
  // order), then ungrouped sandboxes. When off: one flat list. `group` is set
  // only for real named groups (drives the header menu + reordering).
  const grouped: { key: string; group: Group | null; list: Sandbox[] }[] | null = (() => {
    if (!showGroups) return null
    const byId = new Map(groups.map((g) => [g.id, g]))
    const ungrouped: Sandbox[] = []
    const byGroup = new Map<string, Sandbox[]>()
    for (const s of sorted) {
      const gid = sandboxGroups[s.name]
      if (gid && byId.has(gid)) { if (!byGroup.has(gid)) byGroup.set(gid, []); byGroup.get(gid)!.push(s) }
      else ungrouped.push(s)
    }
    const sections: { key: string; group: Group | null; list: Sandbox[] }[] = []
    for (const g of groups) {
      const list = byGroup.get(g.id)
      if (list?.length) sections.push({ key: g.id, group: g, list })
    }
    // Ungrouped sandboxes render flat, after the named groups.
    if (ungrouped.length) sections.push({ key: '__ungrouped', group: null, list: ungrouped })
    return sections
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
                      <span className="sb-filter-lbl">Groups</span>
                      <div className="sb-filter-seg">
                        <button
                          className={`sb-filter-seg-btn${showGroups ? ' active' : ''}`}
                          onClick={() => { if (!showGroups) toggleShowGroups() }}
                        >Show</button>
                        <button
                          className={`sb-filter-seg-btn${!showGroups ? ' active' : ''}`}
                          onClick={() => { if (showGroups) toggleShowGroups() }}
                        >Hide</button>
                      </div>
                    </div>

                    <div className="sb-filter-grp">
                      <span className="sb-filter-lbl">Order by</span>
                      <div className="sb-filter-seg">
                        {([
                          { id: 'manual', label: 'Manual' },
                          { id: 'name', label: 'Name' },
                          { id: 'status', label: 'Status' },
                        ] as const).map(({ id, label }) => (
                          <button
                            key={id}
                            className={`sb-filter-seg-btn${sortBy === id ? ' active' : ''}`}
                            onClick={() => setSort(id)}
                            title={id === 'manual' ? 'Your drag arrangement — shift-drag a sandbox to reorder' : sortBy === id ? (sortDir === 'asc' ? 'Ascending — click for descending' : 'Descending — click to clear') : `Sort by ${label.toLowerCase()}`}
                          >
                            {label}
                            {sortBy === id && id !== 'manual' && (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
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
              <button className="sb-add" onClick={newGroup} title="New group"><FolderPlus size={16} /></button>
              <button className="sb-add" onClick={() => openNew()} title="New Sandbox"><Plus size={16} /></button>
            </div>
          </>
        )}
        {(collapsed || sbxOpen) && (
        <div className="sb-list">
          {filtered.length === 0 ? (
            !collapsed && <div className="sb-empty">{sandboxes.length === 0 ? 'No sandboxes' : 'No matches'}</div>
          ) : grouped && !collapsed ? (
            grouped.map((sec) => (
              <div
                className={`sb-group${dragOverKey === sec.key ? ' drag-over' : ''}${groupDrop?.id === sec.key ? (groupDrop.after ? ' drop-after' : ' drop-before') : ''}`}
                key={sec.key}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (e.dataTransfer.types.includes('text/den-group')) {
                    // Group reorder: mark an insertion gap above/below, don't
                    // illuminate the whole group section.
                    const rect = e.currentTarget.getBoundingClientRect()
                    const after = e.clientY > rect.top + rect.height / 2
                    if (groupDrop?.id !== sec.key || groupDrop.after !== after) setGroupDrop({ id: sec.key, after })
                    if (dragOverKey) setDragOverKey(null)
                  } else if (dragOverKey !== sec.key) {
                    // Sandbox move: highlight the target group.
                    setDragOverKey(sec.key)
                  }
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return
                  setDragOverKey((k) => (k === sec.key ? null : k))
                  setGroupDrop((g) => (g?.id === sec.key ? null : g))
                }}
                onDrop={(e) => {
                  e.preventDefault(); setDragOverKey(null); setGroupDrop(null)
                  const gid = e.dataTransfer.getData('text/den-group')
                  if (gid) {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const after = e.clientY > rect.top + rect.height / 2
                    const named = grouped!.filter((g) => g.group).map((g) => g.group!.id)
                    // Dropping on the ungrouped area = move to the end.
                    const beforeId = !sec.group ? null : after ? (named[named.indexOf(sec.group.id) + 1] ?? null) : sec.group.id
                    if (gid !== beforeId) reorderGroups(gid, beforeId)
                    return
                  }
                  const n = e.dataTransfer.getData('text/den-sandbox')
                  // Drop on a named group assigns; drop on the ungrouped area removes.
                  if (n) setSandboxGroup(n, sec.group ? sec.group.id : null)
                }}
              >
                {/* Named groups get a header + actions menu; agent sections a
                    plain header. The ungrouped section gets an "Ungrouped" header
                    only when there are named groups to distinguish it from. */}
                {sec.key === '__ungrouped'
                  ? (grouped!.some((g) => g.group) && (
                      <div className="sb-group-hd"><span className="sb-group-name">Ungrouped</span></div>
                    ))
                  : (
                    <div
                      className={`sb-group-hd${sec.group ? ' is-group' : ''}`}
                      draggable={!!sec.group}
                      onContextMenu={sec.group ? (e) => openGroupMenu(e, sec.group!.id) : undefined}
                      onDragStart={sec.group ? (e) => { e.dataTransfer.setData('text/den-group', sec.group!.id); e.dataTransfer.effectAllowed = 'move' } : undefined}
                    >
                      <span className="sb-group-name">{sec.group ? sec.group.name : sec.key}</span>
                      {sec.group && (
                        <button className="sb-group-add" title="Group actions" onClick={(e) => openGroupMenu(e, sec.group!.id)}>
                          <MoreVertical size={13} />
                        </button>
                      )}
                    </div>
                  )}
                {sec.list.map((s) => (
                  <SandboxItem key={s.id} sandbox={s} active={activeSandboxId === s.id && activePage === 'sandbox'} collapsed={collapsed} onReorder={(d, b) => { reorderSandbox(d, b); setSort('manual') }} />
                ))}
              </div>
            ))
          ) : (
            // Collapsed rail can't show group headers, but keep the grouped
            // ordering so the sequence matches the expanded view.
            (grouped ? grouped.flatMap((sec) => sec.list) : sorted).map((s) => (
              <SandboxItem key={s.id} sandbox={s} active={activeSandboxId === s.id && activePage === 'sandbox'} collapsed={collapsed} onReorder={collapsed ? undefined : (d, b) => { reorderSandbox(d, b); setSort('manual') }} />
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
        {collapsed ? (
          tip('sbx · connected', <span className="sb-foot-icon"><Plug size={14} className="sb-foot-plug" /></span>)
        ) : (
          <span className="sb-foot-text">
            <Plug size={12} className="sb-foot-plug" />
            sbx · connected
          </span>
        )}
      </div>

      {!collapsed && <div className="sb-resize" onMouseDown={startResize} title="Drag to resize" />}
    </aside>
    </Tooltip.Provider>
  )
}
