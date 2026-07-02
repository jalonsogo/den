import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useStore, projectDisplayName } from '../store'
import { TERM_THEMES, TERM_THEME_GROUPS, DEFAULT_TERM_THEME } from '../lib/termThemes'

// A hover-triggered flyout item for a context menu. Defaults to opening
// rightward and flips left (nudging up) when it would overflow the viewport.
function SubMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const subRef = useRef<HTMLDivElement>(null)
  const [flip, setFlip] = useState(false)
  const [top, setTop] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    if (!open) { setFlip(false); setTop(undefined); return }
    if (!subRef.current) return
    const M = 8
    const r = subRef.current.getBoundingClientRect()
    setFlip(r.right > window.innerWidth - M)
    setTop(r.bottom > window.innerHeight - M ? -5 + (window.innerHeight - M - r.bottom) : undefined)
  }, [open])
  return (
    <div
      className="ctx-item ctx-has-sub"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {label}
      <span className="ctx-sub-arrow">›</span>
      {open && (
        <div
          ref={subRef}
          className={`ctx-submenu${flip ? ' flip-left' : ''}`}
          style={top !== undefined ? { top } : undefined}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function ContextMenu() {
  const { contextMenu, setContextMenu, sandboxes, updateSandbox, setDeleting, setSandboxes } = useStore()
  const termTheme = useStore((s) => s.termTheme)
  const setTermTheme = useStore((s) => s.setTermTheme)
  const openPrompt = useStore((s) => s.openPrompt)
  const projectNames = useStore((s) => s.projectNames)
  const setProjectName = useStore((s) => s.setProjectName)
  const removeProject = useStore((s) => s.removeProject)
  const setActiveProject = useStore((s) => s.setActiveProject)
  const setActivePage = useStore((s) => s.setActivePage)
  const setLogsSandbox = useStore((s) => s.setLogsSandbox)
  const setNewSandboxWorkspace = useStore((s) => s.setNewSandboxWorkspace)
  const setModal = useStore((s) => s.setModal)
  const setCustomizeProject = useStore((s) => s.setCustomizeProject)
  const gitInfoMap = useStore((s) => s.gitInfo)
  const loadGitInfo = useStore((s) => s.loadGitInfo)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: contextMenu.y, left: contextMenu.x })

  const sandbox = sandboxes.find((s) => s.id === contextMenu.sandboxId)

  useEffect(() => {
    const hide = () => setContextMenu({ visible: false })
    document.addEventListener('mousedown', hide)
    document.addEventListener('scroll', hide, true)
    return () => {
      document.removeEventListener('mousedown', hide)
      document.removeEventListener('scroll', hide, true)
    }
  }, [])

  // Clamp the menu inside the viewport so it never gets cut off at an edge.
  useLayoutEffect(() => {
    if (!contextMenu.visible || !ref.current) return
    const M = 8
    const r = ref.current.getBoundingClientRect()
    const left = Math.max(M, Math.min(contextMenu.x, window.innerWidth - r.width - M))
    const top = Math.max(M, Math.min(contextMenu.y, window.innerHeight - r.height - M))
    setPos({ top, left })
  }, [contextMenu.x, contextMenu.y, contextMenu.visible])

  if (!contextMenu.visible) return null

  // ── Project context menu (right-click a project row) ──────────────────────
  const projectWs = contextMenu.workspace
  if (projectWs) {
    const list = sandboxes.filter((s) => s.workspace === projectWs)
    const running = list.filter((s) => s.status === 'running')
    const stopped = list.filter((s) => s.status === 'stopped')
    const name = projectDisplayName(projectNames, projectWs)
    const close = () => setContextMenu({ visible: false })

    const openProject = () => { close(); setActiveProject(projectWs); setActivePage('projects') }
    const newSandbox = () => { close(); setNewSandboxWorkspace(projectWs); setModal('new-sandbox') }
    const reveal = () => { close(); window.minipit?.openInFinder(projectWs) }
    const copyPath = () => { close(); navigator.clipboard?.writeText(projectWs).catch(() => {}) }
    const customize = () => { close(); setCustomizeProject(projectWs) }
    const git = gitInfoMap[projectWs]
    const initGit = async () => {
      close()
      const r = await window.minipit?.gitInit(projectWs)
      if (r && !r.ok) alert(`git init failed:\n${r.error ?? 'unknown error'}`)
      else loadGitInfo(projectWs, true)
    }
    const openRemote = () => { close(); if (git?.remoteUrl) window.minipit?.openPath(git.remoteUrl) }
    const copyRemote = () => { close(); if (git?.remote) navigator.clipboard?.writeText(git.remote).catch(() => {}) }
    const rename = () => {
      close()
      openPrompt({
        title: 'Rename project',
        message: 'Sets a display name in den. The folder on disk is unchanged.',
        label: 'Display name',
        defaultValue: name,
        placeholder: projectWs.split('/').pop() ?? '',
        confirmText: 'Rename',
        onSubmit: (v) => setProjectName(projectWs, v || null),
      })
    }
    const stopAll = async () => {
      close()
      for (const s of running) {
        updateSandbox(s.id, { status: 'stopping' })
        try { await window.minipit?.stopSandbox(s.id); updateSandbox(s.id, { status: 'stopped', uptimeSeconds: undefined }) }
        catch { updateSandbox(s.id, { status: 'running' }) }
      }
    }
    const startAll = async () => {
      close()
      for (const s of stopped) {
        try { await window.minipit?.runSandbox(s.name); updateSandbox(s.id, { status: 'running' }) }
        catch (e) { console.error(e) }
      }
    }
    const remove = () => {
      close()
      const msg = list.length
        ? `Remove "${name}" from den? Its ${list.length} sandbox${list.length > 1 ? 'es' : ''} stay on disk and can be re-added.`
        : `Remove "${name}" from den?`
      if (!confirm(msg)) return
      removeProject(projectWs, false)
    }

    return (
      <div
        ref={ref}
        className="ctx-menu"
        style={{ top: pos.top, left: pos.left }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ctx-item" onClick={openProject}>Open project</div>
        <div className="ctx-item" onClick={newSandbox}>New sandbox…</div>
        <div className="ctx-item" onClick={customize}>Customize…</div>
        <div className="ctx-sep" />
        <SubMenu label="Manage">
          <div className="ctx-sub-item" onClick={rename}>Rename…</div>
          <div className="ctx-sub-sep" />
          <div className="ctx-sub-item" onClick={reveal}>Reveal in Finder <span className="ctx-kbd">⇧⌘F</span></div>
          <div className="ctx-sub-item" onClick={copyPath}>Copy path</div>
        </SubMenu>
        {git?.isRepo ? (
          <SubMenu label="Git">
            <div className="ctx-sub-label">On branch {git.branch || 'detached'}</div>
            {git.remoteUrl && <div className="ctx-sub-item" onClick={openRemote}>Open remote…</div>}
            {git.remote && <div className="ctx-sub-item" onClick={copyRemote}>Copy remote URL</div>}
            {!git.remote && <div className="ctx-sub-item" style={{ color: 'var(--t3)', pointerEvents: 'none' }}>No remote</div>}
          </SubMenu>
        ) : (
          <div className="ctx-item" onClick={initGit}>Initialize Git repository</div>
        )}
        {(running.length > 0 || stopped.length > 0) && (
          <SubMenu label="Sandboxes">
            {running.length > 0 && (
              <div className="ctx-sub-item" onClick={stopAll}>Stop {running.length} sandbox{running.length > 1 ? 'es' : ''}</div>
            )}
            {stopped.length > 0 && (
              <div className="ctx-sub-item" onClick={startAll}>Start {stopped.length} sandbox{stopped.length > 1 ? 'es' : ''}</div>
            )}
          </SubMenu>
        )}
        <div className="ctx-sep" />
        <div className="ctx-item destructive" onClick={remove}>Remove project…</div>
      </div>
    )
  }

  if (!sandbox) return null

  const handleStop = async () => {
    setContextMenu({ visible: false })
    if (sandbox.status !== 'running') return
    updateSandbox(sandbox.id, { status: 'stopping' })
    try {
      await window.minipit?.stopSandbox(sandbox.id)
      updateSandbox(sandbox.id, { status: 'stopped', uptimeSeconds: undefined })
    } catch {
      updateSandbox(sandbox.id, { status: 'running' })
    }
  }

  const handleOpenInFinder = () => {
    setContextMenu({ visible: false })
    window.minipit?.openInFinder(sandbox.workspace)
  }

  // Restart = stop (if running) then start again, so a fresh agent session picks
  // up new kits/policy.
  const handleRestart = async () => {
    setContextMenu({ visible: false })
    try {
      if (sandbox.status === 'running') {
        updateSandbox(sandbox.id, { status: 'stopping' })
        await window.minipit?.stopSandbox(sandbox.id)
      }
      await window.minipit?.runSandbox(sandbox.name)
      updateSandbox(sandbox.id, { status: 'running' })
    } catch (e) {
      console.error(e)
    }
  }

  const pickTheme = (id: string) => {
    setTermTheme(id)
    setContextMenu({ visible: false })
  }

  // Save the sandbox's current state as a reusable template via `sbx template save`.
  const handleSaveSnapshot = () => {
    setContextMenu({ visible: false })
    const running = sandbox.status === 'running'
    openPrompt({
      title: 'Save Snapshot',
      message: running
        ? `Save "${sandbox.name}" as a reusable template. This stops the sandbox while the image is captured.`
        : `Save "${sandbox.name}" as a reusable template.`,
      label: 'Template tag',
      defaultValue: `${sandbox.name}:latest`,
      placeholder: 'my-template:v1',
      confirmText: 'Save',
      onSubmit: async (tag) => {
        const res = await window.minipit?.saveSnapshot(sandbox.name, tag)
        if (!res?.ok) throw new Error(res?.error ?? 'Snapshot failed')
        // sbx stops the sandbox to capture it — refresh so the UI reflects that.
        const list = await window.minipit?.listSandboxes()
        if (list) setSandboxes(list)
      },
    })
  }


  const handleDelete = async () => {
    setContextMenu({ visible: false })
    if (!confirm(`Delete "${sandbox.name}"?`)) return
    setDeleting(sandbox.id, true)
    try {
      await window.minipit?.deleteSandbox(sandbox.name)
      // Refresh immediately so the row disappears without waiting for the poll.
      const list = await window.minipit?.listSandboxes()
      if (list) setSandboxes(list)
    } catch (e) {
      console.error(e)
      setDeleting(sandbox.id, false)
    }
  }

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="ctx-item" onClick={handleStop}>
        {sandbox.status === 'running' ? 'Stop' : 'Start'} <span className="ctx-kbd">⌘.</span>
      </div>
      <div className="ctx-sep" />
      <div className="ctx-item" onClick={handleOpenInFinder}>
        Open in Finder <span className="ctx-kbd">⇧⌘F</span>
      </div>
      <div className="ctx-item">Copy Path</div>
      <div className="ctx-sep" />
      <div className="ctx-item" onClick={handleSaveSnapshot}>Save Snapshot…</div>
      <div className="ctx-item" onClick={handleRestart}>Restart</div>
      <div className="ctx-sep" />
      <div className="ctx-item" onClick={() => { setContextMenu({ visible: false }); setLogsSandbox(sandbox.name); setActivePage('logs') }}>Logs</div>
      <div className="ctx-sep" />
      <SubMenu label="Terminal theme">
        {TERM_THEMES.filter((t) => t.id === DEFAULT_TERM_THEME).map((t) => (
          <div key={t.id} className="ctx-sub-item" onClick={() => pickTheme(t.id)}>
            <span className="ctx-sub-check">{termTheme === t.id ? '✓' : ''}</span>{t.label}
          </div>
        ))}
        {TERM_THEME_GROUPS.map((g) => (
          <div key={g.mode}>
            <div className="ctx-sub-label">{g.label}</div>
            {TERM_THEMES.filter((t) => t.mode === g.mode && t.id !== DEFAULT_TERM_THEME).map((t) => (
              <div key={t.id} className="ctx-sub-item" onClick={() => pickTheme(t.id)}>
                <span className="ctx-sub-check">{termTheme === t.id ? '✓' : ''}</span>{t.label}
              </div>
            ))}
          </div>
        ))}
      </SubMenu>
      <div className="ctx-sep" />
      <div className="ctx-item destructive" onClick={handleDelete}>
        Delete Sandbox…
      </div>
    </div>
  )
}
