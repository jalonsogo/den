import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FolderGit2, Folder, Code, Box, Rocket, Globe, Terminal, Layers,
  Star, Database, Cpu, FlaskConical, MoreHorizontal, icons as LUCIDE
} from 'lucide-react'
import { useStore } from '../store'

type IconComp = React.ComponentType<{ size?: number | string }>
export const LUCIDE_ICONS = LUCIDE as unknown as Record<string, IconComp>
// PascalCase names for every Lucide icon — the full browse set.
export const ALL_ICON_NAMES = Object.keys(LUCIDE_ICONS)

export const PROJECT_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'
]

// Project icons kept for rendering existing/legacy selections (the icon picker
// was removed — customization is color-only — but stored icons still resolve).
export const PROJECT_ICONS: Record<string, React.ComponentType<{ size?: number | string }>> = {
  'folder-git-2': FolderGit2, folder: Folder, code: Code, box: Box, rocket: Rocket,
  globe: Globe, terminal: Terminal, layers: Layers, star: Star, database: Database, cpu: Cpu, beaker: FlaskConical
}

// Resolve a stored icon key to a component. Supports the legacy quick-set
// (kebab-case keys) and any full Lucide icon (PascalCase name).
export function resolveIcon(key?: string | null): IconComp {
  if (!key) return FolderGit2
  return PROJECT_ICONS[key] ?? LUCIDE_ICONS[key] ?? FolderGit2
}

// Project avatar = a glyph in a customizable color/background. When editable,
// clicking it opens a color picker (presets + custom + reset).
export function ProjectAvatar({
  workspace, size = 22, editable = true, linkToContextMenu = false
}: {
  workspace: string
  size?: number
  editable?: boolean
  // When true, this instance opens its picker in response to the project
  // right-click menu's "Customize" (via the store's customizeProject signal).
  linkToContextMenu?: boolean
}) {
  const color = useStore((s) => s.projectColors[workspace])
  const iconKey = useStore((s) => s.projectIcons[workspace])
  const setProjectColor = useStore((s) => s.setProjectColor)
  const setProjectIcon = useStore((s) => s.setProjectIcon)
  const setPickerOpen = useStore((s) => s.setPickerOpen)
  const customizeProject = useStore((s) => s.customizeProject)
  const setCustomizeProject = useStore((s) => s.setCustomizeProject)
  const [open, setOpenState] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const popRef = useRef<HTMLDivElement>(null)
  const avRef = useRef<HTMLSpanElement>(null)

  // Keep the global flag in sync so the project hover-flyout suppresses itself
  // while this picker is open (no two overlapping popovers).
  const setOpen = (v: boolean) => { setOpenState(v); setPickerOpen(v) }

  const Icon = resolveIcon(iconKey)
  const style = color
    ? { width: size, height: size, background: `color-mix(in srgb, ${color} 20%, transparent)`, color }
    : { width: size, height: size }

  const openAt = (r: DOMRect) => { setPos({ top: r.bottom + 6, left: r.left }); setOpen(true) }

  const toggle = (e: React.MouseEvent) => {
    if (!editable) return
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (open) { setOpen(false); return }
    openAt(r)
  }

  // Open the picker when the project context menu requests "Customize" for this
  // workspace, positioned at this avatar. Clear the signal so it fires once.
  useEffect(() => {
    if (!linkToContextMenu || customizeProject !== workspace) return
    if (avRef.current) openAt(avRef.current.getBoundingClientRect())
    setCustomizeProject(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customizeProject, linkToContextMenu, workspace])

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
    <span ref={avRef} className="sb-proj-av" style={style} onClick={toggle} title={editable ? 'Customize project' : undefined}>
      <Icon size={Math.round(size * 0.58)} />
      {open && createPortal(
        <>
          <div className="proj-cpick-scrim" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
          <div ref={popRef} className="proj-cpick" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
            <div className="proj-cpick-lblrow">
              <div className="proj-cpick-lbl">Color</div>
              <label className="proj-cpick-more" title="Custom color…">
                <MoreHorizontal size={14} />
                <input type="color" value={color ?? '#3b82f6'} onChange={(e) => setProjectColor(workspace, e.target.value)} />
              </label>
            </div>
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

            <div className="proj-cpick-foot">
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
