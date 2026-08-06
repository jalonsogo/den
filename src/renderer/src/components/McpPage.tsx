import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Trash2, KeyRound, RefreshCw, Search, X, Check, Globe, TerminalSquare, Info, PackagePlus, FileSearch, ChevronDown
} from 'lucide-react'
import { useStore } from '../store'
import { MCP_CATALOG, mcpIcon } from '../lib/mcpCatalog'
import { bridgeError } from '../lib/utils'
import type { McpServerEntry } from '../types'

// The MCP gateway (sbx v0.38): servers are registered once on the host and
// reused across sandboxes, with OAuth tokens staying host-side. That last part
// is why this lives here rather than in a kit — authorizing from inside a
// sandbox means a browser callback the host can't reach.
//
// A kit can still register an MCP the old way (a `claude mcp add` startup
// command); that path is unchanged and is per-sandbox. This page is the shared
// registry.

// Auth wording varies by sbx build, so classify loosely rather than matching
// exact strings — and treat "no idea" as its own state instead of guessing.
function authState(s: string): { label: string; tone: 'ok' | 'warn' | 'none' } {
  const t = (s || '').toLowerCase()
  if (!t) return { label: '', tone: 'none' }
  if (/expired|invalid|fail/.test(t)) return { label: 'Reauthorize', tone: 'warn' }
  if (/pending|required|needs/.test(t)) return { label: 'Not authorized', tone: 'warn' }
  if (/ok|valid|authorized|active/.test(t)) return { label: 'Authorized', tone: 'ok' }
  return { label: s, tone: 'none' }
}

