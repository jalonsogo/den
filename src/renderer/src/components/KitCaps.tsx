import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Plug, Globe, Variable, TerminalSquare, FileText } from 'lucide-react'
import { MCP_CATALOG, mcpIcon } from '../lib/mcpCatalog'
import type { ParsedKit } from '../lib/kitSpec'

// Fixed capability order. Non-compact lists render every slot (empty when a kit
// lacks it) so the same capability type lines up in the same column across rows.
const CAP_DEFS = [
  { key: 'mcp', icon: Plug, label: 'Remote MCP' },
  { key: 'net', icon: Globe, label: 'Policies' },
  { key: 'env', icon: Variable, label: 'Env vars' },
  { key: 'cmd', icon: TerminalSquare, label: 'Commands' },
  { key: 'mem', icon: FileText, label: 'Memory' }
] as const

// Visual representation of a kit's spec.yaml — a row of capability icons;
// hovering one shows its detailed contents in a fixed-position popover (so it
// escapes any ancestor's overflow:hidden clip). `compact` drops the text labels
// and packs only the present capabilities, for tight spots like the New Sandbox
// modal; the full list renders fixed positional columns.
export function KitCaps({ p, compact }: { p?: ParsedKit; compact?: boolean }) {
  const [hover, setHover] = useState<{ key: string; top: number; left: number } | null>(null)
  if (!p) return <div className="kit-caps"><span className="kit-cap-empty">—</span></div>
  const domains = p.allowedDomains.length + p.deniedDomains.length
  const items: { key: string; icon: typeof Plug; label: string; count?: number }[] = []
  if (p.mcps.length) items.push({ key: 'mcp', icon: Plug, label: 'Remote MCP', count: p.mcps.length })
  if (domains) items.push({ key: 'net', icon: Globe, label: 'Policies', count: domains })
  if (p.envVars.length) items.push({ key: 'env', icon: Variable, label: 'Env vars', count: p.envVars.length })
  if (p.installCmds.length) items.push({ key: 'cmd', icon: TerminalSquare, label: 'Commands', count: p.installCmds.length })
  if (p.agentContext) items.push({ key: 'mem', icon: FileText, label: 'Memory' })
  if (items.length === 0) return <div className="kit-caps"><span className="kit-cap-empty">No capabilities</span></div>

  const countByKey: Record<string, number | undefined> = {
    mcp: p.mcps.length || undefined, net: domains || undefined,
    env: p.envVars.length || undefined, cmd: p.installCmds.length || undefined, mem: undefined
  }
  const presentByKey: Record<string, boolean> = {
    mcp: p.mcps.length > 0, net: domains > 0, env: p.envVars.length > 0,
    cmd: p.installCmds.length > 0, mem: !!p.agentContext
  }
  // Compact packs only present caps; the full list renders every column in a
  // fixed order (absent ones become empty cells) so they align table-style.
  const cells = compact
    ? items.map((it) => ({ ...it, present: true }))
    : CAP_DEFS.map((c) => ({ key: c.key, icon: c.icon, label: c.label, count: countByKey[c.key], present: presentByKey[c.key] }))

  const enter = (key: string, e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setHover({ key, top: r.bottom + 6, left: r.left })
  }

  const popContent = (key: string) => {
    if (key === 'mcp') return (
      <div className="kit-pop-list">
        {p.mcps.map((id) => {
          const m = MCP_CATALOG.find((x) => x.id === id)
          return (
            <div className="kit-pop-row" key={id}>
              <img className="kit-pop-ic" src={mcpIcon(id)} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
              <span>{m?.name ?? id}</span>
            </div>
          )
        })}
      </div>
    )
    if (key === 'net') return (
      <div className="kit-pop-list">
        {p.allowedDomains.map((d) => <div className="kit-pop-row" key={`a-${d}`}><span className="kit-pop-dot allow" />{d}</div>)}
        {p.deniedDomains.map((d) => <div className="kit-pop-row" key={`d-${d}`}><span className="kit-pop-dot deny" />{d}</div>)}
      </div>
    )
    if (key === 'env') return (
      <div className="kit-pop-list">
        {p.envVars.map((v) => <div className="kit-pop-row kit-pop-mono" key={v}>{v}</div>)}
      </div>
    )
    if (key === 'cmd') return (
      <div className="kit-pop-list">
        {p.installCmds.map((c, i) => <div className="kit-pop-row kit-pop-mono" key={i}>{c}</div>)}
      </div>
    )
    if (key === 'mem') return <div className="kit-pop-memo">{p.agentContext}</div>
    return null
  }

  const titles: Record<string, string> = { mcp: 'Remote MCP servers', net: 'Network policies', env: 'Environment variables', cmd: 'Startup commands', mem: 'Agent memory' }

  return (
    <div className={`kit-caps${compact ? ' compact' : ''}`}>
      {cells.map(({ key, icon: Icon, label, count, present }) =>
        present ? (
          <span
            key={key}
            className="kit-cap-ic"
            onMouseEnter={(e) => enter(key, e)}
            onMouseLeave={() => setHover((h) => (h?.key === key ? null : h))}
          >
            <Icon size={14} />
            {!compact && <span className="kit-cap-lbl">{label}</span>}
            {count != null && <span className="kit-cap-n">{count}</span>}
          </span>
        ) : (
          // Empty capability slot — render a muted "-" so the column reads as
          // "none" rather than an ambiguous blank (full/table list only).
          <span key={key} className="kit-cap-ic is-empty">-</span>
        )
      )}
      {hover && createPortal(
        // Portal to <body> so the fixed-positioned popover escapes any ancestor
        // that forms a containing block for fixed elements (e.g. the modal
        // overlay's backdrop-filter) — otherwise top/left would be offset by
        // that ancestor's padding and the popover lands in the wrong place.
        <div className="kit-pop" style={{ top: hover.top, left: hover.left }}>
          <div className="kit-pop-hd">{titles[hover.key]}</div>
          {popContent(hover.key)}
        </div>,
        document.body
      )}
    </div>
  )
}
