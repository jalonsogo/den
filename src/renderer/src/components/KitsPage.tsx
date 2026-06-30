import { useEffect, useState, useCallback } from 'react'
import { Plus, Layers, Package, FolderOpen, Trash2, Boxes, Info, Plug, Globe, Variable, TerminalSquare, FileText } from 'lucide-react'
import { useStore } from '../store'
import { parseKitSpec } from '../lib/kitSpec'
import { MCP_CATALOG } from '../lib/mcpCatalog'

interface Kit { name: string; kind: string; dir: string; hasZip: boolean }

// Visual representation of a kit's spec.yaml (the default view when editing).
// Left-aligned capability icons; hovering one shows its detailed contents in a
// fixed-position popover (escapes the table's overflow:hidden clip).
function KitCaps({ p }: { p?: ReturnType<typeof parseKitSpec> }) {
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
              <img className="kit-pop-ic" src={`mcp/${id}.png`} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
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
    <div className="kit-caps">
      {items.map(({ key, icon: Icon, label, count }) => (
        <span
          key={key}
          className="kit-cap-ic"
          onMouseEnter={(e) => enter(key, e)}
          onMouseLeave={() => setHover((h) => (h?.key === key ? null : h))}
        >
          <Icon size={14} />
          <span className="kit-cap-lbl">{label}</span>
          {count != null && <span className="kit-cap-n">{count}</span>}
        </span>
      ))}
      {hover && (
        <div className="kit-pop" style={{ top: hover.top, left: hover.left }}>
          <div className="kit-pop-hd">{titles[hover.key]}</div>
          {popContent(hover.key)}
        </div>
      )}
    </div>
  )
}

function KitSummary({ spec }: { spec: string }) {
  const p = parseKitSpec(spec)
  const envCount = p.envVars.length
  return (
    <div className="kit-summary">
      <div className="ks-row"><span className="ks-k">Kind</span><span className="ks-v">{p.kind === 'sandbox' ? 'Sandbox kit — full agent' : 'Mixin kit — add-on'}</span></div>
      {p.kind === 'sandbox' && p.image && <div className="ks-row"><span className="ks-k">Base</span><span className="ks-v ks-mono">{p.image}</span></div>}
      {p.kind === 'sandbox' && p.entrypoint && <div className="ks-row"><span className="ks-k">Entrypoint</span><span className="ks-v ks-mono">{p.entrypoint}</span></div>}
      {p.mcps.length > 0 && (
        <div className="ks-block">
          <span className="ks-k">Remote MCPs · {p.mcps.length}</span>
          <div className="ks-mcps">
            {p.mcps.map((id) => {
              const m = MCP_CATALOG.find((x) => x.id === id)
              return <span className="ks-mcp" key={id}><img src={`mcp/${id}.png`} alt="" />{m?.name ?? id}</span>
            })}
          </div>
        </div>
      )}
      {(p.allowedDomains.length > 0 || p.deniedDomains.length > 0) && (
        <div className="ks-block">
          <span className="ks-k">Network · {p.allowedDomains.length} allowed · {p.deniedDomains.length} denied</span>
          <div className="ks-mcps">
            {p.allowedDomains.map((d) => <span className="ks-tag" key={d}>{d}</span>)}
            {p.deniedDomains.map((d) => <span className="ks-tag ks-tag-deny" key={d}>{d}</span>)}
          </div>
        </div>
      )}
      {p.installCmds.length > 0 && (
        <div className="ks-block">
          <span className="ks-k">Commands · {p.installCmds.length}</span>
          {p.installCmds.map((c, i) => <div className="ks-cmd" key={i}>{c}</div>)}
        </div>
      )}
      {envCount > 0 && <div className="ks-row"><span className="ks-k">Env vars</span><span className="ks-v">{envCount}</span></div>}
      {p.agentContext && (
        <div className="ks-block"><span className="ks-k">Agent memory</span><div className="ks-memo">{p.agentContext}</div></div>
      )}
    </div>
  )
}

