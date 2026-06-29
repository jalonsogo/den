import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { TERM_THEMES, TERM_THEME_GROUPS } from '../lib/termThemes'

export function ContextMenu() {
  const { contextMenu, setContextMenu, sandboxes, updateSandbox, setDeleting, setSandboxes } = useStore()
  const termTheme = useStore((s) => s.termTheme)
  const setTermTheme = useStore((s) => s.setTermTheme)
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
      <div className="ctx-item">Save Snapshot…</div>
      <div className="ctx-item">Reset…</div>
      <div className="ctx-sep" />
      <div className="ctx-theme">
        <span className="ctx-theme-lbl">Terminal theme</span>
        <select
          className="ctx-theme-select"
          value={termTheme}
          onChange={(e) => setTermTheme(e.target.value)}
        >
          {TERM_THEME_GROUPS.map((g) => (
            <optgroup key={g.mode} label={g.label}>
              {TERM_THEMES.filter((t) => t.mode === g.mode).map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="ctx-sep" />
      <div className="ctx-item destructive" onClick={handleDelete}>
        Delete Sandbox…
      </div>
    </div>
  )
}
