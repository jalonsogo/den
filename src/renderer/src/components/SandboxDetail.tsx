import { useEffect, useState, useRef } from 'react'
import { MoreVertical, Play, Square, GitBranch, FolderGit2, RotateCcw, Github, GitCommitHorizontal, ChevronDown, Code2 } from 'lucide-react'
import { useStore } from '../store'
import { TerminalPanel } from './TerminalPanel'
import { InfoPanel } from './InfoPanel'
import { FilesPanel } from './FilesPanel'
import { SandboxAvatar } from './SandboxAvatar'
import { ChangesList } from './ChangesList'
import { formatUptime } from '../lib/utils'
import { bringSandboxToHost } from '../lib/featureChanges'
import type { FileChange } from '../types'

type Dock = 'files' | 'info' | null

export function SandboxDetail() {
  const { sandboxes, activeSandboxId, updateSandbox, setContextMenu, gitInfo, loadGitInfo, sandboxChanges, sandboxIsolation } = useStore()
  const sandbox = sandboxes.find((s) => s.id === activeSandboxId)

  // Clone-mode sandboxes keep their work inside a private clone; expose the
  // fetch-back / PR / merge flow as a header button (mirrors the context menu).
  const [featureOpen, setFeatureOpen] = useState(false)
  const featureRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!featureOpen) return
    const onDown = (e: MouseEvent) => { if (featureRef.current && !featureRef.current.contains(e.target as Node)) setFeatureOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [featureOpen])

  // Load the workspace's host-side git info (branch/remote) — the project git
  // summary that used to live in the (now-removed) sidebar Projects section.
  useEffect(() => { if (sandbox?.workspace) loadGitInfo(sandbox.workspace) }, [sandbox?.workspace, loadGitInfo])
  const [dock, setDock] = useState<Dock>(null)
  const [dockWidth, setDockWidth] = useState(340)
  // Subheader "N changed" dropdown — the changed-file list, fetched on open.
  const [changesOpen, setChangesOpen] = useState(false)
  const [changeFiles, setChangeFiles] = useState<FileChange[]>([])
  const changesRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!changesOpen) return
    const onDown = (e: MouseEvent) => { if (changesRef.current && !changesRef.current.contains(e.target as Node)) setChangesOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [changesOpen])

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const onMove = (ev: MouseEvent) => {
      // Panel is docked right; width = distance from cursor to the window edge.
      const w = window.innerWidth - ev.clientX
      setDockWidth(Math.min(680, Math.max(260, w)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
  }

  // ⌘F / ⌘I hotkeys toggle the Files / Info dock via a window event.
  useEffect(() => {
    const onToggle = (e: Event) => {
      const which = (e as CustomEvent).detail as Dock
      if (which === 'files' || which === 'info') setDock((d) => (d === which ? null : which))
    }
    window.addEventListener('den:toggle-dock', onToggle)
    return () => window.removeEventListener('den:toggle-dock', onToggle)
  }, [])

  // Refresh ports when the Info dock is shown (ports live inside Info).
  useEffect(() => {
    if (dock === 'info' && sandbox?.name) {
      window.minipit?.getPorts(sandbox.name).then((ports) => {
        if (ports?.length) updateSandbox(sandbox.name, { ports })
      }).catch(() => {})
    }
  }, [dock, sandbox?.name])

  if (!sandbox) {
    return (
      <div className="detail" style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 13, display: 'flex' }}>
        Select a sandbox to get started
      </div>
    )
  }

  const handleStop = async () => {
    updateSandbox(sandbox.id, { status: 'stopping' })
    try {
      await window.minipit?.stopSandbox(sandbox.name)
      updateSandbox(sandbox.id, { status: 'stopped', uptimeSeconds: undefined })
    } catch (e) {
      console.error(e)
      updateSandbox(sandbox.id, { status: 'running' })
    }
  }

  const handleStart = async () => {
    updateSandbox(sandbox.id, { status: 'starting' })
    try {
      await window.minipit?.runSandbox(sandbox.name)
      // Status will update via log lines and polling
    } catch (e) {
      console.error(e)
      updateSandbox(sandbox.id, { status: 'stopped' })
    }
  }

  const handleRestart = async () => {
    updateSandbox(sandbox.id, { status: 'stopping' })
    try {
      await window.minipit?.stopSandbox(sandbox.name)
      await window.minipit?.runSandbox(sandbox.name)
      updateSandbox(sandbox.id, { status: 'running' })
    } catch (e) {
      console.error(e)
      updateSandbox(sandbox.id, { status: 'running' })
    }
  }

  // Attach desktop VSCode over the sbx SSH endpoint. Mirrors the context-menu
  // action: first run offers to enable the experimental SSH feature, then retry.
  const handleOpenVscode = async () => {
    type VscodeRes = { ok: boolean; needsFeature?: boolean; error?: string }
    const attempt = (): Promise<VscodeRes | undefined> =>
      window.minipit?.openVscode(sandbox.name).catch((e) => ({ ok: false, error: String(e) })) as Promise<VscodeRes | undefined>
    let res = await attempt()
    if (res?.needsFeature) {
      const ok = confirm(
        'Opening a sandbox in VSCode needs the experimental sbx SSH endpoint.\n\n' +
        'Enable it now? This may briefly restart the sbx daemon (running sandboxes keep running).'
      )
      if (!ok) return
      const en = await window.minipit?.setSshFeature(true, true).catch(() => null)
      if (!en?.enabled) { alert(en?.error || 'Could not enable the SSH endpoint. Check Settings → General → Experimental.'); return }
      res = await attempt()
    }
    if (res && !res.ok) alert(res.error || 'Could not open VSCode.')
  }

  const handleMenu = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    // Anchor the menu's right edge under the button (menu is 200px wide).
    setContextMenu({ visible: true, x: rect.right - 200, y: rect.bottom + 4, sandboxId: sandbox.id, workspace: null, groupId: null })
  }

  const isTransitioning =
    sandbox.status === 'stopping' || sandbox.status === 'starting' || sandbox.status === 'deleting'

  return (
    <div className="detail">
      <div className="detail-header">
        <SandboxAvatar sandbox={sandbox} size={22} editable linkToContextMenu />
        <div className="d-name">{sandbox.name}</div>
        <span className={`d-status ${sandbox.status === 'running' ? 'on' : 'off'}`}>
          {sandbox.status === 'running'
            ? `Running${sandbox.uptimeSeconds ? ` · ${formatUptime(sandbox.uptimeSeconds)}` : ''}`
           : sandbox.status === 'creating' ? 'Creating…'
           : sandbox.status === 'starting' ? 'Starting…'
           : sandbox.status === 'stopping' ? 'Stopping…'
           : sandbox.status === 'deleting' ? 'Deleting…' : 'Stopped'}
        </span>
        <div className="d-actions">
          {sandboxIsolation[sandbox.name] === true && (
            <div className="d-feature" ref={featureRef} style={{ position: 'relative' }}>
              <button
                className="seg-btn-item d-feature-btn"
                onClick={() => setFeatureOpen((o) => !o)}
                title="Bring this sandbox's changes to your repo"
              >
                <Github size={13} />
                Changes
                <ChevronDown size={12} />
              </button>
              {featureOpen && (
                <div className="d-feature-menu">
                  <div className="d-feature-label">Review in the Files → Changes tab</div>
                  <div className="d-feature-item" onClick={() => { setFeatureOpen(false); bringSandboxToHost(sandbox, false) }}>
                    <Github size={13} /> Merge changes to your repo…
                  </div>
                  <div className="d-feature-item" onClick={() => { setFeatureOpen(false); bringSandboxToHost(sandbox, true) }}>
                    <Github size={13} /> Merge, then delete sandbox…
                  </div>
                </div>
              )}
            </div>
          )}
          {sandbox.status === 'running' ? (
            <div className="seg-btn">
              <button className="seg-btn-item" onClick={handleStop} disabled={isTransitioning}>
                <Square size={11} fill="currentColor" strokeWidth={0} />
                Stop
              </button>
              <button className="seg-btn-item" onClick={handleRestart} disabled={isTransitioning}>
                <RotateCcw size={12} />
                Restart
              </button>
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={handleStart} disabled={isTransitioning}>
              <Play size={11} fill="currentColor" strokeWidth={0} />
              {sandbox.status === 'starting' ? 'Starting…' : 'Start'}
            </button>
          )}

          <button className="btn btn-ghost btn-sm" onClick={handleOpenVscode} title="Open in VSCode" disabled={isTransitioning}>
            <Code2 size={14} />
          </button>

          <button className="btn btn-ghost btn-sm" onClick={handleMenu} title="More actions">
            <MoreVertical size={14} />
          </button>
        </div>
      </div>

      {/* All Git info, condensed here: folder · branch · uncommitted changes ·
          remote link. This is the single place git context lives now. */}
      {(() => {
        const gi = gitInfo[sandbox.workspace]
        const changes = sandboxChanges[sandbox.name] ?? 0
        const repoShort = gi?.remoteUrl?.replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, '')
        return (
          <div className="detail-subhdr">
            <FolderGit2 size={12} />
            <span className="ds-folder" title={sandbox.workspace}>{sandbox.workspace.split('/').pop() || sandbox.workspace}</span>
            {gi?.branch && (
              <span className="ds-branch" title={`On branch ${gi.branch}`}>
                <GitBranch size={12} />{gi.branch}
              </span>
            )}
            {sandbox.status === 'running' && changes > 0 && (
              <div className="ds-changes-wrap" ref={changesRef}>
                <button
                  className={`ds-changes${changesOpen ? ' open' : ''}`}
                  title={`${changes} uncommitted change${changes > 1 ? 's' : ''}`}
                  onClick={() => {
                    const open = !changesOpen
                    setChangesOpen(open)
                    if (open) window.minipit?.gitStatus(sandbox.name, sandbox.workspace)
                      .then((r) => setChangeFiles(r?.changes ?? [])).catch(() => {})
                  }}
                >
                  <GitCommitHorizontal size={12} />{changes} changed<ChevronDown size={11} />
                </button>
                {changesOpen && (
                  <div className="ds-changes-menu">
                    <ChangesList
                      changes={changeFiles}
                      onOpen={(rel, name) => { window.minipit?.openFileWindow(sandbox.name, `${sandbox.workspace}/${rel}`, name); setChangesOpen(false) }}
                    />
                  </div>
                )}
              </div>
            )}
            {gi?.remoteUrl && (
              <a className="ds-remote" title={gi.remote || gi.remoteUrl} onClick={() => window.minipit?.openPath(gi.remoteUrl!)}>
                <Github size={12} />{repoShort || 'remote'}
              </a>
            )}
          </div>
        )
      })()}

      <div className="detail-body">
        <div className="detail-main">
          <TerminalPanel
            sandbox={sandbox}
            dock={dock}
            onToggleFiles={() => setDock((d) => (d === 'files' ? null : 'files'))}
            onShowInfo={() => setDock((d) => (d === 'info' ? null : 'info'))}
            onStart={handleStart}
          />
        </div>
        {dock && (
          <>
            <div className="files-resize" onMouseDown={startResize} />
            <div className="files-side" style={{ width: dockWidth }}>
              {dock === 'files'
                ? <FilesPanel sandbox={sandbox} />
                : <InfoPanel sandbox={sandbox} onClose={() => setDock(null)} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
