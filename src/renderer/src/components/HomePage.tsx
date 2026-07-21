import { useEffect, useRef, useState } from 'react'
import { Plus, ArrowUp, X, HardDrive, ShieldAlert, Zap, ShieldCheck, Boxes, Terminal, MoreVertical, GitBranch, GitCommitHorizontal, Search, ChevronDown } from 'lucide-react'
import { useStore, unackedBlockCount } from '../store'
import { AGENTS, type SbxRelease, type StorageUsage, type Sandbox, type AgentType } from '../types'
import { SandboxAvatar } from './SandboxAvatar'
import { formatUptime, formatBytes } from '../lib/utils'
import brandLight from '../assets/brand-light.svg'
import brandDark from '../assets/brand-dark.svg'

function baseSemver(v?: string | null): number[] | null {
  const m = v?.match(/(\d+)\.(\d+)\.(\d+)/)
  return m ? [+m[1], +m[2], +m[3]] : null
}
function isOlder(a: number[] | null, b: number[] | null): boolean {
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0)
  return false
}


export function HomePage() {
  const { sandboxes, setModal, setActiveSandboxId, setActivePage, setContextMenu } = useStore()
  const policyBlocks = useStore((s) => s.policyBlocks)
  const blocksSeenAt = useStore((s) => s.blocksSeenAt)
  const agentActivity = useStore((s) => s.agentActivity)
  const sandboxChanges = useStore((s) => s.sandboxChanges)
  const sandboxIsolation = useStore((s) => s.sandboxIsolation)
  const groups = useStore((s) => s.groups)
  const sandboxGroups = useStore((s) => s.sandboxGroups)

  // Open the shared context menu for a row — from the ⋮ button (anchored under
  // it) or a right-click (at the cursor). Mirrors the sidebar's row menu.
  const openMenu = (e: React.MouseEvent, s: Sandbox, anchor: 'button' | 'cursor') => {
    e.preventDefault()
    e.stopPropagation()
    if (anchor === 'button') {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setContextMenu({ visible: true, x: r.right - 200, y: r.bottom + 4, sandboxId: s.id, workspace: null, groupId: null })
    } else {
      setContextMenu({ visible: true, x: e.clientX, y: e.clientY, sandboxId: s.id, workspace: null, groupId: null })
    }
  }
  const theme = useStore((s) => s.theme)
  const brandMark = theme === 'dark' ? brandDark : brandLight
  const running = sandboxes.filter((s) => s.status === 'running')
  const stopped = sandboxes.filter((s) => s.status !== 'running')

  // Sandboxes with recent network-policy denials → dashboard attention row.
  const blocked = sandboxes.filter((s) => (policyBlocks[s.name] ?? []).length > 0)
  const hasUnacked = (name: string) => unackedBlockCount(policyBlocks, blocksSeenAt, name) > 0

  // ── Always-visible filter bar (mirrors the sidebar's filter popover) ──
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'stopped'>(
    () => (localStorage.getItem('minipit:homeStatus') as 'all' | 'active' | 'stopped') ?? 'all')
  const [sortBy, setSortBy] = useState<'status' | 'name'>(
    () => (localStorage.getItem('minipit:homeSort') as 'status' | 'name') ?? 'status')
  const [showGroups, setShowGroups] = useState<boolean>(() => localStorage.getItem('minipit:homeGroups') !== '0')
  const [agentFilter, setAgentFilter] = useState<AgentType[]>(() => {
    try { return JSON.parse(localStorage.getItem('minipit:homeAgents') || '[]') } catch { return [] }
  })
  const [agentMenuOpen, setAgentMenuOpen] = useState(false)
  const agentMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!agentMenuOpen) return
    const onDown = (e: MouseEvent) => { if (agentMenuRef.current && !agentMenuRef.current.contains(e.target as Node)) setAgentMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [agentMenuOpen])

  const setStatus = (s: 'all' | 'active' | 'stopped') => { setStatusFilter(s); localStorage.setItem('minipit:homeStatus', s) }
  const setSort = (s: 'status' | 'name') => { setSortBy(s); localStorage.setItem('minipit:homeSort', s) }
  const setGroups = (v: boolean) => { setShowGroups(v); localStorage.setItem('minipit:homeGroups', v ? '1' : '0') }
  const toggleAgent = (id: AgentType) => setAgentFilter((prev) => {
    const n = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    localStorage.setItem('minipit:homeAgents', JSON.stringify(n))
    return n
  })
  const clearFilters = () => { setQuery(''); setStatus('all'); setSort('status'); setGroups(true); setAgentFilter([]); localStorage.setItem('minipit:homeAgents', '[]') }
  const hasFilter = !!query || statusFilter !== 'all' || sortBy !== 'status' || !showGroups || agentFilter.length > 0

  // Agents that actually exist across the sandboxes → the only ones worth offering.
  const presentAgents = AGENTS.filter((a) => sandboxes.some((s) => s.agent === a.id))
  const agentBtnLabel = agentFilter.length === 0
    ? 'All agents'
    : agentFilter.length === 1
      ? (AGENTS.find((a) => a.id === agentFilter[0])?.label ?? agentFilter[0])
      : `${agentFilter.length} agents`

  // Apply the free-text query (name or agent label), status, and agent filters.
  const q = query.trim().toLowerCase()
  const matches = (s: Sandbox) =>
    (statusFilter === 'all' || (statusFilter === 'active' ? s.status === 'running' : s.status !== 'running')) &&
    (agentFilter.length === 0 || agentFilter.includes(s.agent)) &&
    (!q || s.name.toLowerCase().includes(q) || (AGENTS.find((a) => a.id === s.agent)?.label ?? s.agent).toLowerCase().includes(q))
  const visibleSandboxes = sandboxes.filter(matches)

  // Group the (filtered) sandboxes for the tree view. Sort: "status" keeps
  // running first then alpha; "name" is pure alphabetical.
  const orderList = (list: typeof sandboxes) => [...list].sort((a, b) =>
    sortBy === 'name'
      ? a.name.localeCompare(b.name)
      : (a.status === 'running' ? 0 : 1) - (b.status === 'running' ? 0 : 1) || a.name.localeCompare(b.name))
  const treeSections: { key: string; label: string | null; list: typeof sandboxes }[] = []
  if (!showGroups) {
    // Grouping off → one flat, sorted list.
    if (visibleSandboxes.length) treeSections.push({ key: '__all', label: null, list: orderList(visibleSandboxes) })
  } else {
    const byId = new Map(groups.map((g) => [g.id, g]))
    const ungrouped: typeof sandboxes = []
    const byGroup = new Map<string, typeof sandboxes>()
    for (const s of visibleSandboxes) {
      const gid = sandboxGroups[s.name]
      if (gid && byId.has(gid)) { if (!byGroup.has(gid)) byGroup.set(gid, []); byGroup.get(gid)!.push(s) }
      else ungrouped.push(s)
    }
    for (const g of [...groups].sort((a, b) => a.name.localeCompare(b.name))) {
      const list = byGroup.get(g.id)
      if (list?.length) treeSections.push({ key: g.id, label: g.name, list: orderList(list) })
    }
    // Label the ungrouped section only when there are named groups to distinguish
    // it from (otherwise it's just the whole flat list).
    if (ungrouped.length) treeSections.push({ key: '__ungrouped', label: treeSections.length ? 'Ungrouped' : null, list: orderList(ungrouped) })
  }

  const [version, setVersion] = useState<string | null>(null)
  const [release, setRelease] = useState<SbxRelease | null>(null)
  const [storage, setStorage] = useState<StorageUsage | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(
    () => localStorage.getItem('minipit:updateDismissed')
  )

  useEffect(() => {
    window.minipit?.sbxVersion().then((r) => setVersion(r?.ok ? (r.version ?? null) : null)).catch(() => {})
    window.minipit?.sbxReleases().then((r) => setRelease(r?.find((rel) => !rel.prerelease) ?? r?.[0] ?? null)).catch(() => {})
    window.minipit?.storageUsage().then((r) => setStorage(r ?? null)).catch(() => {})
  }, [])

  // Total disk across sandboxes + templates; null when this sbx build reports no sizes.
  const storageBytes = storage?.ok
    ? [storage.sandboxes.bytes, storage.templates.bytes].reduce<number | null>(
        (acc, b) => (b == null ? acc : (acc ?? 0) + b), null)
    : null
  const storageSub = storage == null
    ? 'Checking…'
    : storageBytes != null
      ? formatBytes(storageBytes)
      : `${storage.sandboxes.count + storage.templates.count} items`
  const fmtBytes = (b: number | null | undefined): string => (b == null ? '—' : formatBytes(b))
  const showBreakdown = !!storage?.ok && (storage.sandboxes.bytes != null || storage.templates.bytes != null)

  const latest = release?.version ?? null
  const updateAvailable = isOlder(baseSemver(version), baseSemver(latest))
  const showUpdateBar = updateAvailable && dismissed !== latest

  const dismissUpdate = () => {
    if (!latest) return
    localStorage.setItem('minipit:updateDismissed', latest)
    setDismissed(latest)
  }

  // Welcome / empty state — no sandboxes yet, so surface hero + two CTAs + feature highlights.
  if (sandboxes.length === 0) {
    return (
      <div className="page">
        <div className="home-empty">
          <img className="home-empty-mark" src={brandMark} alt="den" width={52} height={56} />
          <span className="home-empty-eyebrow">
            <Zap size={11} />
            Ephemeral AI coding environments
          </span>
          <h1 className="home-empty-title">Your sandbox, ready in seconds</h1>
          <p className="home-empty-sub">
            Den spins up isolated Docker containers for AI agents and coding workflows —
            with terminals, file access, and network controls built in.
          </p>
          <div className="home-empty-actions">
            <button className="btn btn-primary" onClick={() => setModal('new-sandbox')}>
              <Plus size={15} />
              Create your first sandbox
            </button>
            <button className="btn btn-default" onClick={() => setActivePage('kits')}>
              <Boxes size={14} />
              Browse kits
            </button>
          </div>
          <div className="home-empty-features">
            <div className="home-empty-feat">
              <Terminal size={14} className="home-empty-feat-ic" />
              <span className="home-empty-feat-title">Full terminal access</span>
              <span className="home-empty-feat-sub">Drop into a shell inside any running sandbox</span>
            </div>
            <div className="home-empty-feat">
              <ShieldCheck size={14} className="home-empty-feat-ic" />
              <span className="home-empty-feat-title">Isolated by default</span>
              <span className="home-empty-feat-sub">Network policy controls what each sandbox can reach</span>
            </div>
            <div className="home-empty-feat">
              <Boxes size={14} className="home-empty-feat-ic" />
              <span className="home-empty-feat-title">Ready-made kits</span>
              <span className="home-empty-feat-sub">Start with pre-configured agents, tools, and MCPs</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {showUpdateBar && (
        <div className="update-bar">
          <ArrowUp size={15} className="update-bar-ic" />
          <span className="update-bar-msg">
            Docker sbx update <strong>{latest}</strong> available
            {version ? <span className="update-bar-cur"> · you're on {version}</span> : null}
          </span>
          <button className="btn btn-primary btn-sm update-bar-cta" onClick={() => setActivePage('settings')}>
            Update
          </button>
          <button className="update-bar-x" onClick={dismissUpdate} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="page-hdr">
        <span className="page-title">Sandboxes</span>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setModal('new-sandbox')}>
          <Plus size={13} />
          New Sandbox
        </button>
      </div>

      <div className="page-body home-dash">
        {blocked.length > 0 && (
          <div className="home-attn">
            <div className="home-attn-hd">
              <ShieldAlert size={14} className="home-attn-ic" />
              Network policy blocks
            </div>
            {blocked.map((s) => {
              const list = policyBlocks[s.name] ?? []
              const hosts = [...new Set(list.map((b) => b.host))]
              return (
                <div key={s.id} className="home-attn-row" onClick={() => setActiveSandboxId(s.id)}>
                  <SandboxAvatar sandbox={s} size={24} alert={hasUnacked(s.name)} />
                  <span className="home-attn-name">{s.name}</span>
                  <span className="home-attn-hosts">
                    {hosts.slice(0, 3).join(', ')}{hosts.length > 3 ? ` +${hosts.length - 3}` : ''}
                  </span>
                  <span className="home-attn-count">{list.length}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Compact overview: the counts read as one line, not three vanity
            cards; projects + disk demote to chips so the list below is the hero. */}
        <div className="home-overview">
          <div className="home-ov-counts">
            <Boxes size={17} className="home-ov-ic" />
            <span className="home-ov-total">{sandboxes.length}</span>
            <span className="home-ov-unit">sandbox{sandboxes.length === 1 ? '' : 'es'}</span>
            <span className="home-ov-pill"><i className="home-ov-dot on" />{running.length} running</span>
            <span className="home-ov-pill"><i className="home-ov-dot" />{stopped.length} stopped</span>
          </div>
          <div className="home-ov-meta">
            <span
              className="home-ov-chip home-ov-chip-static"
              title={showBreakdown ? `Sandboxes ${fmtBytes(storage!.sandboxes.bytes)} · Templates ${fmtBytes(storage!.templates.bytes)}` : undefined}
            >
              <HardDrive size={13} />{storageSub}
            </span>
          </div>
        </div>

        <div className="ss-hdr" style={{ marginTop: 22 }}>Your sandboxes</div>

        {/* Always-visible filter bar — same controls as the sidebar's popover. */}
        <div className="home-filter">
          <div className="home-filter-search">
            <Search size={14} className="home-filter-search-ic" />
            <input
              value={query}
              placeholder="Filter by name…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
            />
            {query && <button className="home-filter-search-x" onClick={() => setQuery('')} title="Clear"><X size={13} /></button>}
          </div>

          <div className="home-filter-seg">
            {(['all', 'active', 'stopped'] as const).map((s) => (
              <button key={s} className={`sb-filter-seg-btn${statusFilter === s ? ' active' : ''}`} onClick={() => setStatus(s)}>
                {s === 'all' ? 'All' : s === 'active' ? 'Active' : 'Stopped'}
              </button>
            ))}
          </div>

          <div className="home-filter-seg" title="Sort order">
            {([{ id: 'status', l: 'Status' }, { id: 'name', l: 'Name' }] as const).map(({ id, l }) => (
              <button key={id} className={`sb-filter-seg-btn${sortBy === id ? ' active' : ''}`} onClick={() => setSort(id)}>{l}</button>
            ))}
          </div>

          <div className="home-filter-seg" title="Group by project">
            <button className={`sb-filter-seg-btn${showGroups ? ' active' : ''}`} onClick={() => setGroups(true)}>Grouped</button>
            <button className={`sb-filter-seg-btn${!showGroups ? ' active' : ''}`} onClick={() => setGroups(false)}>Flat</button>
          </div>

          {presentAgents.length > 0 && (
            <div className="sb-filter-select home-filter-agent" ref={agentMenuRef}>
              <button className={`sb-filter-select-btn${agentFilter.length ? ' active' : ''}`} onClick={() => setAgentMenuOpen((o) => !o)}>
                <span>{agentBtnLabel}</span>
                <ChevronDown size={13} />
              </button>
              {agentMenuOpen && (
                <div className="sb-filter-menu">
                  {presentAgents.map((a) => (
                    <label key={a.id} className="sb-filter-opt">
                      <input type="checkbox" checked={agentFilter.includes(a.id)} onChange={() => toggleAgent(a.id)} />
                      {a.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {hasFilter && (
            <button className="home-filter-clear" onClick={clearFilters} title="Clear filters">
              <X size={13} /> Clear
            </button>
          )}
        </div>

        {treeSections.length === 0 && (
          <div className="home-filter-empty">No sandboxes match your filters.</div>
        )}
        {treeSections.map((sec) => (
          <div key={sec.key} className="home-tree">
            {sec.label && (
              <div className="home-tree-proj home-tree-group">
                <span className="home-tree-proj-name">{sec.label}</span>
              </div>
            )}
            {sec.list.map((s) => {
              const isRunning = s.status === 'running'
              const activity = isRunning ? (agentActivity[s.name] ?? null) : null
              const agentLabel = AGENTS.find((a) => a.id === s.agent)?.label ?? s.agent
              const changes = sandboxChanges[s.name] ?? 0
              const isolated = sandboxIsolation[s.name] === true
              // Primary status line: activity for a running agent, else lifecycle.
              const statusText = isRunning
                ? (activity === 'working' ? 'Working…' : activity === 'waiting' ? 'Waiting for you' : 'Running')
                : 'Stopped'
              return (
                <div
                  key={s.id}
                  className={`home-row home-tree-row${isRunning ? '' : ' is-stopped'}`}
                  onClick={() => setActiveSandboxId(s.id)}
                  onContextMenu={(e) => openMenu(e, s, 'cursor')}
                >
                  <SandboxAvatar sandbox={s} size={26} alert={hasUnacked(s.name)} activity={activity} />
                  <span className="home-row-name">{s.name}</span>
                  <span className={`home-row-status${activity === 'working' ? ' is-working' : ''}${activity === 'waiting' ? ' is-waiting' : ''}`}>
                    <i className={`home-row-dot${isRunning ? ' on' : ''}`} />
                    {statusText}
                  </span>
                  {isRunning && <span className="home-row-agent">{agentLabel}</span>}

                  {/* Metadata chips: branch · uncommitted changes · isolation. */}
                  <span className="home-row-meta">
                    {s.branch && (
                      <span className="home-row-chip" title={`On branch ${s.branch}`}>
                        <GitBranch size={11} />{s.branch}
                      </span>
                    )}
                    {changes > 0 && (
                      <span className="home-row-chip home-row-chip-chg" title={`${changes} uncommitted change${changes > 1 ? 's' : ''}`}>
                        <GitCommitHorizontal size={11} />{changes}
                      </span>
                    )}
                    {isolated && <span className="home-row-chip" title="Isolated clone — changes stay in the sandbox until fetched">isolated</span>}
                  </span>

                  {isRunning && s.uptimeSeconds ? <span className="home-row-up">{formatUptime(s.uptimeSeconds)}</span> : null}
                  <button
                    className="home-row-menu"
                    title="More actions"
                    onClick={(e) => openMenu(e, s, 'button')}
                  >
                    <MoreVertical size={15} />
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
