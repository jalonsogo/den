import { useEffect, useState } from 'react'
import { MoreVertical, Play, Square } from 'lucide-react'
import { useStore } from '../store'
import { TerminalPanel } from './TerminalPanel'
import { InfoPanel } from './InfoPanel'
import { FilesPanel } from './FilesPanel'
import { AgentIcon } from './AgentIcon'
import { SandboxAvatar } from './SandboxAvatar'

type Dock = 'files' | 'info' | null

export function SandboxDetail() {
  const { sandboxes, activeSandboxId, updateSandbox, setContextMenu } = useStore()
  const sandbox = sandboxes.find((s) => s.id === activeSandboxId)
  const [dock, setDock] = useState<Dock>(null)
  const [dockWidth, setDockWidth] = useState(340)

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
        <SandboxAvatar sandbox={sandbox} size={22} editable linkToContextMenu />
        <div className="d-name">{sandbox.name}</div>
        <span className="d-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <AgentIcon agent={sandbox.agent} size={12} />
          {sandbox.agent}
        </span>
        <span className="d-uptime">
          {sandbox.status === 'running'  ? 'Running' :
           sandbox.status === 'creating' ? 'Creating…' :
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
