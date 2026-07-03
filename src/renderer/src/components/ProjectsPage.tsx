import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { useStore, unackedBlockCount } from '../store'
import { AgentIcon } from './AgentIcon'
import { SandboxAvatar } from './SandboxAvatar'
import { FilesPanel } from './FilesPanel'
import { ProjectAvatar } from './ProjectAvatar'
import { formatUptime } from '../lib/utils'

export function ProjectsPage() {
  const { sandboxes, activeProject, setActiveProject, setActiveSandboxId, setActivePage, setModal, setNewSandboxWorkspace, customProjects, addProject, removeProject } = useStore()
  const policyBlocks = useStore((s) => s.policyBlocks)
  const blocksSeenAt = useStore((s) => s.blocksSeenAt)
  const agentActivity = useStore((s) => s.agentActivity)
  const loadGitInfo = useStore((s) => s.loadGitInfo)
  const [delFor, setDelFor] = useState<string | null>(null)
  const [delFolder, setDelFolder] = useState(false)

  // Group sandboxes by workspace, then fold in empty (sandbox-less) projects.
  const projects = new Map<string, typeof sandboxes>()
  for (const s of sandboxes) {
    if (!projects.has(s.workspace)) projects.set(s.workspace, [])
    projects.get(s.workspace)!.push(s)
  }
  for (const ws of customProjects) {
    if (!projects.has(ws)) projects.set(ws, [])
  }
  const entries = [...projects.entries()]

  // Lazily load host-side git info (repo/branch/remote) for each project card.
  const projectKeys = entries.map(([ws]) => ws).join('|')
  useEffect(() => {
    entries.forEach(([ws]) => loadGitInfo(ws))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKeys])

  const openNew = (workspace?: string) => {
    setNewSandboxWorkspace(workspace ?? null)
    setModal('new-sandbox')
  }

  const newProject = () => {
    addProject().then((dir) => { if (dir) { setActiveProject(dir); setActivePage('projects') } })
  }

  // ── Single project detail ──────────────────────────────────────────────
  if (activeProject) {
    const list = projects.get(activeProject) ?? []
    const name = activeProject.split('/').pop() || activeProject
    // Prefer a running sandbox to back the files view (any sees the same workspace).
    const filesSandbox = list.find((s) => s.status === 'running') ?? list[0]

    return (
      <div className="page">
        <div className="page-hdr">
          <button className="fv-back" onClick={() => setActiveProject(null)} title="All projects">
            <ChevronLeft size={16} />
          </button>
          <ProjectAvatar workspace={activeProject} size={24} linkToContextMenu />
          <span className="page-title">{name}</span>
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => openNew(activeProject)}>
            <Plus size={13} /> New sandbox
          </button>
        </div>

        <div className="proj-detail">
          <div className="proj-detail-main">
            <div className="ss-hdr" style={{ marginBottom: 6 }}>{activeProject}</div>
            {list.length === 0 ? (
              <div className="files-empty">No sandboxes in this project</div>
            ) : (
              list.map((s) => (
                <div key={s.id} className="home-row" onClick={() => setActiveSandboxId(s.id)}>
                  <AgentIcon agent={s.agent} size={15} />
                  <span className="home-row-name">{s.name}</span>
                  <span className="home-row-sub">{s.agent}</span>
                  <span className={`proj-dot ${s.status === 'running' ? 'running' : 'stopped'}`} style={{ marginLeft: 'auto' }} />
                </div>
              ))
            )}
          </div>
          <div className="proj-detail-files">
            {filesSandbox
              ? <FilesPanel sandbox={filesSandbox} />
              : <div className="files-empty">No sandbox to read files from</div>}
          </div>
        </div>
      </div>
    )
  }

  // ── All projects ───────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-hdr">
        <span className="page-title">Projects</span>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={newProject}>
          <Plus size={13} /> New project
        </button>
      </div>

      <div className="page-body home-dash">
        <p style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 14 }}>
          Workspaces you've launched sandboxes from. Each project groups its sandboxes.
        </p>

        {entries.length === 0 ? (
          <div className="proj-empty">
            <p>No projects yet. A project is a workspace folder — pick or create one, then launch a sandbox in it.</p>
            <button className="btn btn-primary btn-sm" onClick={newProject}>
              <Plus size={13} /> New project
            </button>
          </div>
        ) : (
          <div className="proj-grid">
            {entries.map(([workspace, list]) => (
              <div className="proj-card" key={workspace}>
                <div className="proj-hdr" onClick={() => setActiveProject(workspace)} style={{ cursor: 'pointer' }}>
                  <ProjectAvatar workspace={workspace} size={24} />
                  <div className="proj-hdr-text">
                    <div className="proj-hdr-line">
                      <span className="proj-name">{workspace.split('/').pop() || workspace}</span>
                      <span
                        className="proj-path"
                        title="Double-click to reveal in Finder"
                        onDoubleClick={(e) => { e.stopPropagation(); window.minipit?.openInFinder(workspace) }}
                      >{workspace}</span>
                    </div>
                  </div>
                  {list.length === 0 && (
                    <button
                      className="proj-del"
                      title="Remove project"
                      onClick={(e) => { e.stopPropagation(); setDelFor(delFor === workspace ? null : workspace); setDelFolder(false) }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {delFor === workspace ? (
                  <div className="proj-del-confirm">
                    <label className="proj-del-chk">
                      <input type="checkbox" checked={delFolder} onChange={(e) => setDelFolder(e.target.checked)} />
                      Also delete the folder from disk
                    </label>
                    <div className="proj-del-actions">
                      <button className="btn btn-default btn-sm" onClick={() => setDelFor(null)}>Cancel</button>
                      <button
                        className="btn btn-destructive btn-sm"
                        onClick={() => { removeProject(workspace, delFolder); setDelFor(null) }}
                      >
                        Delete{delFolder ? ' + folder' : ''}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="proj-sbxs">
                    {list.length === 0 && (
                      <div className="proj-sbx-empty">No sandboxes yet</div>
                    )}
                    {list.map((s) => {
                      const creating = s.status === 'creating'
                      return (
                      <button
                        key={s.id}
                        className="proj-sbx"
                        style={creating ? { cursor: 'default' } : undefined}
                        onClick={() => { if (!creating) setActiveSandboxId(s.id) }}
                      >
                        <SandboxAvatar
                          sandbox={s}
                          size={28}
                          alert={unackedBlockCount(policyBlocks, blocksSeenAt, s.name) > 0}
                          activity={s.status === 'running' ? (agentActivity[s.name] ?? null) : null}
                        />
                        <span className="proj-sbx-name">{s.name}</span>
                        <span className="proj-sbx-meta">
                          {s.agent}{s.branch ? ` · ${s.branch}` : ''}{s.memory ? ` · ${s.memory}` : ''}
                        </span>
                        <span className="proj-sbx-right">
                          {s.status === 'running' && s.uptimeSeconds ? (
                            <span className="home-row-up">{formatUptime(s.uptimeSeconds)}</span>
                          ) : null}
                          <span className={`proj-sbx-status ${s.status === 'running' ? 'running' : creating ? 'creating' : 'stopped'}`}>
                            {s.status === 'running' ? 'Running' : creating ? 'Creating…' : 'Stopped'}
                          </span>
                        </span>
                      </button>
                      )
                    })}
                    <button className="proj-sbx proj-sbx-new" onClick={() => openNew(workspace)} title="New sandbox in this project">
                      <Plus size={14} /> New sandbox
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
