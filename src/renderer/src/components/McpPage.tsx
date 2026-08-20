import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Plug, Trash2, KeyRound, RefreshCw, Info, PackagePlus,
  Zap, Boxes, ShieldCheck, Search, MoreVertical, Copy, TerminalSquare, FolderOpen
} from 'lucide-react'
import { useStore } from '../store'
import { mcpIcon } from '../lib/mcpCatalog'
import { bridgeError } from '../lib/utils'
import { NewMcpModal } from './modals/NewMcpModal'
import { EmptyState } from './EmptyState'
import { authState } from '../lib/mcpAuth'
import type { McpServerEntry } from '../types'

// The MCP gateway (sbx v0.38): servers are registered once on the host and
// reused across sandboxes, with OAuth tokens staying host-side. That last part
// is why this lives here rather than in a kit — authorizing from inside a
// sandbox means a browser callback the host can't reach.
//
// A kit can still register an MCP the old way (a `claude mcp add` startup
// command); that path is unchanged and is per-sandbox. This page is the shared
// registry.

// `sbx mcp inspect` prints aligned "Key: value" lines, with indented children
// under a heading (Issuer/Registration under OAuth). That's structured data, so
// render it as rows — a black terminal block for six fields was den showing its
// plumbing instead of the answer.
interface InspectRow { key: string; value: string; depth: number }
function parseInspect(raw: string): InspectRow[] | null {
  const rows: InspectRow[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    const m = /^(\s*)([^:]{1,40}):\s*(.*)$/.exec(line)
    // Anything that isn't a key/value line means this isn't the shape we think
    // it is — fall back to the raw text rather than showing a mangled table.
    if (!m) return null
    rows.push({ key: m[2].trim(), value: m[3].trim(), depth: m[1].length > 0 ? 1 : 0 })
  }
  return rows.length ? rows : null
}

// Second line of defence behind the main-process parser. A server name is an
// identifier — notion, vercel, playwright — never a sentence. When sbx says
// "No MCP servers registered" and something upstream mistakes that for a row,
// the damage is a fake server offering Authorize and Remove; dropping anything
// with whitespace in its name means the worst case is showing nothing.
const isServer = (s: McpServerEntry): boolean => !!s.name && !/\s/.test(s.name)

