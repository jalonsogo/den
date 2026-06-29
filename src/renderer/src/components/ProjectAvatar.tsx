import { useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderGit2 } from 'lucide-react'
import { useStore } from '../store'

export const PROJECT_PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']

// Project avatar = a folder glyph in a customizable color/background. When
// editable, clicking it opens a color picker (presets + custom + reset).
export function ProjectAvatar({
  workspace, size = 22, editable = true
}: {
  workspace: string
  size?: number
  editable?: boolean
}) {
  const color = useStore((s) => s.projectColors[workspace])
  const setProjectColor = useStore((s) => s.setProjectColor)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const style = color
    ? { width: size, height: size, background: `color-mix(in srgb, ${color} 20%, transparent)`, color }
    : { width: size, height: size }

  const toggle = (e: React.MouseEvent) => {
    if (!editable) return
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.left })
    setOpen((v) => !v)
  }

  return (
    <span
      className="sb-proj-av"
      style={style}
      onClick={toggle}
      title={editable ? 'Project color' : undefined}
    >
      <FolderGit2 size={Math.round(size * 0.58)} />
      {open && createPortal(
        <>
          <div className="proj-cpick-scrim" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
          <div className="proj-cpick" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
            <div className="proj-cpick-row">
              {PROJECT_PALETTE.map((c) => (
                <button
                  key={c}
                  className={`proj-cpick-sw${color === c ? ' on' : ''}`}
                  style={{ background: c }}
                  onClick={() => { setProjectColor(workspace, c); setOpen(false) }}
                />
              ))}
            </div>
            <div className="proj-cpick-foot">
              <label className="proj-cpick-custom" title="Custom color" style={{ background: color ?? 'var(--bg-subtle)' }}>
                <input type="color" value={color ?? '#3b82f6'} onChange={(e) => setProjectColor(workspace, e.target.value)} />
              </label>
              <button className="proj-cpick-reset" onClick={() => { setProjectColor(workspace, null); setOpen(false) }}>
                Default
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </span>
  )
}
