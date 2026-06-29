import { useState } from 'react'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { AgentIcon } from './AgentIcon'
import { FilesPanel } from './FilesPanel'
import { ProjectAvatar } from './ProjectAvatar'

export function ProjectsPage() {
  const { sandboxes, activeProject, setActiveProject, setActiveSandboxId, setActivePage, setModal, setNewSandboxWorkspace, customProjects, addProject, removeProject } = useStore()
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
          <ProjectAvatar workspace={activeProject} size={24} />
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
                  <span className="proj-name">{workspace.split('/').pop() || workspace}</span>
                  <span className="proj-path">{workspace}</span>
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
                  <div className="proj-boxes">
                    {list.map((s) => (
                      <button key={s.id} className="proj-box" onClick={() => setActiveSandboxId(s.id)}>
                        <AgentIcon agent={s.agent} size={13} />
                        <span>{s.name}</span>
                        <span className={`proj-dot ${s.status === 'running' ? 'running' : 'stopped'}`} />
                      </button>
                    ))}
                    <button className="proj-box proj-box-new" onClick={() => openNew(workspace)} title="New sandbox in this project">
                      <Plus size={13} /> New sandbox
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
