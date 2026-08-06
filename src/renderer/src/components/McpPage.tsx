import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Plug, Trash2, KeyRound, RefreshCw, Info, PackagePlus, FileSearch,
  Zap, Boxes, ShieldCheck, Search
} from 'lucide-react'
import { useStore } from '../store'
import { mcpIcon } from '../lib/mcpCatalog'
import { bridgeError } from '../lib/utils'
import { NewMcpModal } from './modals/NewMcpModal'
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
  const setModal = useStore((s) => s.setModal)
  const modal = useStore((s) => s.modal)
  const [servers, setServers] = useState<McpServerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

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

  return (
    <div className="page">
      {/* .page-hdr is a fixed 45px single-line row — title and actions only.
          Anything explanatory belongs in the body, not crammed in here. */}
      <div className="page-hdr">
        <span className="page-title">MCP servers</span>
        <span className="lib-badge" style={{ marginLeft: 8 }}>Gateway</span>
      </div>

      <div className="page-subbar">
        <span className="mcp-subbar-note">
          Registered once on this Mac and reused by every sandbox. OAuth stays here.
        </span>
        <div className="page-subbar-actions">
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : undefined} /> Refresh
          </button>
          {/* The empty state carries its own CTA — two would compete. */}
          {servers.length > 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => setModal('new-mcp')}>
              <Plus size={14} /> Add an MCP
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {msg && (
          <div className={`np-banner ${msg.ok ? 'ok' : 'err'}`} style={{ marginBottom: 12 }}>
            <span className="np-banner-txt">{msg.text}</span>
          </div>
        )}

        {error && <div className="np-banner err" style={{ marginBottom: 12 }}><span className="np-banner-txt">{error}</span></div>}

        {/* Empty state modelled on the dashboard's welcome screen: centred, one
            CTA, and three boxes explaining what the gateway buys you. The row
            actions (Authorize, Add to sandbox…) belong to a server — showing
            them with nothing registered was nonsense. */}
        {!error && !loading && servers.length === 0 && (
          <div className="home-empty">
            <Plug size={34} className="mcp-zero-mark" />
            <span className="home-empty-eyebrow">
              <Zap size={11} />
              Model Context Protocol
            </span>
            <h1 className="home-empty-title">Give your agents tools</h1>
            <p className="home-empty-sub">
              Add a server once here and every sandbox can reach it through the gateway —
              no per-sandbox setup, and no credentials inside the container.
            </p>
            <div className="home-empty-actions">
              <button className="btn btn-primary" onClick={() => setModal('new-mcp')}>
                <Plus size={15} />
                Add MCP server
              </button>
            </div>
            <div className="home-empty-features">
              <div className="home-empty-feat">
                <Boxes size={14} className="home-empty-feat-ic" />
                <span className="home-empty-feat-title">Add once, use everywhere</span>
                <span className="home-empty-feat-sub">Registered on this Mac and shared by every sandbox</span>
              </div>
              <div className="home-empty-feat">
                <ShieldCheck size={14} className="home-empty-feat-ic" />
                <span className="home-empty-feat-title">Credentials stay home</span>
                <span className="home-empty-feat-sub">OAuth runs on the host; tokens never enter a sandbox</span>
              </div>
              <div className="home-empty-feat">
                <Search size={14} className="home-empty-feat-ic" />
                <span className="home-empty-feat-title">Static or discovered</span>
                <span className="home-empty-feat-sub">Pre-load servers at creation, or let the agent find them</span>
              </div>
            </div>
          </div>
        )}

        {servers.map((s) => {
          const st = authState(s.auth)
          return (
            <div key={s.name}>
              <div className="lib-row">
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
                <div className="mcp-row-actions">
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
                  <button className="btn btn-ghost btn-sm tpl-icon-btn" title="Inspect" onClick={() => inspect(s.name)}>
                    <FileSearch size={15} />
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
              {inspectFor === s.name && (
                <div className="rt-output" style={{ margin: '2px 0 10px' }}>
                  <pre className="logs-pre">{inspectOut}</pre>
                </div>
              )}
              {authFor === s.name && authOut && (
                <div className="rt-output" style={{ margin: '2px 0 10px' }}>
                  <pre className="logs-pre">{authOut}</pre>
                </div>
              )}
            </div>
          )
        })}

      </div>

      {modal === 'new-mcp' && <NewMcpModal registered={registered} onDone={load} />}

      {/* Docked at the foot of the page, outside the scroll area, so the
          explanation stays in view rather than hiding under the list. Hidden
          while empty — the empty state already explains the gateway. */}
      {servers.length > 0 && (
        <div className="mcp-foot">
          <Info size={13} />
          <span>
            Pre-load servers into a new sandbox from <strong>New Sandbox</strong> (static mode).
            Choose none and the agent discovers them itself through the gateway.
          </span>
        </div>
      )}

    </div>
  )
}
