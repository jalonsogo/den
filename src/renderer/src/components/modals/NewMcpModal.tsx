import { useState } from 'react'
import { Plus, Search, X, Check, Globe, TerminalSquare, ChevronDown } from 'lucide-react'
import { useStore } from '../../store'
import { MCP_CATALOG, mcpIcon } from '../../lib/mcpCatalog'
import { bridgeError } from '../../lib/utils'

// Adding an MCP to the gateway. A modal rather than a panel on the page: the
// catalog is 50+ entries and, inline, it shoved the registered list — the
// reason to be on that page — off the bottom of the screen. This matches how
// New Sandbox and New Kit already work.
export function NewMcpModal({ registered, onDone }: { registered: Set<string>; onDone: () => void }) {
  const setModal = useStore((s) => s.setModal)
  const [mode, setMode] = useState<'remote' | 'local'>('remote')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [cmd, setCmd] = useState('')
  const [args, setArgs] = useState('')
  const [scopes, setScopes] = useState('')
  const [clientId, setClientId] = useState('')
  const [skipAuth, setSkipAuth] = useState(false)
  const [oauthOpen, setOauthOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('All')
  // Catalog vs hand-entered, as a tab bar rather than a separator halfway down.
  const [tab, setTab] = useState<'catalog' | 'manual'>('catalog')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const close = () => setModal(null)

  const add = async (cfg: {
    name: string; url?: string; command?: string; args?: string; local?: boolean
    scopes?: string; clientId?: string; skipAuth?: boolean
  }) => {
    setBusy(cfg.name); setError('')
    const r = await window.minipit?.mcpAdd(cfg)
      .catch((e) => ({ ok: false as const, error: bridgeError(e, 'Add an MCP') }))
    setBusy(null)
    if (r?.ok) { onDone(); close(); return }
    // sbx narrates registration on stderr (probing…, discovering…) and only the
    // last line usually says what went wrong — lead with that, keep the rest.
    const raw = (r?.error || `Could not add "${cfg.name}".`).trim()
    const fatal = raw.split('\n').reverse().find((l) => /error|failed|refused|denied/i.test(l))
    setError(fatal ? `${fatal.trim()}\n\n${raw}` : raw)
  }

  const cats = ['All', ...Array.from(new Set(MCP_CATALOG.map((m) => m.category)))]
  const q = query.trim().toLowerCase()
  const shown = MCP_CATALOG.filter((m) =>
    (cat === 'All' || m.category === cat) &&
    (!q || m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)))
  const canSubmit = !!name.trim() && (mode === 'remote' ? !!url.trim() : !!cmd.trim()) && !busy

  return (
    <div className="overlay" onMouseDown={close}>
      {/* Same width as the kit composer — the catalog is a wide grid, and at the
          default modal width it became a three-column column of scrolling. */}
      <div className="modal modal-adaptive" style={{ width: 'min(1200px, 100%)' }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="m-hdr">
          <div className="m-title">Add an MCP</div>
          <div className="m-sub">
            Registered on this Mac and reachable from every sandbox through the gateway.
          </div>
        </div>

        <div className="m-body">
          <div className="kit-tabs" style={{ marginBottom: 12 }}>
            <button className={tab === 'catalog' ? 'on' : ''} onClick={() => setTab('catalog')}>Catalog</button>
            <button className={tab === 'manual' ? 'on' : ''} onClick={() => setTab('manual')}>Manual</button>
          </div>

          {error && (
            <div className="np-banner err" style={{ marginBottom: 12 }}>
              <span className="np-banner-txt" style={{ whiteSpace: 'pre-wrap' }}>{error}</span>
            </div>
          )}

          {tab === 'catalog' ? (
            <>
              <div className="mcp-filter">
                <div className="mcp-search">
                  <Search size={13} className="mcp-search-ic" />
                  <input value={query} placeholder="Search servers…" onChange={(e) => setQuery(e.target.value)} />
                  {query && <button className="mcp-search-x" onClick={() => setQuery('')}><X size={12} /></button>}
                </div>
                <select className="mcp-cat" value={cat} onChange={(e) => setCat(e.target.value)}>
                  {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="mcp-grid">
                {/* Mirrors the kit composer: a custom entry sits first in the
                    grid, so "not in the list" is visible without hunting. */}
                <button className="mcp-card mcp-card-custom" onClick={() => setTab('manual')} title="Enter a server manually">
                  <span className="mcp-card-ic"><Plus size={18} /></span>
                  <span className="mcp-card-name">Custom MCP</span>
                </button>
                {shown.map((m) => {
                  const on = registered.has(m.id.toLowerCase())
                  return (
                    <button
                      key={m.id}
                      className={`mcp-card${on ? ' on' : ''}`}
                      disabled={on || busy !== null}
                      title={on ? `${m.name} is already added` : `${m.name} — ${m.description}`}
                      onClick={() => add({ name: m.id, url: m.url })}
                    >
                      <img src={mcpIcon(m.id)} alt="" />
                      <span className="mcp-card-name">{m.name}</span>
                      {on ? <Check size={13} className="mcp-card-on" /> : busy === m.id ? <span className="mcp-card-busy">…</span> : null}
                    </button>
                  )
                })}
                {shown.length === 0 && <div className="mcp-empty">No servers match.</div>}
              </div>
              <div className="fhint">Adding from the catalog registers it immediately; authorize after if the server uses OAuth.</div>
            </>
          ) : (
            <div className="fg">
              <div className="np-dec-seg" style={{ marginBottom: 10 }}>
                <button className={`np-dec-opt${mode === 'remote' ? ' on' : ''}`} onClick={() => setMode('remote')}>
                  <Globe size={13} /> Remote
                </button>
                <button className={`np-dec-opt${mode === 'local' ? ' on' : ''}`} onClick={() => setMode('local')}>
                  <TerminalSquare size={13} /> Local
                </button>
              </div>
              <div className="kit-list-row">
                <input className="finput" placeholder="name (e.g. notion)" value={name} onChange={(e) => setName(e.target.value)} />
                {mode === 'remote'
                  ? <input className="finput" placeholder="https://mcp.example.com/mcp" value={url} onChange={(e) => setUrl(e.target.value)} />
                  : <>
                      <input className="finput" placeholder="command (e.g. npx)" value={cmd} onChange={(e) => setCmd(e.target.value)} />
                      <input className="finput" placeholder="args (e.g. @playwright/mcp@latest)" value={args} onChange={(e) => setArgs(e.target.value)} />
                    </>}
              </div>

              <button className="kit-info-toggle" onClick={() => setOauthOpen((v) => !v)}>
                <ChevronDown size={13} style={{ transform: oauthOpen ? 'none' : 'rotate(-90deg)' }} />
                OAuth options
              </button>
              {oauthOpen && (
                <>
                  <div className="kit-list-row" style={{ marginTop: 6 }}>
                    <input className="finput" placeholder="scopes (space or comma separated)"
                           value={scopes} onChange={(e) => setScopes(e.target.value)} />
                    <input className="finput" placeholder="client id (if pre-registered)"
                           value={clientId} onChange={(e) => setClientId(e.target.value)} />
                  </div>
                  <div className="mcp-sw-row">
                    <div>
                      <div className="mcp-sw-lbl">Add without authorizing</div>
                      <div className="mcp-sw-sub">Register now and run the browser flow later.</div>
                    </div>
                    <button className={`s-toggle${skipAuth ? ' on' : ''}`} onClick={() => setSkipAuth((v) => !v)} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="m-ftr">
          <button className="btn btn-ghost" onClick={close}>Cancel</button>
          {/* Only the manual tab has something to submit — a catalog card
              registers on click. */}
          {tab === 'manual' && (
            <button className="btn btn-primary" disabled={!canSubmit} onClick={() => add({
              name,
              ...(mode === 'remote' ? { url } : { command: cmd, args, local: true }),
              scopes, clientId, skipAuth
            })}>
              {busy ? 'Adding…' : 'Add MCP'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
