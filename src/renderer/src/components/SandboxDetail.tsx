import { useEffect, useState, useRef } from 'react'
import { MoreVertical, Play, Square, GitBranch, RotateCcw, Github, GitCommitHorizontal, ChevronDown, Check } from 'lucide-react'
import { useStore } from '../store'
import { TerminalPanel } from './TerminalPanel'
import { InfoPanel } from './InfoPanel'
import { NetworkPanel } from './NetworkPanel'
import { FilesPanel } from './FilesPanel'
import { SandboxAvatar } from './SandboxAvatar'
import { ChangesList } from './ChangesList'
import { formatUptime } from '../lib/utils'
import type { FileChange } from '../types'

type Dock = 'files' | 'info' | 'network' | null

export function SandboxDetail() {
  const { sandboxes, activeSandboxId, updateSandbox, setContextMenu, gitInfo, loadGitInfo, sandboxChanges, sandboxIsolation, sandboxAutoSync, setAutoSync, setRightDockOpen } = useStore()
  const sandbox = sandboxes.find((s) => s.id === activeSandboxId)
  // Agent activity (working / waiting) — the same signal the sidebar and toolbar
  // use, so the header's status dot and text line up with them instead of only
  // reflecting the container lifecycle.
  const activity = useStore((s) => (sandbox ? s.agentActivity[sandbox.name] ?? null : null))

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
  // Remember the last-open panel so the toolbar's right-dock toggle can reopen
  // whatever was showing rather than a fixed default.
  const lastDock = useRef<Exclude<Dock, null>>('info')
  // Which sub-tab the Files dock shows (Files browser vs Changes review). Owned
  // here so the terminal's activity rail can highlight and drive both.
  const [filesTab, setFilesTab] = useState<'files' | 'changes'>('files')
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
      const which = (e as CustomEvent).detail as Dock | 'changes'
      // Opening Files (or Changes) from a shortcut/command lands on that sub-tab.
      if (which === 'files') setFilesTab('files')
      if (which === 'changes') { setFilesTab('changes'); setDock((d) => (d === 'files' ? null : 'files')); return }
      if (which === 'files' || which === 'info' || which === 'network') setDock((d) => (d === which ? null : which))
    }
    window.addEventListener('den:toggle-dock', onToggle)
    return () => window.removeEventListener('den:toggle-dock', onToggle)
  }, [])

  // Mirror the dock's open state into the store (so the toolbar can show a
  // collapse toggle for it) and remember the last-open panel for reopening.
  useEffect(() => {
    setRightDockOpen(dock !== null)
    if (dock !== null) lastDock.current = dock
  }, [dock, setRightDockOpen])
  // Clear the flag on unmount (leaving the sandbox page hides the dock).
  useEffect(() => () => setRightDockOpen(false), [setRightDockOpen])

  // The toolbar's right-dock button: close if open, else reopen the last panel.
  useEffect(() => {
    const onToggleRight = () => setDock((d) => (d === null ? lastDock.current : null))
    window.addEventListener('den:toggle-right-dock', onToggleRight)
    return () => window.removeEventListener('den:toggle-right-dock', onToggleRight)
  }, [])

  // Refresh ports when the Network dock is shown (ports live inside Network).
  useEffect(() => {
    if (dock === 'network' && sandbox?.name) {
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

  // Open the Files dock on the Changes tab (the review & merge surface).
  const openChangesPanel = () => {
    setChangesOpen(false)
    setFeatureOpen(false)
    setFilesTab('changes')
    setDock('files')
  }

  // Rail Files/Changes toggles: open the Files dock on the right sub-tab, or
  // close it if it's already showing that tab.
  const toggleFiles = () => {
    if (dock === 'files' && filesTab === 'files') { setDock(null); return }
    setFilesTab('files')
    setDock('files')
  }
  const toggleChanges = () => {
    if (dock === 'files' && filesTab === 'changes') { setDock(null); return }
    setFilesTab('changes')
    setDock('files')
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
        <SandboxAvatar sandbox={sandbox} size={30} editable linkToContextMenu activity={sandbox.status === 'running' ? activity : null} />
        <div className="d-name">{sandbox.name}</div>
        <span className={`d-status ${sandbox.status === 'running' ? (activity ?? 'on') : 'off'}`}>
          {sandbox.status === 'running'
            ? `${activity === 'working' ? 'Working…' : activity === 'waiting' ? 'Waiting for you' : 'Running'}${sandbox.uptimeSeconds ? ` · ${formatUptime(sandbox.uptimeSeconds)}` : ''}`
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
                title="Bring this sandbox's changes to your repo (PR or merge)"
              >
                <Github size={13} />
                Integrate
                <ChevronDown size={12} />
              </button>
              {featureOpen && (
                <div className="d-feature-menu">
                  <div className="d-feature-item" onClick={openChangesPanel}>
                    <Github size={13} /> Review &amp; merge…
                  </div>
                  <div className="d-feature-sep" />
                  <div
                    className="d-feature-item d-feature-toggle"
                    title="On each change, fetch this sandbox's work into its sandbox/<name> review branch (never merges into your working tree)"
                    onClick={() => setAutoSync(sandbox.name, !(sandboxAutoSync[sandbox.name] === true))}
                  >
                    <Check size={13} style={{ opacity: sandboxAutoSync[sandbox.name] === true ? 1 : 0 }} />
                    Auto-sync to review branch
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

          <button className="btn btn-ghost btn-sm" onClick={handleMenu} title="More actions">
            <MoreVertical size={14} />
          </button>
        </div>
      </div>

      {/* Git context: branch · uncommitted changes · remote link. (The local
          folder link now lives in the Files panel.) Hidden when there's nothing
          to show, so a non-git workspace doesn't get an empty bar. */}
      {(() => {
        const gi = gitInfo[sandbox.workspace]
        const changes = sandboxChanges[sandbox.name] ?? 0
        const repoShort = gi?.remoteUrl?.replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, '')
        const hasChanges = sandbox.status === 'running' && changes > 0
        if (!gi?.branch && !hasChanges && !gi?.remoteUrl) return null
        return (
          <div className="detail-subhdr">
            {gi?.branch && (
              <span className="ds-branch" title={`On branch ${gi.branch}`}>
                <GitBranch size={12} />{gi.branch}
              </span>
            )}
            {hasChanges && (
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
                    <div className="ds-changes-scroll">
                      <ChangesList
                        changes={changeFiles}
                        onOpen={(rel, name) => { window.minipit?.openFileWindow(sandbox.name, `${sandbox.workspace}/${rel}`, name, true); setChangesOpen(false) }}
                      />
                    </div>
                    <button className="ds-changes-link" onClick={openChangesPanel}>
                      Review & merge · all {changeFiles.length} changes →
                    </button>
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
            filesTab={filesTab}
            onToggleFiles={toggleFiles}
            onShowInfo={() => setDock((d) => (d === 'info' ? null : 'info'))}
            onShowNetwork={() => setDock((d) => (d === 'network' ? null : 'network'))}
            onShowChanges={toggleChanges}
            onStart={handleStart}
          />
        </div>
        {dock && (
          <>
            <div className="files-resize" onMouseDown={startResize} />
            <div className="files-side" style={{ width: dockWidth }}>
              {dock === 'files'
                ? <FilesPanel sandbox={sandbox} tab={filesTab} onTabChange={setFilesTab} />
                : dock === 'network'
                ? <NetworkPanel sandbox={sandbox} onClose={() => setDock(null)} />
                : <InfoPanel sandbox={sandbox} onClose={() => setDock(null)} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
