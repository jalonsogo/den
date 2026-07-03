import { useEffect, useState } from 'react'
import { Plus, ChevronRight, FolderOpen, ArrowUp, X, HardDrive, ShieldAlert, Zap, ShieldCheck, Boxes, Terminal, AlertTriangle } from 'lucide-react'
import { useStore, unackedBlockCount } from '../store'
import type { SbxRelease, StorageUsage } from '../types'
import { ProjectAvatar } from './ProjectAvatar'
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

const projectName = (workspace: string): string => workspace.split('/').pop() || workspace

export function HomePage() {
  const { sandboxes, customProjects, setModal, setActiveSandboxId, setActivePage, setActiveProject } = useStore()
  const policyBlocks = useStore((s) => s.policyBlocks)
  const blocksSeenAt = useStore((s) => s.blocksSeenAt)
  const agentActivity = useStore((s) => s.agentActivity)
  const sandboxIsolation = useStore((s) => s.sandboxIsolation)
  const theme = useStore((s) => s.theme)
  const brandMark = theme === 'dark' ? brandDark : brandLight
  const running = sandboxes.filter((s) => s.status === 'running')
  const stopped = sandboxes.filter((s) => s.status !== 'running')

  // Sandboxes with recent network-policy denials → dashboard attention row.
  const blocked = sandboxes.filter((s) => (policyBlocks[s.name] ?? []).length > 0)
  const hasUnacked = (name: string) => unackedBlockCount(policyBlocks, blocksSeenAt, name) > 0

  // Projects = distinct workspaces across sandboxes, plus empty custom projects.
  const projectCount = new Set([...sandboxes.map((s) => s.workspace), ...customProjects]).size

  // Group ALL sandboxes (running + stopped) under their project (workspace) for
  // the tree view — running first within each project, then alphabetical.
  const byProject = new Map<string, typeof sandboxes>()
  for (const s of sandboxes) {
    if (!byProject.has(s.workspace)) byProject.set(s.workspace, [])
    byProject.get(s.workspace)!.push(s)
  }
  const groups = [...byProject.entries()]
    .map(([ws, list]) => [ws, [...list].sort((a, b) =>
      (a.status === 'running' ? 0 : 1) - (b.status === 'running' ? 0 : 1) || a.name.localeCompare(b.name)
    )] as const)
    .sort((a, b) => projectName(a[0]).localeCompare(projectName(b[0])))

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

        <div className="home-stats">
          <button className="home-stat home-stat-btn" onClick={() => setActivePage('sandboxes')} title="View all sandboxes">
            <div className="home-stat-n">{sandboxes.length}</div>
            <div className="home-stat-l">Sandboxes</div>
          </button>
          <div className="home-stat">
            <div className="home-stat-n" style={{ color: 'var(--green)' }}>{running.length}</div>
            <div className="home-stat-l">Running</div>
          </div>
          <div className="home-stat">
            <div className="home-stat-n" style={{ color: 'var(--t3)' }}>{stopped.length}</div>
            <div className="home-stat-l">Stopped</div>
          </div>
        </div>

        <div className="home-cards">
          <button className="home-card" onClick={() => setActivePage('projects')}>
            <div className="home-card-ic"><FolderOpen size={16} /></div>
            <div className="home-card-body">
              <div className="home-card-title">Projects</div>
              <div className="home-card-sub">{projectCount} project{projectCount === 1 ? '' : 's'}</div>
            </div>
            <ChevronRight size={15} style={{ color: 'var(--t3)' }} />
          </button>

          <div className="home-card home-card-static">
            <div className="home-card-ic"><HardDrive size={16} /></div>
            <div className="home-card-body">
              <div className="home-card-title">Disk usage</div>
              <div className="home-card-sub">{storageSub}</div>
            </div>
            {showBreakdown && (
              <div className="home-disk-break">
                <span><i className="home-disk-dot" style={{ background: 'var(--primary)' }} />Sandboxes {fmtBytes(storage!.sandboxes.bytes)}</span>
                <span><i className="home-disk-dot" style={{ background: 'var(--t3)' }} />Templates {fmtBytes(storage!.templates.bytes)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="ss-hdr" style={{ marginTop: 26 }}>Sandboxes</div>
        {groups.map(([workspace, list]) => (
          <div key={workspace} className="home-tree">
            <div
              className="home-tree-proj"
              onClick={() => { setActiveProject(workspace); setActivePage('projects') }}
            >
              <ProjectAvatar workspace={workspace} size={18} editable={false} />
              <span className="home-tree-proj-name">{projectName(workspace)}</span>
              <span className="home-tree-proj-count">{list.length}</span>
              {list.filter((s) => sandboxIsolation[s.name] === false).length >= 2 && (
                <span
                  className="sb-group-warn"
                  title="Multiple sandboxes mount this folder directly — their edits can collide."
                >
                  <AlertTriangle size={13} />
                </span>
              )}
            </div>
            {list.map((s) => {
              const isRunning = s.status === 'running'
              return (
                <div
                  key={s.id}
                  className={`home-row home-tree-row${isRunning ? '' : ' is-stopped'}`}
                  onClick={() => setActiveSandboxId(s.id)}
                >
                  <SandboxAvatar sandbox={s} size={26} alert={hasUnacked(s.name)} activity={isRunning ? (agentActivity[s.name] ?? null) : null} />
                  <span className="home-row-name">{s.name}</span>
                  <span className="home-row-sub">{isRunning ? s.agent : 'Stopped'}</span>
                  {isRunning && s.uptimeSeconds ? <span className="home-row-up" style={{ marginLeft: 'auto' }}>{formatUptime(s.uptimeSeconds)}</span> : null}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
