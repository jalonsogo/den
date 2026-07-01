import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Plug, Globe, Variable, TerminalSquare, FileText } from 'lucide-react'
import { MCP_CATALOG, mcpIcon } from '../lib/mcpCatalog'
import type { ParsedKit } from '../lib/kitSpec'

// Visual representation of a kit's spec.yaml — a left-aligned row of capability
// icons; hovering one shows its detailed contents in a fixed-position popover
// (so it escapes any ancestor's overflow:hidden clip). `compact` drops the text
// labels for tight spots like the New Sandbox modal (icons + counts only).
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
      {items.map(({ key, icon: Icon, label, count }) => (
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
      ))}
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
