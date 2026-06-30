import { useEffect, useState } from 'react'
import { Plus, ChevronRight, FolderOpen, ArrowUp, X, HardDrive, ShieldAlert } from 'lucide-react'
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
  const theme = useStore((s) => s.theme)
  const brandMark = theme === 'dark' ? brandDark : brandLight
  const running = sandboxes.filter((s) => s.status === 'running')
  const stopped = sandboxes.filter((s) => s.status !== 'running')

  // Sandboxes with recent network-policy denials → dashboard attention row.
  const blocked = sandboxes.filter((s) => (policyBlocks[s.name] ?? []).length > 0)
  const hasUnacked = (name: string) => unackedBlockCount(policyBlocks, blocksSeenAt, name) > 0

  // Projects = distinct workspaces across sandboxes, plus empty custom projects.
  const projectCount = new Set([...sandboxes.map((s) => s.workspace), ...customProjects]).size

  // Group running sandboxes under their project (workspace) for the tree view.
  const runningByProject = new Map<string, typeof running>()
  for (const s of running) {
    if (!runningByProject.has(s.workspace)) runningByProject.set(s.workspace, [])
    runningByProject.get(s.workspace)!.push(s)
  }
  const runningGroups = [...runningByProject.entries()].sort((a, b) =>
    projectName(a[0]).localeCompare(projectName(b[0])))

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

  // Welcome / empty state — no sandboxes yet, so surface a single centered CTA.
  if (sandboxes.length === 0) {
    return (
      <div className="page">
        <div className="home-empty">
          <img className="home-empty-mark" src={brandMark} alt="den" width={52} height={56} />
          <h1 className="home-empty-title">Welcome to den</h1>
          <p className="home-empty-sub">
            Spin up an isolated sandbox to run agents, terminals, and tools — safely, in their own space.
          </p>
          <button className="btn btn-primary" onClick={() => setModal('new-sandbox')}>
            <Plus size={15} />
            Create your first sandbox
          </button>
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
          <div className="home-stat">
            <div className="home-stat-n">{sandboxes.length}</div>
            <div className="home-stat-l">Sandboxes</div>
          </div>
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

        <div className="ss-hdr" style={{ marginTop: 26 }}>Running now</div>
        {running.length === 0 ? (
          <div style={{ color: 'var(--t3)', fontSize: 13, padding: '14px 2px' }}>
            Nothing running. Create a sandbox to get started.
          </div>
        ) : (
          runningGroups.map(([workspace, list]) => (
            <div key={workspace} className="home-tree">
              <div
                className="home-tree-proj"
                onClick={() => { setActiveProject(workspace); setActivePage('projects') }}
              >
                <ProjectAvatar workspace={workspace} size={18} editable={false} />
                <span className="home-tree-proj-name">{projectName(workspace)}</span>
                <span className="home-tree-proj-count">{list.length}</span>
              </div>
              {list.map((s) => (
                <div key={s.id} className="home-row home-tree-row" onClick={() => setActiveSandboxId(s.id)}>
                  <SandboxAvatar sandbox={s} size={26} alert={hasUnacked(s.name)} activity={agentActivity[s.name] ?? null} />
                  <span className="home-row-name">{s.name}</span>
                  <span className="home-row-sub">{s.agent}</span>
                  {s.uptimeSeconds ? <span className="home-row-up" style={{ marginLeft: 'auto' }}>{formatUptime(s.uptimeSeconds)}</span> : null}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