export function McpPage() {
  const sandboxes = useStore((s) => s.sandboxes)
  const [servers, setServers] = useState<McpServerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // Registration form: a catalog pick, or a hand-entered remote/local server.
  const [adding, setAdding] = useState(false)
  const [mode, setMode] = useState<'remote' | 'local'>('remote')
  const [fName, setFName] = useState('')
  const [fUrl, setFUrl] = useState('')
  const [fCmd, setFCmd] = useState('')
  const [fArgs, setFArgs] = useState('')
  const [query, setQuery] = useState('')
  // OAuth registration extras: scopes recorded with the server, an optional
  // pre-registered client id, and registering without starting a browser flow.
  const [fScopes, setFScopes] = useState('')
  const [fClientId, setFClientId] = useState('')
  const [fSkipAuth, setFSkipAuth] = useState(false)
  const [oauthOpen, setOauthOpen] = useState(false)
  // Per-row: `sbx mcp inspect` output, and the attach-to-sandbox picker.
  const [inspectFor, setInspectFor] = useState<string | null>(null)
  const [inspectOut, setInspectOut] = useState('')
  const [attachFor, setAttachFor] = useState<string | null>(null)

  // Live output from `sbx mcp auth` — it opens a browser and may print a code,
  // so it streams rather than being swallowed.
  const [authOut, setAuthOut] = useState('')
  const [authFor, setAuthFor] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    void window.minipit?.mcpList()
      .then((r) => {
        setServers(r?.servers ?? [])
        setError(r?.ok ? null : (r?.error ?? 'Could not read registered servers.'))
      })
      .catch((e) => setError(bridgeError(e, 'MCP servers')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => window.minipit?.onMcpAuthOutput?.((c) => setAuthOut((o) => o + c)), [])

  const registered = new Set(servers.map((s) => s.name.toLowerCase()))

  const add = async (cfg: {
    name: string; url?: string; command?: string; args?: string; local?: boolean
    scopes?: string; clientId?: string; skipAuth?: boolean
  }) => {
    setBusy(cfg.name); setMsg(null)
    const r = await window.minipit?.mcpAdd(cfg).catch((e) => ({ ok: false as const, error: bridgeError(e, 'Register server') }))
    setBusy(null)
    if (r?.ok) {
      setMsg({ ok: true, text: `Registered "${cfg.name}". Authorize it if the server uses OAuth.` })
      setAdding(false); setFName(''); setFUrl(''); setFCmd(''); setFArgs('')
      setFScopes(''); setFClientId(''); setFSkipAuth(false); setOauthOpen(false)
      load()
    } else {
      setMsg({ ok: false, text: r?.error || `Could not register "${cfg.name}".` })
    }
  }

  const remove = async (name: string) => {
    if (!window.confirm(`Remove the MCP server "${name}"? Sandboxes referencing it will stop finding it.`)) return
    setBusy(name); setMsg(null)
    const r = await window.minipit?.mcpRemove(name).catch((e) => ({ ok: false as const, error: bridgeError(e, 'Remove server') }))
    setBusy(null)
    setMsg(r?.ok ? { ok: true, text: `Removed "${name}".` } : { ok: false, text: r?.error || 'Remove failed.' })
    load()
  }

  const authorize = async (name: string) => {
    setAuthFor(name); setAuthOut(''); setBusy(name); setMsg(null)
    const r = await window.minipit?.mcpAuth(name).catch((e) => ({ ok: false as const, error: bridgeError(e, 'Authorize') }))
    setBusy(null)
    setMsg(r?.ok
      ? { ok: true, text: `Authorized "${name}".` }
      : { ok: false, text: r?.error || `Authorization for "${name}" did not complete.` })
    load()
  }

  const inspect = async (name: string) => {
    if (inspectFor === name) { setInspectFor(null); return }
    setInspectFor(name); setInspectOut('Loading…')
    const r = await window.minipit?.mcpInspect(name)
      .catch((e) => ({ ok: false as const, error: bridgeError(e, 'Inspect') }))
    setInspectOut(r?.ok ? (r.raw || '(no output)') : (r?.error || 'Inspect failed.'))
  }

  // Attach to an ALREADY RUNNING sandbox. Creation-time attachment is a
  // different mechanism — --static-mcp, chosen in New Sandbox.
  const attach = async (name: string, sandbox: string) => {
    setAttachFor(null); setBusy(name); setMsg(null)
    const r = await window.minipit?.mcpLoad(name, sandbox)
      .catch((e) => ({ ok: false as const, error: bridgeError(e, 'Add to sandbox') }))
    setBusy(null)
    setMsg(r?.ok
      ? { ok: true, text: `Added "${name}" to ${sandbox}.` }
      : { ok: false, text: r?.error || `Could not add "${name}" to ${sandbox}.` })
  }

  const running = sandboxes.filter((s) => s.status === 'running')

  const shown = MCP_CATALOG.filter((m) =>
    !query.trim() || `${m.name} ${m.category} ${m.description}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="page">
      <div className="page-hdr">
        <div>
          <div className="page-title">MCP servers</div>
          <div className="page-sub">
            Registered once here and reused by every sandbox through the gateway. OAuth stays on this Mac.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : undefined} /> Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding((v) => !v)}>
            <Plus size={14} /> Register server
          </button>
        </div>
      </div>

      <div className="page-body" style={{ padding: '8px 28px 28px' }}>
        {msg && (
          <div className={`np-banner ${msg.ok ? 'ok' : 'err'}`} style={{ marginBottom: 12 }}>
            <span className="np-banner-txt">{msg.text}</span>
          </div>
        )}

        {adding && (
          <div className="mcp-add-form">
            <div className="np-dec-seg" style={{ marginBottom: 10 }}>
              <button className={`np-dec-opt${mode === 'remote' ? ' on' : ''}`} onClick={() => setMode('remote')}>
                <Globe size={13} /> Remote
              </button>
              <button className={`np-dec-opt${mode === 'local' ? ' on' : ''}`} onClick={() => setMode('local')}>
                <TerminalSquare size={13} /> Local
              </button>
            </div>
            <div className="kit-list-row">
              <input className="finput" placeholder="name (e.g. notion)" value={fName} onChange={(e) => setFName(e.target.value)} />
              {mode === 'remote'
                ? <input className="finput" placeholder="https://mcp.example.com/mcp" value={fUrl} onChange={(e) => setFUrl(e.target.value)} />
                : <>
                    <input className="finput" placeholder="command (e.g. npx)" value={fCmd} onChange={(e) => setFCmd(e.target.value)} />
                    <input className="finput" placeholder="args (e.g. @playwright/mcp@latest)" value={fArgs} onChange={(e) => setFArgs(e.target.value)} />
                  </>}
            </div>
            <button className="mcp-oauth-toggle" onClick={() => setOauthOpen((v) => !v)}>
              <ChevronDown size={13} style={{ transform: oauthOpen ? 'none' : 'rotate(-90deg)' }} />
              OAuth options
            </button>
            {oauthOpen && (
              <div className="kit-list-row" style={{ marginTop: 6 }}>
                <input className="finput" placeholder="scopes (space or comma separated)"
                       value={fScopes} onChange={(e) => setFScopes(e.target.value)} />
                <input className="finput" placeholder="client id (if pre-registered)"
                       value={fClientId} onChange={(e) => setFClientId(e.target.value)} />
                <label className="mcp-skip">
                  <input type="checkbox" checked={fSkipAuth} onChange={(e) => setFSkipAuth(e.target.checked)} />
                  Register without authorizing
                </label>
              </div>
            )}
            <div className="np-add-form-actions" style={{ marginTop: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
              <button
                className="btn btn-default btn-sm"
                disabled={!fName.trim() || (mode === 'remote' ? !fUrl.trim() : !fCmd.trim()) || busy !== null}
                onClick={() => add({
                  name: fName,
                  ...(mode === 'remote'
                    ? { url: fUrl }
                    : { command: fCmd, args: fArgs, local: true }),
                  scopes: fScopes, clientId: fClientId, skipAuth: fSkipAuth
                })}
              >
                Register
              </button>
            </div>
          </div>
        )}

        {/* Registered servers */}
        <div className="lib-head">
          <span>REGISTERED{servers.length ? ` · ${servers.length}` : ''}</span>
        </div>
        {error && <div className="np-empty">Couldn’t read the registry: {error}</div>}
        {!error && !loading && servers.length === 0 && (
          <div className="np-empty">
            None yet. Register one below, or add your own — a sandbox reaches them through the gateway.
          </div>
        )}
        {servers.map((s) => {
          const st = authState(s.auth)
          return (
            <div className="lib-row" key={s.name}>
              <div className="lib-primary">
                <img src={mcpIcon(s.name.toLowerCase())} alt="" className="mcp-row-ic"
                     onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
                <span>{s.name}</span>
                {st.label && (
                  <span className={`rt-badge ${st.tone === 'ok' ? 'rt-badge-ok' : st.tone === 'warn' ? 'rt-badge-update' : ''}`}>
                    {st.label}
                  </span>
                )}
              </div>
              <span className="mcp-row-target">{s.url || s.command || '—'}</span>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }} className="mcp-row-actions">
                <div className="kit-add-wrap">
                  <button
                    className="btn btn-default btn-sm"
                    title={running.length ? 'Attach to a running sandbox' : 'No running sandboxes'}
                    disabled={busy === s.name || running.length === 0}
                    onClick={() => setAttachFor(attachFor === s.name ? null : s.name)}
                  >
                    <PackagePlus size={14} /> Add to sandbox
                  </button>
                  {attachFor === s.name && (
                    <div className="kit-add-menu mcp-attach-menu">
                      <div className="kit-add-label">Add to running sandbox</div>
                      {running.map((sb) => (
                        <button key={sb.id} className="kit-add-sb" onClick={() => attach(s.name, sb.name)}>
                          <span className="kit-add-dot on" />
                          <span className="kit-add-sb-name">{sb.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button className="btn btn-ghost btn-sm" title="sbx mcp inspect" onClick={() => inspect(s.name)}>
                  <FileSearch size={13} /> Inspect
                </button>
                <button className="btn btn-ghost btn-sm" disabled={busy === s.name} onClick={() => authorize(s.name)}>
                  <KeyRound size={13} /> {busy === s.name && authFor === s.name ? 'Authorizing…' : 'Authorize'}
                </button>
                <button className="btn btn-ghost btn-sm tpl-icon-btn" title="Remove" disabled={busy === s.name}
                        onClick={() => remove(s.name)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          )
        })}
        {inspectFor && (
          <div className="rt-output" style={{ marginTop: 4 }}>
            <pre className="logs-pre">{inspectOut}</pre>
          </div>
        )}

        {authFor && authOut && (
          <div className="rt-output" style={{ marginTop: 10 }}>
            <pre className="logs-pre">{authOut}</pre>
          </div>
        )}

        {/* One-click registration from den's curated catalog. */}
        <div className="lib-head" style={{ marginTop: 22 }}>
          <span>CATALOG</span>
          <div className="mcp-search">
            <Search size={13} />
            <input value={query} placeholder="Search servers…" onChange={(e) => setQuery(e.target.value)} />
            {query && <button onClick={() => setQuery('')}><X size={12} /></button>}
          </div>
        </div>
        <div className="mcp-grid">
          {shown.map((m) => {
            const on = registered.has(m.id.toLowerCase())
            return (
              <button
                key={m.id}
                className={`mcp-card${on ? ' on' : ''}`}
                disabled={on || busy === m.id}
                title={on ? `${m.name} is already registered` : `${m.name} — ${m.description}`}
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

        <div className="np-note" style={{ marginTop: 14 }}>
          <Info size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Attach a registered server to a sandbox with <code>--static-mcp &lt;name&gt;</code> at run.
          Leave it off and the agent discovers servers itself through the gateway’s
          <code>mcp-find</code> tool.
        </div>
      </div>
    </div>
  )
}
