import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Github } from 'lucide-react'
import { useStore } from '../store'
import { TERM_THEMES, TERM_THEME_GROUPS, DEFAULT_TERM_THEME } from '../lib/termThemes'
import { bringSandboxToHost } from '../lib/featureChanges'

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
  const setActivePage = useStore((s) => s.setActivePage)
  const setLogsSandbox = useStore((s) => s.setLogsSandbox)
  const setLogsReturn = useStore((s) => s.setLogsReturn)
  const setCustomizeSandbox = useStore((s) => s.setCustomizeSandbox)
  const setActiveSandboxId = useStore((s) => s.setActiveSandboxId)
  const sandboxIsolation = useStore((s) => s.sandboxIsolation)
  const groups = useStore((s) => s.groups)
  const sandboxGroups = useStore((s) => s.sandboxGroups)
  const setSandboxGroup = useStore((s) => s.setSandboxGroup)
  const createGroup = useStore((s) => s.createGroup)
  const renameGroup = useStore((s) => s.renameGroup)
  const deleteGroup = useStore((s) => s.deleteGroup)
  const setModal = useStore((s) => s.setModal)
  const setNewSandboxWorkspace = useStore((s) => s.setNewSandboxWorkspace)
  const setNewSandboxGroup = useStore((s) => s.setNewSandboxGroup)
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

  // ── Group context menu (right-click a group header) ───────────────────────
  const groupId = contextMenu.groupId
  if (groupId) {
    const group = groups.find((g) => g.id === groupId)
    if (!group) { setContextMenu({ visible: false }); return null }
    const close = () => setContextMenu({ visible: false })
    const members = sandboxes.filter((s) => sandboxGroups[s.name] === groupId)
    const running = members.filter((s) => s.status === 'running')
    const stopped = members.filter((s) => s.status === 'stopped')
    const rename = () => {
      close()
      openPrompt({ title: 'Rename group', label: 'Group name', defaultValue: group.name, confirmText: 'Rename', onSubmit: (v) => renameGroup(groupId, v) })
    }
    // Sandboxes in a group usually sit on the same folder, so default a new one
    // to the group's most common workspace (still editable in the modal).
    const groupWorkspace = (() => {
      const counts = new Map<string, number>()
      for (const m of members) counts.set(m.workspace, (counts.get(m.workspace) ?? 0) + 1)
      let best: string | null = null, top = 0
      for (const [ws, c] of counts) if (ws && c > top) { best = ws; top = c }
      return best
    })()
    const newInGroup = () => {
      close()
      setNewSandboxWorkspace(groupWorkspace)
      setNewSandboxGroup(groupId)
      setModal('new-sandbox')
    }
    const startAll = async () => { close(); for (const s of stopped) { try { await window.minipit?.runSandbox(s.name); updateSandbox(s.id, { status: 'running' }) } catch (e) { console.error(e) } } }
    const stopAll = async () => {
      close()
      for (const s of running) {
        updateSandbox(s.id, { status: 'stopping' })
        try { await window.minipit?.stopSandbox(s.name); updateSandbox(s.id, { status: 'stopped', uptimeSeconds: undefined }) }
        catch { updateSandbox(s.id, { status: 'running' }) }
      }
    }
    const del = () => {
      close()
      if (members.length === 0) { if (confirm(`Delete group "${group.name}"?`)) deleteGroup(groupId, false); return }
      if (!confirm(`Delete group "${group.name}"?`)) return
      const alsoDelete = confirm(`Also delete the ${members.length} sandbox${members.length > 1 ? 'es' : ''} in this group?\n\nOK = delete them too · Cancel = keep them (just ungroup).`)
      deleteGroup(groupId, alsoDelete)
    }
    return (
      <div ref={ref} className="ctx-menu" style={{ top: pos.top, left: pos.left }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="ctx-item" onClick={newInGroup}>New sandbox…</div>
        <div className="ctx-sep" />
        <div className="ctx-item" onClick={rename}>Rename group…</div>
        {(stopped.length > 0 || running.length > 0) && <div className="ctx-sep" />}
        {stopped.length > 0 && <div className="ctx-item" onClick={startAll}>Start {stopped.length} sandbox{stopped.length > 1 ? 'es' : ''}</div>}
        {running.length > 0 && <div className="ctx-item" onClick={stopAll}>Stop {running.length} sandbox{running.length > 1 ? 'es' : ''}</div>}
        <div className="ctx-sep" />
        <div className="ctx-item destructive" onClick={del}>Delete group…</div>
      </div>
    )
  }


  if (!sandbox) return null

  // Toggle: stop when running, start when stopped.
  const handleStartStop = async () => {
    setContextMenu({ visible: false })
    if (sandbox.status === 'running') {
      updateSandbox(sandbox.id, { status: 'stopping' })
      try {
        await window.minipit?.stopSandbox(sandbox.id)
        updateSandbox(sandbox.id, { status: 'stopped', uptimeSeconds: undefined })
      } catch {
        updateSandbox(sandbox.id, { status: 'running' })
      }
    } else {
      updateSandbox(sandbox.id, { status: 'creating' })
      try {
        await window.minipit?.runSandbox(sandbox.name)
        updateSandbox(sandbox.id, { status: 'running' })
      } catch {
        updateSandbox(sandbox.id, { status: 'stopped' })
      }
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

  // Clone-mode "feature" integrate flow lives in a shared helper (also used by
  // the sandbox header). Close the menu first, then run it.
  const bringToHost = (deleteAfter: boolean) => {
    setContextMenu({ visible: false })
    bringSandboxToHost(sandbox, deleteAfter)
  }

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="ctx-item" onClick={handleStartStop}>
        {sandbox.status === 'running'
          ? <>Stop <span className="ctx-kbd">⌘S</span></>
          : 'Start'}
      </div>
      <div className="ctx-item" onClick={handleRestart}>Restart <span className="ctx-kbd">⌘R</span></div>
      <div className="ctx-sep" />
      <div className="ctx-item" onClick={handleOpenInFinder}>
        Open in Finder <span className="ctx-kbd">⇧⌘F</span>
      </div>
      <div className="ctx-item" onClick={() => { setContextMenu({ visible: false }); navigator.clipboard?.writeText(sandbox.workspace).catch(() => {}) }}>Copy Path</div>
      <div className="ctx-sep" />
      <div
        className="ctx-item"
        onClick={() => {
          // Open the sandbox and signal its detail-view avatar to open the picker.
          setContextMenu({ visible: false })
          setActiveSandboxId(sandbox.id)
          setActivePage('sandbox')
          setCustomizeSandbox(sandbox.name)
        }}
      >
        Customize…
      </div>
      <SubMenu label="Move to group">
        {groups.map((g) => (
          <div
            key={g.id}
            className="ctx-sub-item"
            onClick={() => { setContextMenu({ visible: false }); setSandboxGroup(sandbox.name, sandboxGroups[sandbox.name] === g.id ? null : g.id) }}
          >
            {sandboxGroups[sandbox.name] === g.id ? '✓ ' : ''}{g.name}
          </div>
        ))}
        {sandboxGroups[sandbox.name] && (
          <div className="ctx-sub-item" onClick={() => { setContextMenu({ visible: false }); setSandboxGroup(sandbox.name, null) }}>Remove from group</div>
        )}
        {groups.length > 0 && <div className="ctx-sub-sep" />}
        <div
          className="ctx-sub-item"
          onClick={() => {
            setContextMenu({ visible: false })
            openPrompt({ title: 'New group', label: 'Group name', placeholder: 'e.g. Feature work', confirmText: 'Create', onSubmit: (v) => { if (v.trim()) setSandboxGroup(sandbox.name, createGroup(v)) } })
          }}
        >
          New group…
        </div>
      </SubMenu>
      {sandboxIsolation[sandbox.name] === true && (
        <SubMenu label="Feature changes">
          <div className="ctx-sub-label">Review changes in the Files → Changes tab</div>
          <div className="ctx-sub-sep" />
          <div className="ctx-sub-item ctx-sub-item-icon" onClick={() => bringToHost(false)}>
            <Github size={13} /> Merge changes to your repo…
          </div>
          <div className="ctx-sub-item ctx-sub-item-icon" onClick={() => bringToHost(true)}>
            <Github size={13} /> Merge, then delete sandbox…
          </div>
        </SubMenu>
      )}
      <div className="ctx-item" onClick={handleSaveSnapshot}>Save Snapshot…</div>
      <div className="ctx-item" onClick={() => { setContextMenu({ visible: false }); setLogsSandbox(sandbox.name); setLogsReturn(sandbox.id); setActivePage('logs') }}>Logs <span className="ctx-kbd">⌘L</span></div>
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
        Delete Sandbox… <span className="ctx-kbd">⌘X</span>
      </div>
    </div>
  )
}
