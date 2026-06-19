import { useEffect, useState } from 'react'
import { FolderOpen, MoreVertical, PanelRight, TerminalSquare, Info, Play, Square } from 'lucide-react'
import { useStore } from '../store'
import { TerminalPanel } from './TerminalPanel'
import { InfoPanel } from './InfoPanel'
import { FilesPanel } from './FilesPanel'
import { AgentIcon } from './AgentIcon'
import type { TabType } from '../types'

const VIEWS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'terminal', label: 'Terminal', icon: <TerminalSquare size={15} /> },
  { id: 'info',     label: 'Info',     icon: <Info size={15} /> }
]

export function SandboxDetail() {
  const { sandboxes, activeSandboxId, activeTab, setActiveTab, updateSandbox, setContextMenu } = useStore()
  const sandbox = sandboxes.find((s) => s.id === activeSandboxId)
  const [filesOpen, setFilesOpen] = useState(false)
  const [filesWidth, setFilesWidth] = useState(300)

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const onMove = (ev: MouseEvent) => {
      // Panel is docked right; width = distance from cursor to the window edge.
      const w = window.innerWidth - ev.clientX
      setFilesWidth(Math.min(640, Math.max(220, w)))
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

  // Refresh ports when the Info view is shown (ports now live inside Info).
  useEffect(() => {
    if (activeTab === 'info' && sandbox?.name) {
      window.minipit?.getPorts(sandbox.name).then((ports) => {
        if (ports?.length) updateSandbox(sandbox.name, { ports })
      }).catch(() => {})
    }
  }, [activeTab, sandbox?.name])

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

  const handleOpenInFinder = () => {
    window.minipit?.openInFinder(sandbox.workspace)
  }

  const handleMenu = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    // Anchor the menu's right edge under the button (menu is 200px wide).
    setContextMenu({ visible: true, x: rect.right - 200, y: rect.bottom + 4, sandboxId: sandbox.id })
  }

  const isTransitioning =
    sandbox.status === 'stopping' || sandbox.status === 'starting' || sandbox.status === 'deleting'

  return (
    <div className="detail">
      <div className="detail-header">
        <div className={`d-dot ${sandbox.status === 'running' ? 'running' : 'stopped'}`} />
        <div className="d-name">{sandbox.name}</div>
        <span className="d-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <AgentIcon agent={sandbox.agent} size={12} />
          {sandbox.agent}
        </span>
        <span className="d-uptime">
          {sandbox.status === 'running'  ? 'Running' :
           sandbox.status === 'starting' ? 'Starting…' :
           sandbox.status === 'stopping' ? 'Stopping…' :
           sandbox.status === 'deleting' ? 'Deleting…' : 'Stopped'}
        </span>
        <div className="d-actions">
          {sandbox.status === 'running' ? (
            <button className="btn btn-default btn-sm" onClick={handleStop} disabled={isTransitioning}>
              <Square size={11} fill="currentColor" strokeWidth={0} />
              Stop
            </button>
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

      <div className="detail-switch-bar">
        <div className="detail-switch">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={`detail-switch-item${activeTab === v.id ? ' active' : ''}`}
              onClick={() => setActiveTab(v.id)}
            >
              {v.icon}
              {v.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button
          className="tab-files-toggle"
          onClick={handleOpenInFinder}
          title={`Open ${sandbox.workspace} in Finder`}
        >
          <FolderOpen size={14} />
        </button>
        <button
          className={`tab-files-toggle${filesOpen ? ' active' : ''}`}
          onClick={() => setFilesOpen((v) => !v)}
          title={filesOpen ? 'Hide files' : 'Show files'}
        >
          <PanelRight size={14} />
          Files
        </button>
      </div>

      <div className="detail-body">
        <div className="detail-main">
          <div className={`tab-panel${activeTab === 'terminal' ? ' active' : ''}`}>
            <TerminalPanel sandbox={sandbox} />
          </div>
          <div className={`tab-panel${activeTab === 'info' ? ' active' : ''}`}>
            <InfoPanel sandbox={sandbox} />
          </div>
        </div>
        {filesOpen && (
          <>
            <div className="files-resize" onMouseDown={startResize} />
            <div className="files-side" style={{ width: filesWidth }}>
              <FilesPanel sandbox={sandbox} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