// sbx v0.38 reports authorization nowhere den can read it back: `mcp ls` has no
// column for it and `mcp inspect` only says whether the server *requires* OAuth
// (`OAuth: required`). The one moment the truth is observable is the end of a
// successful `sbx mcp auth`, which prints `MCP server "x" authorized` — so den
// records that and uses it when sbx offers nothing. Anything sbx does say wins
// over this, so a later revocation isn't masked by a stale note.
const AUTH_RECORD_KEY = 'minipit:mcp-authorized:v1'
type AuthRecord = Record<string, string>
function readAuthRecord(): AuthRecord {
  try { return JSON.parse(localStorage.getItem(AUTH_RECORD_KEY) || '{}') as AuthRecord } catch { return {} }
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
  const [inspectLoading, setInspectLoading] = useState(false)
  const [attachFor, setAttachFor] = useState<string | null>(null)

  // Live output from `sbx mcp auth` — it opens a browser and may print a code,
  // so it streams rather than being swallowed.
  const [authOut, setAuthOut] = useState('')
  const [authFor, setAuthFor] = useState<string | null>(null)
  const [authRec, setAuthRec] = useState<AuthRecord>(readAuthRecord)

  const rememberAuth = (name: string, on: boolean) => {
    const next = { ...readAuthRecord() }
    if (on) next[name] = new Date().toISOString()
    else delete next[name]
    localStorage.setItem(AUTH_RECORD_KEY, JSON.stringify(next))
    setAuthRec(next)
  }

  // Row "⋮" menu — same mechanism as the kit and template rows.
  const [moreFor, setMoreFor] = useState<string | null>(null)
  const [morePos, setMorePos] = useState<{ top: number; right: number } | null>(null)

  const toggleMore = (name: string, e: React.MouseEvent) => {
    if (moreFor === name) { setMoreFor(null); return }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMorePos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    setMoreFor(name)
  }

  useEffect(() => {
    if (!moreFor) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t?.closest('.kit-more-menu') && !t?.closest('.kit-more-btn')) setMoreFor(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [moreFor])

  const copy = (text: string, what: string) => {
    if (!text) return
    navigator.clipboard.writeText(text)
      .then(() => setMsg({ ok: true, text: `${what} copied.` }))
      .catch(() => setMsg({ ok: false, text: 'Could not copy to the clipboard.' }))
  }

  // The `sbx mcp add` line that would recreate this registration elsewhere.
  const addCommand = (s: McpServerEntry): string =>
    s.url
      ? `sbx mcp add ${s.name} --url ${s.url}`
      : `sbx mcp add ${s.name} --local --command ${s.command}`

  const load = useCallback(() => {
    setLoading(true)
    void window.minipit?.mcpList()
      .then((r) => {
        setServers((r?.servers ?? []).filter(isServer))
        setError(r?.ok ? null : (r?.error ?? 'Could not read registered servers.'))
      })
      .catch((e) => setError(bridgeError(e, 'MCP servers')))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => window.minipit?.onMcpAuthOutput?.((c) => setAuthOut((o) => o + c)), [])

  const registered = new Set(servers.map((s) => s.name.toLowerCase()))
  // Nothing registered and nothing to report — the page is just the empty state,
  // so the body switches to a flex column and lets it centre itself.
  const zero = !error && !loading && servers.length === 0

  const remove = async (name: string) => {
    if (!window.confirm(`Remove the MCP server "${name}"? Sandboxes referencing it will stop finding it.`)) return
    setBusy(name); setMsg(null)
    const r = await window.minipit?.mcpRemove(name).catch((e) => ({ ok: false as const, error: bridgeError(e, 'Remove server') }))
    setBusy(null)
    if (r?.ok) rememberAuth(name, false)
    setMsg(r?.ok ? { ok: true, text: `Removed "${name}".` } : { ok: false, text: r?.error || 'Remove failed.' })
    load()
  }

  const authorize = async (name: string) => {
    setAuthFor(name); setAuthOut(''); setBusy(name); setMsg(null)
    const r = await window.minipit?.mcpAuth(name).catch((e) => ({ ok: false as const, error: bridgeError(e, 'Authorize') }))
    setBusy(null)
    if (r?.ok) rememberAuth(name, true)
    setAuthFor(null)
    setMsg(r?.ok
      ? { ok: true, text: `Authorized "${name}".` }
      : { ok: false, text: r?.error || `Authorization for "${name}" did not complete.` })
    load()
  }

  const inspect = async (name: string) => {
    if (inspectFor === name) { setInspectFor(null); return }
    // Loading is its own state, not a sentinel string: as text it fell through
    // parseInspect (no "key: value" in "Loading…") into the raw terminal
    // fallback, so opening Info flashed a black block before the rows landed.
    setInspectFor(name); setInspectOut(''); setInspectLoading(true)
    const r = await window.minipit?.mcpInspect(name)
      .catch((e) => ({ ok: false as const, error: bridgeError(e, 'Inspect') }))
    setInspectLoading(false)
    setInspectOut(r?.ok ? (r.raw ?? '') : (r?.error || 'Inspect failed.'))
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

      <div className={`page-body${zero ? ' page-body-center' : ''}`}>
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
        {zero && (
          <EmptyState
            icon={<Plug size={34} />}
            eyebrow={<><Zap size={11} /> Model Context Protocol</>}
            title="Give your agents tools"
            sub={<>
              Add a server once here and every sandbox can reach it through the gateway —
              no per-sandbox setup, and no credentials inside the container.
            </>}
            actions={
              <button className="btn btn-primary" onClick={() => setModal('new-mcp')}>
                <Plus size={15} />
                Add MCP server
              </button>
            }
            features={[
              { icon: <Boxes size={14} />, title: 'Add once, use everywhere',
                sub: 'Registered on this Mac and shared by every sandbox' },
              { icon: <ShieldCheck size={14} />, title: 'Credentials stay home',
                sub: 'OAuth runs on the host; tokens never enter a sandbox' },
              { icon: <Search size={14} />, title: 'Static or discovered',
                sub: 'Pre-load servers at creation, or let the agent find them' },
            ]}
          />
        )}

        {servers.length > 0 && (
        <div className="lib-tbl">
          <div className="lib-hdr lib-hdr-mcp">
            <span>SERVER</span>
            <span>TARGET</span>
            <span>AUTH</span>
            <span />
          </div>
        {servers.map((s) => {
          // What sbx says wins; den's own record of a successful authorization
          // only fills the silence it leaves behind.
          const reported = authState(s.auth)
          const noted = authRec[s.name]
          const st = reported.label ? reported
            : noted ? { label: 'Authorized', tone: 'ok' as const }
            : { label: '', tone: 'none' as const }
          const stTitle = reported.label ? s.auth
            : noted ? `Authorized from den on ${new Date(noted).toLocaleString()} — sbx doesn't report live authorization state`
            : ''
          const local = !s.url && !!s.command
          // Only offer Finder for a command that is an actual path on this Mac.
          // `npx @playwright/mcp@latest` has no folder to open.
          const localPath = local && s.command.startsWith('/') ? s.command.split(/\s+/)[0] : ''
          return (
            <div className="mcp-entry" key={s.name}>
              <div className="lib-row lib-row-mcp">
                <div className="lib-primary">
                  <img src={mcpIcon(s.name.toLowerCase())} alt="" className="mcp-row-ic"
                       onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
                  <span>{s.name}</span>
                </div>
                <span className="mcp-row-target" title={s.url || s.command}>{s.url || s.command || '—'}</span>
                <span className="mcp-row-auth">
                  {st.label
                    // The raw string sits in the tooltip: when sbx words it in
                    // some way den doesn't know, the badge is still checkable.
                    ? <span className={`rt-badge ${st.tone === 'ok' ? 'rt-badge-ok' : st.tone === 'warn' ? 'rt-badge-update' : ''}`}
                            title={stTitle}>{st.label}</span>
                    : <span className="lib-muted">—</span>}
                </span>
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
                  <button className="btn btn-ghost btn-sm" title="sbx mcp inspect" onClick={() => inspect(s.name)}>
                    <Info size={13} /> Info
                  </button>
                  <button
                    className={`btn btn-ghost btn-sm tpl-icon-btn kit-more-btn${moreFor === s.name ? ' active' : ''}`}
                    title="More…"
                    disabled={busy === s.name}
                    onClick={(e) => toggleMore(s.name, e)}
                  >
                    <MoreVertical size={15} />
                  </button>
                  {moreFor === s.name && morePos && (
                    <div className="kit-more-menu" style={{ top: morePos.top, right: morePos.right }}>
                      <button className="kit-more-item" onClick={() => { setMoreFor(null); authorize(s.name) }}>
                        <KeyRound size={14} /> {st.tone === 'ok' ? 'Reauthorize' : 'Authorize'}
                      </button>
                      <button className="kit-more-item" onClick={() => { setMoreFor(null); copy(s.url || s.command, 'Endpoint') }}>
                        <Copy size={14} /> Copy {local ? 'command' : 'endpoint'}
                      </button>
                      {/* Reproduces this registration on another machine — the
                          same idea as a kit's "Copy install command". */}
                      <button className="kit-more-item" onClick={() => { setMoreFor(null); copy(addCommand(s), 'Command') }}>
                        <TerminalSquare size={14} /> Copy add command
                      </button>
                      {localPath && (
                        <button className="kit-more-item" onClick={() => { setMoreFor(null); window.minipit?.openInFinder(localPath) }}>
                          <FolderOpen size={14} /> Open in Finder
                        </button>
                      )}
                      <div className="kit-more-sep" />
                      <button className="kit-more-item danger" onClick={() => { setMoreFor(null); remove(s.name) }}>
                        <Trash2 size={14} /> Remove server
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {inspectFor === s.name && (
                <div className="mcp-info">
                  {inspectLoading ? (
                    <div className="mcp-info-row"><span className="mcp-info-k">Loading…</span></div>
                  ) : (() => {
                    const rows = parseInspect(inspectOut)
                    // Not key/value — show it as it came, but in this panel
                    // rather than a console block, with a way to hand it over.
                    if (!rows) {
                      return (
                        <div className="mcp-info-rawwrap">
                          <pre className="mcp-info-raw">
                            {inspectOut.trim() || `sbx returned no details for "${s.name}".`}
                          </pre>
                          {inspectOut.trim() && (
                            <button className="btn btn-ghost btn-sm" onClick={() => copy(inspectOut, 'Output')}>
                              <Copy size={13} /> Copy output
                            </button>
                          )}
                        </div>
                      )
                    }
                    // If inspect says nothing about authorization, say what the
                    // probe got instead of leaving the question unanswered —
                    // "not reported" is a different fact from "not authorized".
                    const shown = rows.some((r) => /auth|token|credential/i.test(r.key))
                      ? rows
                      : [{ key: 'Authorization', value: s.auth || 'not reported by sbx', depth: 0 }, ...rows]
                    return shown.map((r, i) => (
                      <div className={`mcp-info-row${r.depth ? ' sub' : ''}`} key={`${r.key}-${i}`}>
                        <span className="mcp-info-k">{r.key}</span>
                        {/^https?:\/\//i.test(r.value)
                          ? <a className="mcp-info-link" onClick={() => window.minipit?.openPath(r.value)}>{r.value}</a>
                          : <span className="mcp-info-v">{r.value || '—'}</span>}
                      </div>
                    ))
                  })()}
                </div>
              )}
              {/* Authorization happens in a browser on the host. What matters
                  while it runs is that den is waiting and where the page is —
                  not the transcript of the command producing it. */}
              {authFor === s.name && (() => {
                const url = /(https?:\/\/\S+)/.exec(authOut.replace(/\s+/g, ' '))?.[1]
                return (
                  <div className="mcp-authing">
                    <RefreshCw size={13} className="spin" />
                    <span>Waiting for you to authorize <strong>{s.name}</strong> in your browser…</span>
                    {url && (
                      <button className="btn btn-ghost btn-sm" onClick={() => window.minipit?.openPath(url)}>
                        Open the page again
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>
          )
        })}
        </div>
        )}

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