export function KitsPage({ variant }: { variant: 'mixin' | 'sandbox' }) {
  const { modal, setModal, sandboxes } = useStore()
  const [kits, setKits] = useState<Kit[]>([])
  const [specs, setSpecs] = useState<Record<string, ReturnType<typeof parseKitSpec>>>({})
  const [addFor, setAddFor] = useState<string | null>(null)
  // Fixed-position anchor for the dropdown so it escapes the table's overflow:hidden.
  const [addPos, setAddPos] = useState<{ top: number; right: number } | null>(null)
  // sandbox name → kit names already applied (to disable them in the picker).
  const [appliedMap, setAppliedMap] = useState<Record<string, string[]>>({})

  const toggleAdd = async (dir: string, e: React.MouseEvent) => {
    if (addFor === dir) { setAddFor(null); return }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setAddPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    setAddFor(dir)
    // Refresh which sandboxes already have each kit so the picker can disable them.
    const entries = await Promise.all(
      sandboxes.map(async (s) => [s.name, (await window.minipit?.appliedKits(s.name)) ?? []] as const)
    )
    setAppliedMap(Object.fromEntries(entries))
  }

  // Close the "Add to sandbox" dropdown on any outside click.
  useEffect(() => {
    if (!addFor) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t?.closest('.kit-add-menu') && !t?.closest('.kit-add-wrap')) setAddFor(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [addFor])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string; restart?: string } | null>(null)
  const [editFor, setEditFor] = useState<string | null>(null)
  const [spec, setSpec] = useState('')
  const [savingSpec, setSavingSpec] = useState(false)
  const [specView, setSpecView] = useState<'summary' | 'code'>('summary')

  const load = useCallback(async () => {
    const list = (await window.minipit?.listKits()) ?? []
    setKits(list)
    // Read + parse each kit's spec so the table can summarize its capabilities.
    const entries = await Promise.all(
      list.map(async (k) => [k.dir, parseKitSpec((await window.minipit?.readKit(k.dir)) ?? '')] as const)
    )
    setSpecs(Object.fromEntries(entries))
  }, [])

  // Load on mount and refresh when the new-kit modal closes.
  useEffect(() => { if (modal === null) load() }, [modal, load])

  const shown = kits.filter((k) => k.kind === variant)
  const title = variant === 'mixin' ? 'Mixin Kits' : 'Sandbox Kits'
  const blurb = variant === 'mixin'
    ? 'Mixin kits layer extra tools, MCPs, credentials, and config onto an existing agent — stack several on a sandbox.'
    : 'Sandbox kits define a complete agent from scratch — image, entrypoint, network, and more.'

  const remove = async (k: Kit) => {
    if (!confirm(`Delete kit "${k.name}"?`)) return
    await window.minipit?.removeKit(k.dir).catch(() => {})
    load()
  }

  const addToSandbox = async (kit: Kit, sandboxName: string) => {
    setBusy(true)
    setMsg(null)
    const res = await window.minipit?.kitAdd(sandboxName, kit.dir).catch(() => null)
    setBusy(false)
    setAddFor(null)
    setMsg(res?.ok
      ? { ok: true, text: `Added "${kit.name}" to ${sandboxName}. A restart is recommended so the agent picks it up.`, restart: sandboxName }
      : { ok: false, text: res?.error || 'Failed to add kit.' })
  }

  const restartSandbox = async (name: string) => {
    setBusy(true)
    try {
      await window.minipit?.stopSandbox(name)
      await window.minipit?.runSandbox(name)
      setMsg({ ok: true, text: `Restarted ${name} — kit applied.` })
    } catch {
      setMsg({ ok: false, text: `Couldn't restart ${name} — stop and run it manually.` })
    } finally { setBusy(false) }
  }

  const openEdit = async (k: Kit) => {
    if (editFor === k.dir) { setEditFor(null); return }
    setAddFor(null)
    setSpec((await window.minipit?.readKit(k.dir)) ?? '')
    setEditFor(k.dir)
  }

  const saveSpec = async (k: Kit) => {
    setSavingSpec(true)
    const res = await window.minipit?.updateKit(k.dir, spec).catch(() => null)
    setSavingSpec(false)
    if (res?.ok) { setEditFor(null); load(); setMsg({ ok: true, text: `Saved & re-packed "${k.name}".` }) }
    else setMsg({ ok: false, text: res?.error || 'Failed to save spec.' })
  }

  return (
    <div className="page">
      <div className="page-hdr">
        <span className="page-title">{title}</span>
        <span className="lib-badge" style={{ marginLeft: 8 }}>Experimental</span>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setModal('new-kit')}>
          <Plus size={13} /> New {variant === 'mixin' ? 'mixin kit' : 'sandbox kit'}
        </button>
      </div>

      <div className="page-body home-dash">
        <p style={{ fontSize: 12.5, color: 'var(--t3)', marginBottom: 14 }}>{blurb} Managed by den and packed with <code>sbx kit pack</code>.</p>

        {msg && (
          <div className={`np-banner ${msg.ok ? 'ok' : 'err'}`} style={{ marginBottom: 12 }}>
            <span className="np-banner-txt">{msg.text}</span>
            {msg.restart && (
              <button className="btn btn-default btn-sm" onClick={() => restartSandbox(msg.restart!)} disabled={busy}>
                {busy ? 'Restarting…' : 'Restart sandbox'}
              </button>
            )}
          </div>
        )}

        {shown.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--t3)', fontSize: 13, padding: '32px 0' }}>
            No {variant} kits yet — create one to get started.
          </div>
        ) : (
          <div className="lib-tbl">
            <div className="lib-hdr lib-hdr-kit">
              <span>{variant === 'mixin' ? 'MIXIN KIT' : 'SANDBOX KIT'}</span>
              <span>CAPABILITIES</span>
              <span></span>
            </div>
            {shown.map((k) => (
              <div key={k.dir}>
                <div
                  className={`lib-row lib-row-kit lib-row-click${editFor === k.dir ? ' open' : ''}`}
                  onClick={() => openEdit(k)}
                  title="View / edit kit"
                >
                  <div className="lib-primary">
                    {variant === 'mixin' ? <Layers size={14} /> : <Package size={14} />}
                    <span>{k.name}</span>
                    {!k.hasZip && <span className="kit-unpacked" title="Not packed yet">unpacked</span>}
                  </div>
                  <KitCaps p={specs[k.dir]} />
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                    <div className="kit-add-wrap">
                      <button
                        className="btn btn-default btn-sm"
                        title="Add this kit to a running sandbox"
                        onClick={(e) => toggleAdd(k.dir, e)}
                        disabled={busy}
                      >
                        <Boxes size={13} /> Add to sandbox
                      </button>
                      {addFor === k.dir && addPos && (
                        <div className="kit-add-menu" style={{ top: addPos.top, right: addPos.right }}>
                          <div className="kit-add-label">Add to sandbox</div>
                          {sandboxes.length === 0 ? (
                            <span className="kit-add-empty">No sandboxes yet — create one, or pass this kit at creation in New Sandbox.</span>
                          ) : (
                            sandboxes.map((s) => {
                              const has = appliedMap[s.name]?.includes(k.name)
                              return (
                                <button
                                  key={s.id}
                                  className="kit-add-sb"
                                  onClick={() => addToSandbox(k, s.name)}
                                  disabled={busy || has}
                                  title={has ? 'Already has this kit' : s.status}
                                >
                                  <span className={`kit-add-dot${s.status === 'running' ? ' on' : ''}`} />
                                  <span className="kit-add-sb-name">{s.name}</span>
                                  {has && <span className="kit-add-has">added</span>}
                                </button>
                              )
                            })
                          )}
                        </div>
                      )}
                    </div>
                    <button className={`btn btn-ghost btn-sm tpl-icon-btn${editFor === k.dir ? ' active' : ''}`} title="View / edit kit" onClick={() => openEdit(k)}>
                      <Info size={14} />
                    </button>
                    <button className="btn btn-ghost btn-sm tpl-icon-btn" title="Reveal in Finder" onClick={() => window.minipit?.openInFinder(k.dir)}>
                      <FolderOpen size={14} />
                    </button>
                    <button className="btn btn-ghost btn-sm tpl-icon-btn" style={{ color: 'var(--destruct)' }} title="Delete kit" onClick={() => remove(k)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {editFor === k.dir && (
                  <div className="kit-spec-edit">
                    <div className="kit-spec-tabs">
                      <button className={specView === 'summary' ? 'on' : ''} onClick={() => setSpecView('summary')}>Summary</button>
                      <button className={specView === 'code' ? 'on' : ''} onClick={() => setSpecView('code')}>Code</button>
                    </div>

                    {specView === 'summary' ? (
                      <KitSummary spec={spec} />
                    ) : (
                      <textarea
                        className="kit-spec-area"
                        value={spec}
                        spellCheck={false}
                        onChange={(e) => setSpec(e.target.value)}
                      />
                    )}

                    <div className="kit-spec-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditFor(null)}>Cancel</button>
                      <button className="btn btn-primary btn-sm" onClick={() => saveSpec(k)} disabled={savingSpec}>
                        {savingSpec ? 'Saving…' : 'Save & repack'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
