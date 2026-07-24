import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, Search, X } from 'lucide-react'
import { AgentIcon } from './AgentIcon'
import { PROJECT_ICONS, PROJECT_PALETTE, resolveIcon, LUCIDE_ICONS, ALL_ICON_NAMES } from '../lib/iconSet'
import { useStore } from '../store'
import type { Sandbox, AgentState } from '../types'

// Curated icons offered in the sandbox picker (reuses the project icon set).
const SANDBOX_ICON_KEYS = Object.keys(PROJECT_ICONS)

// Two-letter initials from a sandbox name (alnum word starts, then first char).
function sandboxInitials(name: string): string {
  const parts = name.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  return (parts.slice(0, 2).map((p) => p[0]).join('') || name[0] || '?').toUpperCase()
}

// Project-tinted square with the sandbox's initials (or a custom icon) and a
// corner agent badge. Shared by the sidebar and the dashboard so sandboxes read
// the same everywhere. When `editable`, clicking it opens an icon picker.
export function SandboxAvatar({
  sandbox, size = 30, deleting = false, alert = false, activity = null,
  editable = false, linkToContextMenu = false
}: {
  sandbox: Sandbox
  size?: number
  deleting?: boolean
  alert?: boolean
  activity?: AgentState | null
  editable?: boolean
  // When true, opens the picker in response to the sandbox right-click menu's
  // "Customize" (via the store's customizeSandbox signal).
  linkToContextMenu?: boolean
}) {
  const projColor = useStore((s) => s.sandboxColors[sandbox.name])
  const showBadge = useStore((s) => s.display.agentBadge)
  const iconKey = useStore((s) => s.sandboxIcons[sandbox.name])
  const setSandboxIcon = useStore((s) => s.setSandboxIcon)
  const setSandboxColor = useStore((s) => s.setSandboxColor)
  const setPickerOpen = useStore((s) => s.setPickerOpen)
  const customizeSandbox = useStore((s) => s.customizeSandbox)
  const setCustomizeSandbox = useStore((s) => s.setCustomizeSandbox)

  const [open, setOpenState] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [browseOpen, setBrowseOpen] = useState(false)
  const [iconQuery, setIconQuery] = useState('')
  // Render icons in pages so opening Browse stays snappy across 1500+ icons;
  // scrolling near the bottom reveals more (see onScroll below).
  const PAGE = 300
  const [cap, setCap] = useState(PAGE)
  const popRef = useRef<HTMLDivElement>(null)
  const avRef = useRef<HTMLDivElement>(null)
  const setOpen = (v: boolean) => {
    setOpenState(v); setPickerOpen(v)
    if (!v) { setBrowseOpen(false); setIconQuery('') }
  }
  // Reset paging when the query changes or the browse panel toggles.
  useEffect(() => { setCap(PAGE) }, [iconQuery, browseOpen])

  const browseList = useMemo(() => {
    const q = iconQuery.trim().toLowerCase()
    const all = q ? ALL_ICON_NAMES.filter((n) => n.toLowerCase().includes(q)) : ALL_ICON_NAMES
    return { items: all.slice(0, cap), total: all.length }
  }, [iconQuery, cap])

  // A stopped sandbox drains its square to neutral + faded (the status dot and
  // agent badge stay at full strength — handled in CSS), so skip the project
  // tint when it isn't running.
  const running = sandbox.status === 'running'
  const style: React.CSSProperties = { width: size, height: size }
  if (projColor && running) {
    style.background = `color-mix(in srgb, ${projColor} 22%, transparent)`
    style.color = projColor
  }

  const openAt = (r: DOMRect) => { setPos({ top: r.bottom + 6, left: r.left }); setOpen(true) }
  const toggle = (e: React.MouseEvent) => {
    if (!editable) return
    e.stopPropagation()
    if (open) { setOpen(false); return }
    openAt((e.currentTarget as HTMLElement).getBoundingClientRect())
  }

  // Open the picker when the sandbox context menu requests "Customize".
  useEffect(() => {
    if (!linkToContextMenu || customizeSandbox !== sandbox.name) return
    if (avRef.current) openAt(avRef.current.getBoundingClientRect())
    setCustomizeSandbox(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customizeSandbox, linkToContextMenu, sandbox.name])

  // Clamp the picker inside the viewport.
  useLayoutEffect(() => {
    if (!open || !popRef.current) return
    const M = 8
    const r = popRef.current.getBoundingClientRect()
    setPos((p) => ({
      top: Math.max(M, Math.min(p.top, window.innerHeight - r.height - M)),
      left: Math.max(M, Math.min(p.left, window.innerWidth - r.width - M))
    }))
  }, [open, browseOpen])

  const Icon = iconKey ? resolveIcon(iconKey) : null

  return (
    <div
      ref={avRef}
      className={`sbx-avatar${editable ? ' sbx-avatar-editable' : ''}${running ? '' : ' sbx-avatar-stopped'}`}
      style={style}
      onClick={editable ? toggle : undefined}
      title={editable ? 'Customize' : undefined}
    >
      {deleting
        ? <div className="sbx-avatar-spinner" />
        : Icon
          ? <Icon size={Math.round(size * 0.5)} />
          : <span className="sbx-avatar-txt">{sandboxInitials(sandbox.name)}</span>}
      {showBadge && <span className="sbx-avatar-badge"><AgentIcon agent={sandbox.agent} size={11} /></span>}
      {!deleting && (() => {
        // Always-on status dot so working/idle/stopped is visible at a glance,
        // even on the collapsed rail where there's no status text. A pending
        // network-policy alert takes over the dot (turns it red) rather than
        // adding a second corner badge.
        const state = alert ? 'alert'
          : activity === 'working' ? 'working'
          : activity === 'waiting' ? 'waiting'
          : sandbox.status === 'running' ? 'running'
          : sandbox.status === 'creating' ? 'working'
          : 'stopped'
        const title = state === 'alert' ? 'Network requests blocked'
          : state === 'working' ? 'Agent working…'
          : state === 'waiting' ? 'Waiting for you'
          : state === 'running' ? 'Running'
          : 'Stopped'
        return <span className={`sbx-avatar-activity ${state}`} title={title} />
      })()}

      {open && createPortal(
        <>
          <div className="proj-cpick-scrim" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
          <div ref={popRef} className="proj-cpick" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
            <div className="proj-cpick-lblrow">
              <div className="proj-cpick-lbl">Color</div>
              <label className="proj-cpick-more" title="Custom color…">
                <MoreHorizontal size={14} />
                <input type="color" value={projColor ?? '#3b82f6'} onChange={(e) => setSandboxColor(sandbox.name, e.target.value)} />
              </label>
            </div>
            <div className="proj-cpick-row">
              {PROJECT_PALETTE.map((c) => (
                <button
                  key={c}
                  className={`proj-cpick-sw${projColor === c ? ' on' : ''}`}
                  style={{ background: c }}
                  onClick={() => setSandboxColor(sandbox.name, c)}
                />
              ))}
            </div>

            <div className="proj-cpick-lblrow">
              <div className="proj-cpick-lbl">Icon</div>
              <button
                className={`proj-cpick-more${browseOpen ? ' on' : ''}`}
                title="Browse all icons"
                onClick={() => setBrowseOpen((o) => !o)}
              >
                <MoreHorizontal size={14} />
              </button>
            </div>

            {!browseOpen && (
              <div className="proj-cpick-icons">
                {SANDBOX_ICON_KEYS.map((k) => {
                  const I = resolveIcon(k)
                  return (
                    <button
                      key={k}
                      className={`proj-cpick-icon${iconKey === k ? ' on' : ''}`}
                      onClick={() => setSandboxIcon(sandbox.name, k)}
                      style={projColor ? { color: projColor } : undefined}
                    >
                      <I size={15} />
                    </button>
                  )
                })}
              </div>
            )}

            {browseOpen && (
              <div className="proj-cpick-browse">
                <div className="proj-cpick-search">
                  <Search size={13} className="proj-cpick-search-ic" />
                  <input
                    autoFocus
                    value={iconQuery}
                    placeholder="Search all icons…"
                    onChange={(e) => setIconQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setBrowseOpen(false) } }}
                  />
                  {iconQuery && (
                    <button className="proj-cpick-search-x" onClick={() => setIconQuery('')} title="Clear"><X size={12} /></button>
                  )}
                </div>
                {browseList.items.length === 0 ? (
                  <div className="proj-cpick-browse-empty">No icons match “{iconQuery}”.</div>
                ) : (
                  <div
                    className="proj-cpick-browse-grid"
                    onScroll={(e) => {
                      const el = e.currentTarget
                      // Reveal the next page when scrolled near the bottom.
                      if (browseList.total > browseList.items.length &&
                          el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
                        setCap((c) => c + PAGE)
                      }
                    }}
                  >
                    {browseList.items.map((name) => {
                      const I = LUCIDE_ICONS[name]
                      return (
                        <button
                          key={name}
                          className={`proj-cpick-icon${iconKey === name ? ' on' : ''}`}
                          title={name}
                          onClick={() => setSandboxIcon(sandbox.name, name)}
                          style={projColor ? { color: projColor } : undefined}
                        >
                          <I size={15} />
                        </button>
                      )
                    })}
                  </div>
                )}
                {browseList.total > browseList.items.length && (
                  <div className="proj-cpick-browse-more">
                    Showing {browseList.items.length} of {browseList.total} — scroll for more, or type to narrow.
                  </div>
                )}
              </div>
            )}

            <div className="proj-cpick-foot">
              <button
                className="proj-cpick-reset"
                onClick={() => { setSandboxIcon(sandbox.name, null); setSandboxColor(sandbox.name, null); setOpen(false) }}
              >
                Reset
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
