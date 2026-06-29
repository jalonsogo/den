import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FolderGit2, Folder, Code, Box, Rocket, Globe, Terminal, Layers,
  Star, Database, Cpu, FlaskConical
} from 'lucide-react'
import { useStore } from '../store'

export const PROJECT_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'
]

// Selectable project icons (key persisted in the store).
export const PROJECT_ICONS: Record<string, React.ComponentType<{ size?: number | string }>> = {
  'folder-git-2': FolderGit2, folder: Folder, code: Code, box: Box, rocket: Rocket,
  globe: Globe, terminal: Terminal, layers: Layers, star: Star, database: Database, cpu: Cpu, beaker: FlaskConical
}
const ICON_KEYS = Object.keys(PROJECT_ICONS)

// Project avatar = a chosen glyph in a customizable color/background. When
// editable, clicking it opens a picker (color presets + custom, icon set, reset).
export function ProjectAvatar({
  workspace, size = 22, editable = true
}: {
  workspace: string
  size?: number
  editable?: boolean
}) {
  const color = useStore((s) => s.projectColors[workspace])
  const iconKey = useStore((s) => s.projectIcons[workspace])
  const setProjectColor = useStore((s) => s.setProjectColor)
  const setProjectIcon = useStore((s) => s.setProjectIcon)
  const setPickerOpen = useStore((s) => s.setPickerOpen)
  const [open, setOpenState] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const popRef = useRef<HTMLDivElement>(null)

  // Keep the global flag in sync so the project hover-flyout suppresses itself
  // while this picker is open (no two overlapping popovers).
  const setOpen = (v: boolean) => { setOpenState(v); setPickerOpen(v) }

  const Icon = PROJECT_ICONS[iconKey] ?? FolderGit2
  const style = color
    ? { width: size, height: size, background: `color-mix(in srgb, ${color} 20%, transparent)`, color }
    : { width: size, height: size }

  const toggle = (e: React.MouseEvent) => {
    if (!editable) return
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.left })
    setOpen(!open)
  }

  // Clamp the picker inside the viewport so it's never cut off at an edge.
  useLayoutEffect(() => {
    if (!open || !popRef.current) return
    const M = 8
    const r = popRef.current.getBoundingClientRect()
    setPos((p) => ({
      top: Math.max(M, Math.min(p.top, window.innerHeight - r.height - M)),
      left: Math.max(M, Math.min(p.left, window.innerWidth - r.width - M))
    }))
  }, [open])

  return (
    <span className="sb-proj-av" style={style} onClick={toggle} title={editable ? 'Customize project' : undefined}>
      <Icon size={Math.round(size * 0.58)} />
      {open && createPortal(
        <>
          <div className="proj-cpick-scrim" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
          <div ref={popRef} className="proj-cpick" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
            <div className="proj-cpick-lbl">Color</div>
            <div className="proj-cpick-row">
              {PROJECT_PALETTE.map((c) => (
                <button
                  key={c}
                  className={`proj-cpick-sw${color === c ? ' on' : ''}`}
                  style={{ background: c }}
                  onClick={() => setProjectColor(workspace, c)}
                />
              ))}
            </div>

            <div className="proj-cpick-lbl">Icon</div>
            <div className="proj-cpick-icons">
              {ICON_KEYS.map((k) => {
                const I = PROJECT_ICONS[k]
                return (
                  <button
                    key={k}
                    className={`proj-cpick-icon${(iconKey ?? 'folder-git-2') === k ? ' on' : ''}`}
                    onClick={() => setProjectIcon(workspace, k)}
                    style={color ? { color } : undefined}
                  >
                    <I size={15} />
                  </button>
                )
              })}
            </div>

            <div className="proj-cpick-foot">
              <label className="proj-cpick-custom" title="Custom color" style={{ background: color ?? 'var(--bg-subtle)' }}>
                <input type="color" value={color ?? '#3b82f6'} onChange={(e) => setProjectColor(workspace, e.target.value)} />
              </label>
              <button
                className="proj-cpick-reset"
                onClick={() => { setProjectColor(workspace, null); setProjectIcon(workspace, null); setOpen(false) }}
              >
                Reset
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </span>
  )
}
