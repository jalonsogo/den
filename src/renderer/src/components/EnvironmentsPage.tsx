import { useEffect, useState, useCallback } from 'react'
import {
  FileCode2, Plus, RefreshCw, Play, Trash2, ChevronDown, Layers,
  GitBranch, ShieldCheck, AlertTriangle, Boxes, Terminal
} from 'lucide-react'
import { useStore } from '../store'
import { EmptyState } from './EmptyState'
import { parseSbxEnv, envItemCount, hostRefs, type EnvSummary } from '../lib/sbxEnv'
import type { SbxEnvFile } from '../types'

// Sandbox environments (sbx v0.39, experimental).
//
// A `.sbxenv.yaml` sits in a project and declares the whole sandbox — agent,
// workspace, kits, env, secrets, ports, limits — so a contributor gets the same
// environment instead of instructions for building one. den reads and runs
// them; it never writes one, because the file belongs to the project's repo and
// round-tripping it through a form is how comments and ordering get lost.
//
// Provisioning goes through `sbx env create`, not `env run`: `run` also opens an
// interactive session, which den doesn't need — the sandbox it creates appears
// in the normal list, where den's own terminal and every other action work on it.

interface Row extends SbxEnvFile {
  summary?: EnvSummary
  error?: string
}

export function EnvironmentsPage() {
  const setActivePage = useStore((s) => s.setActivePage)
  const [rows, setRows] = useState<Row[]>([])
  const [supported, setSupported] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [log, setLog] = useState('')
  // Files layered over the one being run: a shared base plus a local override.
  const [layered, setLayered] = useState<string[]>([])
  // file path -> the sandbox it provisioned, for anything still alive.
  const [provisioned, setProvisioned] = useState<Record<string, string>>({})

  const readInto = useCallback(async (file: SbxEnvFile): Promise<Row> => {
    const r = await window.minipit?.envRead(file.path)
    if (!r?.ok || typeof r.text !== 'string') return { ...file, error: r?.error || 'Could not read the file.' }
    try { return { ...file, summary: parseSbxEnv(r.text) } }
    catch { return { ...file, error: 'The file is not readable as YAML.' } }
  }, [])

  const load = useCallback(async () => {
    const res = await window.minipit?.envDiscover().catch(() => null)
    setSupported(res?.supported !== false)
    const found = res?.files ?? []
    setRows(await Promise.all(found.map(readInto)))
    setProvisioned(await window.minipit?.envProvisioned().catch(() => ({})) ?? {})
    setLoaded(true)
  }, [readInto])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const off = window.minipit?.onEnvOutput?.((chunk) => setLog((prev) => (prev + chunk).slice(-4000)))
    return () => { off?.() }
  }, [])

  const add = async () => {
    const picked = await window.minipit?.envPick()
    if (!picked?.ok || !picked.path) return
    if (rows.some((r) => r.path === picked.path)) { setOpen(picked.path); return }
    const dir = picked.path.replace(/\/[^/]+$/, '')
    const row = await readInto({ path: picked.path, dir, project: dir.split('/').filter(Boolean).pop() || dir })
    setRows((prev) => [...prev, row])
    setOpen(row.path)
  }

  const create = async (row: Row) => {
    setBusy(row.path); setMsg(null); setLog('')
    // The file being run goes last: later files win, so an override the user
    // layered on top has to come after the base it overrides.
    const paths = [...layered.filter((p) => p !== row.path), row.path]
    const r = await window.minipit?.envCreate(paths)
      .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }))
    setBusy(null)
    if (r?.ok) {
      setMsg({ ok: true, text: r.created
        ? `Provisioned ${r.created} from ${row.project}. It's in Sandboxes now.`
        : `Provisioned from ${row.project}. It's in Sandboxes now.` })
      setProvisioned(await window.minipit?.envProvisioned().catch(() => ({})) ?? {})
    } else {
      setMsg({ ok: false, text: r?.error || 'Could not provision that environment.' })
    }
  }

  // `env rm` rather than deleting it as a plain sandbox: sbx tracks this one as
  // an environment, and removing it the other way can leave that bookkeeping.
  const remove = async (row: Row, sandbox: string) => {
    setBusy(row.path); setMsg(null)
    const r = await window.minipit?.envRemove(sandbox)
      .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }))
    setBusy(null)
    setMsg(r?.ok
      ? { ok: true, text: `Removed ${sandbox}.` }
      : { ok: false, text: r?.error || `Could not remove ${sandbox}.` })
    setProvisioned(await window.minipit?.envProvisioned().catch(() => ({})) ?? {})
  }

  const zero = loaded && rows.length === 0

  if (!supported) {
    return (
      <div className="page">
        <div className="page-hdr"><span className="page-title">Environments</span></div>
        <div className="page-body page-body-center">
          <EmptyState
            icon={<FileCode2 size={34} />}
            eyebrow={<><AlertTriangle size={11} /> Needs sbx 0.39</>}
            title="Sandbox environments need a newer runtime"
            sub={<>A <code>.sbxenv.yaml</code> commits a whole sandbox definition next to your project.
              It arrived in sbx 0.39; den works fine on 0.38, it just can't run these.</>}
            actions={
              <button className="btn btn-primary" onClick={() => setActivePage('settings')}>
                Open Settings → Runtime
              </button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-hdr">
        <span className="page-title">Environments</span>
        <span className="lib-badge" style={{ marginLeft: 8 }}>Experimental</span>
      </div>

      <div className="page-subbar">
        <span className="mcp-subbar-note">
          A <code>.sbxenv.yaml</code> in your project defines the whole sandbox, so everyone gets the same one.
        </span>
        <div className="page-subbar-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => void load()}>
            <RefreshCw size={14} /> Rescan
          </button>
          {!zero && (
            <button className="btn btn-primary btn-sm" onClick={() => void add()}>
              <Plus size={14} /> Add a file
            </button>
          )}
        </div>
      </div>

      <div className={`page-body${zero ? ' page-body-center' : ''}`}>
        {msg && (
          <div className={`np-banner ${msg.ok ? 'ok' : 'err'}`} style={{ marginBottom: 12 }}>
            <span className="np-banner-txt" style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
          </div>
        )}

        {zero && (
          <EmptyState
            icon={<FileCode2 size={34} />}
            eyebrow={<><Layers size={11} /> Sandbox environments</>}
            title="Commit the environment, not the instructions"
            sub={<>den looks for a <code>.sbxenv.yaml</code> in the workspace of every sandbox you have.
              Add one to a project and everyone who clones it gets the same agent, kits, ports and limits.</>}
            actions={
              <button className="btn btn-primary" onClick={() => void add()}>
                <Plus size={15} /> Add a file
              </button>
            }
            features={[
              { icon: <Boxes size={14} />, title: 'One file, whole sandbox',
                sub: 'Agent, workspace, kits, env, secrets, ports and limits' },
              { icon: <Layers size={14} />, title: 'Layer a local override',
                sub: 'A shared base plus your own file — the last one wins' },
              { icon: <GitBranch size={14} />, title: 'Lives in the repo',
                sub: 'Commit it and a contributor is one click from the same setup' },
            ]}
          />
        )}

        {rows.length > 0 && (
          <div className="lib-tbl">
            <div className="lib-hdr lib-hdr-kit">
              <span>PROJECT</span>
              <span>DECLARES</span>
              <span />
            </div>
            {rows.map((row) => {
              const s = row.summary
              const isOpen = open === row.path
              const refs = s ? hostRefs(s) : []
              return (
                <div key={row.path}>
                  <div
                    className={`lib-row lib-row-kit lib-row-click${isOpen ? ' open' : ''}`}
                    onClick={() => setOpen(isOpen ? null : row.path)}
                  >
                    <div className="lib-primary">
                      <FileCode2 size={14} />
                      <span>{row.project}</span>
                    </div>
                    <span className="lib-muted" title={row.path}>
                      {provisioned[row.path]
                        ? <>Running as <strong>{provisioned[row.path]}</strong></>
                        : row.error
                        ? row.error
                        : s && envItemCount(s) > 0
                          ? [
                              s.agent && `agent ${s.agent}`,
                              s.kits.length && `${s.kits.length} kit${s.kits.length > 1 ? 's' : ''}`,
                              s.envVars.length && `${s.envVars.length} env`,
                              s.secrets.length && `${s.secrets.length} secret${s.secrets.length > 1 ? 's' : ''}`,
                              s.ports.length && `${s.ports.length} port${s.ports.length > 1 ? 's' : ''}`
                            ].filter(Boolean).join(' · ')
                          : 'Nothing den recognised in this file'}
                    </span>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}
                         onClick={(e) => e.stopPropagation()}>
                      {provisioned[row.path] ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busy !== null}
                          onClick={() => void remove(row, provisioned[row.path])}
                          title={`sbx env rm ${provisioned[row.path]}`}
                        >
                          <Trash2 size={13} /> {busy === row.path ? 'Removing…' : 'Remove'}
                        </button>
                      ) : (
                        <button
                          className="btn btn-default btn-sm"
                          disabled={busy !== null || !!row.error}
                          onClick={() => void create(row)}
                          title={`sbx env create — provision from ${row.project}`}
                        >
                          <Play size={13} /> {busy === row.path ? 'Provisioning…' : 'Create sandbox'}
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm tpl-icon-btn"
                        title={isOpen ? 'Hide details' : 'Show what this file declares'}
                        onClick={() => setOpen(isOpen ? null : row.path)}
                      >
                        <ChevronDown size={15} style={{ transform: isOpen ? 'none' : 'rotate(-90deg)' }} />
                      </button>
                    </div>
                  </div>

                  {isOpen && s && (
                    <div className="mcp-info">
                      <div className="mcp-info-row">
                        <span className="mcp-info-k">File</span>
                        <span className="mcp-info-v">{row.path}</span>
                      </div>
                      {s.agent && <Detail k="Agent" v={s.agent} />}
                      {s.workspace && <Detail k="Workspace" v={s.workspace} />}
                      {s.kits.length > 0 && <Detail k="Kits" v={s.kits.join(', ')} />}
                      {s.ports.length > 0 && <Detail k="Ports" v={s.ports.join(', ')} />}
                      {s.limits.map((l) => <Detail key={l.key} k={l.key} v={l.value} sub />)}
                      {s.secrets.length > 0 && <Detail k="Secrets" v={s.secrets.join(', ')} />}
                      {s.registries.length > 0 && <Detail k="Registries" v={s.registries.join(', ')} />}
                      {s.envVars.map((e) => (
                        <div className="mcp-info-row sub" key={e.key}>
                          <span className="mcp-info-k">{e.key}</span>
                          <span className="mcp-info-v">
                            {e.value || '—'}
                            {e.fromHost && <span className="lib-badge" style={{ marginLeft: 8 }}>from host</span>}
                          </span>
                        </div>
                      ))}
                      {/* Keys den has no row for. Shown rather than dropped: the
                          schema is experimental, so an unknown key is more
                          likely den being behind than the file being wrong. */}
                      {s.extras.map((x) => <Detail key={x.key} k={x.key} v={x.value || '(nested)'} sub />)}

                      {refs.length > 0 && (
                        <div className="np-banner" style={{ margin: '10px 0 2px' }}>
                          <span className="np-banner-txt">
                            <ShieldCheck size={12} style={{ verticalAlign: -2, marginRight: 6 }} />
                            Reads {refs.length === 1 ? 'this host variable' : 'these host variables'}:{' '}
                            {refs.map((r, i) => (
                              <span key={r}>{i > 0 && ', '}<code>{r}</code></span>
                            ))}. It must be set in your environment when you provision, or the
                            value lands empty.
                          </span>
                        </div>
                      )}

                      <div className="mcp-info-row" style={{ marginTop: 8 }}>
                        <span className="mcp-info-k">Layer over</span>
                        <span className="mcp-info-v">
                          {rows.filter((o) => o.path !== row.path).length === 0
                            ? <span className="lib-muted">Add another file to layer a base under this one.</span>
                            : rows.filter((o) => o.path !== row.path).map((o) => (
                                <label key={o.path} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 12 }}>
                                  <input
                                    type="checkbox"
                                    checked={layered.includes(o.path)}
                                    onChange={(e) => setLayered((prev) =>
                                      e.target.checked ? [...prev, o.path] : prev.filter((p) => p !== o.path))}
                                  />
                                  {o.project}
                                </label>
                              ))}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {log && busy && (
          <div className="cmd-blk create-log" style={{ marginTop: 12 }}>
            <pre className="create-log-pre">{log}</pre>
          </div>
        )}
      </div>

      {!zero && (
        <div className="mcp-foot">
          <Terminal size={13} />
          <span>
            den provisions with <code>sbx env create</code> and leaves the session to you — the sandbox
            appears in <strong>Sandboxes</strong> with its own terminal.
          </span>
        </div>
      )}
    </div>
  )
}

function Detail({ k, v, sub }: { k: string; v: string; sub?: boolean }) {
  return (
    <div className={`mcp-info-row${sub ? ' sub' : ''}`}>
      <span className="mcp-info-k">{k}</span>
      <span className="mcp-info-v">{v}</span>
    </div>
  )
}
