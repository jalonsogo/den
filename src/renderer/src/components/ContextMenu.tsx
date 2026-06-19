import { useEffect, useRef } from 'react'
import { useStore } from '../store'

export function ContextMenu() {
  const { contextMenu, setContextMenu, sandboxes, updateSandbox, setDeleting, setSandboxes } = useStore()
  const ref = useRef<HTMLDivElement>(null)

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

  if (!contextMenu.visible || !sandbox) return null

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
      style={{ top: contextMenu.y, left: contextMenu.x }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="ctx-item">
        Open Terminal <span className="ctx-kbd">↵</span>
      </div>
      <div className="ctx-sep" />
      <div className="ctx-item" onClick={handleStop}>
        {sandbox.status === 'running' ? 'Stop' : 'Start'} <span className="ctx-kbd">⌘.</span>
      </div>
      <div className="ctx-sep" />
      <div className="ctx-item" onClick={handleOpenInFinder}>
        Open in Finder <span className="ctx-kbd">⇧⌘F</span>
      </div>
      <div className="ctx-item">Copy Path</div>
      <div className="ctx-sep" />
      <div className="ctx-item">Save Snapshot…</div>
      <div className="ctx-item">Reset…</div>
      <div className="ctx-sep" />
      <div className="ctx-item destructive" onClick={handleDelete}>
        Delete Sandbox…
      </div>
    </div>
  )
}
