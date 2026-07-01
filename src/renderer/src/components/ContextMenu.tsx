import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { TERM_THEMES, TERM_THEME_GROUPS, DEFAULT_TERM_THEME } from '../lib/termThemes'

export function ContextMenu() {
  const { contextMenu, setContextMenu, sandboxes, updateSandbox, setDeleting, setSandboxes } = useStore()
  const termTheme = useStore((s) => s.termTheme)
  const setTermTheme = useStore((s) => s.setTermTheme)
  const openPrompt = useStore((s) => s.openPrompt)
  const ref = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: contextMenu.y, left: contextMenu.x })
  const [themeOpen, setThemeOpen] = useState(false)
  // The theme flyout defaults to opening rightward; flip it left (and nudge it
  // up) when that would overflow the viewport near the window edge.
  const [subFlip, setSubFlip] = useState(false)
  const [subTop, setSubTop] = useState<number | undefined>(undefined)

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

  // Decide the flyout side/offset once it's rendered, based on real geometry.
  useLayoutEffect(() => {
    if (!themeOpen) { setSubFlip(false); setSubTop(undefined); return }
    if (!subRef.current) return
    const M = 8
    const r = subRef.current.getBoundingClientRect()
    setSubFlip(r.right > window.innerWidth - M)
    setSubTop(r.bottom > window.innerHeight - M ? -5 + (window.innerHeight - M - r.bottom) : undefined)
  }, [themeOpen])

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
      <div
        className="ctx-item ctx-has-sub"
        onMouseEnter={() => setThemeOpen(true)}
        onMouseLeave={() => setThemeOpen(false)}
      >
        Terminal theme
        <span className="ctx-sub-arrow">›</span>
        {themeOpen && (
          <div
            ref={subRef}
            className={`ctx-submenu${subFlip ? ' flip-left' : ''}`}
            style={subTop !== undefined ? { top: subTop } : undefined}
          >
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
          </div>
        )}
      </div>
      <div className="ctx-sep" />
      <div className="ctx-item destructive" onClick={handleDelete}>
        Delete Sandbox…
      </div>
    </div>
  )
}
