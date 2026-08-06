import { useState, useEffect, useRef } from 'react'
import { Plus, X, Paperclip, Info, Search, ChevronDown, Check, KeyRound, FileCode2 } from 'lucide-react'
import { useStore } from '../../store'
import { MCP_CATALOG, mcpHost, mcpIcon } from '../../lib/mcpCatalog'
import {
  buildSpec, specToForm, kitDomains, mcpStartupCmds, EMPTY_KIT,
  type Cap, type CmdRow, type CredRow, type FileRow, type KitForm
} from '../../lib/kitForm'
import { AgentIcon } from '../AgentIcon'
import { AGENTS, type AgentType, type KitFile } from '../../types'

const CAPS: { key: Cap; label: string }[] = [
  { key: 'mcp',     label: 'Remote MCPs' },
  { key: 'setup',   label: 'Setup' },
  { key: 'files',   label: 'Files' },
  { key: 'env',     label: 'Environment' },
  { key: 'cred',    label: 'Credential' },
  { key: 'network', label: 'Requirements' },
  { key: 'memory',  label: 'Agent instructions' }
]

// Base for a sandbox kit — start from a default agent (image + entrypoint are
// editable starting points). Pick "Custom" to define your own image.
const AGENT_BASES: Record<string, { image: string; entrypoint: string }> = {
  claude:           { image: 'docker/sandbox-templates:claude-code-docker', entrypoint: 'claude --dangerously-skip-permissions' },
  'claude-bedrock': { image: 'docker/sandbox-templates:claude-code-docker', entrypoint: 'claude --dangerously-skip-permissions' },
  codex:            { image: 'docker/sandbox-templates:codex-docker', entrypoint: 'codex' },
  copilot:          { image: 'docker/sandbox-templates:copilot-docker', entrypoint: 'copilot' },
  cursor:           { image: 'docker/sandbox-templates:cursor-docker', entrypoint: 'cursor-agent' },
  'docker-agent':   { image: 'docker/sandbox-templates:docker-agent', entrypoint: 'docker-agent' },
  droid:            { image: 'docker/sandbox-templates:droid-docker', entrypoint: 'droid' },
  gemini:           { image: 'docker/sandbox-templates:gemini-docker', entrypoint: 'gemini' },
  kiro:             { image: 'docker/sandbox-templates:kiro-docker', entrypoint: 'kiro' },
  opencode:         { image: 'docker/sandbox-templates:opencode-docker', entrypoint: 'opencode' },
  shell:            { image: 'ubuntu:24.04', entrypoint: 'bash' }
}

// A list of single-line inputs with add/remove (one entry per line).
function ListField({ placeholder, items, onChange, addLabel }: {
  placeholder: string; items: string[]; onChange: (v: string[]) => void; addLabel: string
}) {
  return (
    <>
      {items.map((val, i) => (
        <div className="kit-list-row" key={i}>
          <input
            className="finput"
            value={val}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button className="btn btn-ghost btn-sm kit-list-rm" onClick={() => onChange(items.filter((_, j) => j !== i))} title="Remove">
            <X size={13} />
          </button>
        </div>
      ))}
      <button className="kit-add-line" onClick={() => onChange([...items, ''])}>
        <Plus size={12} /> {addLabel}
      </button>
    </>
  )
}

// Command rows with their spec flags: run as the agent (uid 1000) vs root, and —
// for startup only — keep running in the background.
function CmdField({ placeholder, items, onChange, addLabel, background }: {
  placeholder: string; items: CmdRow[]; onChange: (v: CmdRow[]) => void; addLabel: string; background?: boolean
}) {
  const patch = (i: number, v: Partial<CmdRow>) => onChange(items.map((c, j) => (j === i ? { ...c, ...v } : c)))
  return (
    <>
      {items.map((c, i) => (
        <div className="kit-cmd-row" key={i}>
          <input className="finput" value={c.cmd} placeholder={placeholder} onChange={(e) => patch(i, { cmd: e.target.value })} />
          <button
            className={`kit-cmd-flag${c.asAgent ? ' on' : ''}`}
            onClick={() => patch(i, { asAgent: !c.asAgent })}
            title={c.asAgent ? 'Runs as the agent (uid 1000) — click for root' : 'Runs as root — click to run as the agent (uid 1000)'}
          >
            {c.asAgent ? 'agent' : 'root'}
          </button>
          {background && (
            <button
              className={`kit-cmd-flag${c.background ? ' on' : ''}`}
              onClick={() => patch(i, { background: !c.background })}
              title="background: true — keep it running instead of waiting for it to exit"
            >
              bg
            </button>
          )}
          <button className="btn btn-ghost btn-sm kit-list-rm" onClick={() => onChange(items.filter((_, j) => j !== i))} title="Remove">
            <X size={13} />
          </button>
        </div>
      ))}
      <button className="kit-add-line" onClick={() => onChange([...items, { cmd: '', asAgent: !!background }])}>
        <Plus size={12} /> {addLabel}
      </button>
    </>
  )
}

export function NewKitModal() {
  const { setModal, activePage, editKit, setEditKit } = useStore()
  const editing = !!editKit
  // Kind is set by the section that opened the modal (Sandbox Kits vs Mixin Kits);
  // in edit mode it's replaced by the loaded kit's kind.
  const kind: 'mixin' | 'sandbox' = activePage === 'kits' ? 'sandbox' : 'mixin'
  const [f, setF] = useState<KitForm>({
    ...EMPTY_KIT, kind,
    ...(kind === 'sandbox' ? { image: AGENT_BASES.claude.image, entrypoint: AGENT_BASES.claude.entrypoint } : {})
  })
  const [imgCustom, setImgCustom] = useState(false)
  const [agentDd, setAgentDd] = useState(false)
  const agentDdRef = useRef<HTMLDivElement>(null)
  const [caps, setCaps] = useState<Cap[]>([])
  // Bottom preview: the capability summary, or the spec.yaml den will write.
  // null = collapsed. Clicking the open one closes it.
  const [infoView, setInfoView] = useState<'summary' | 'code' | null>(null)
  const [capMenu, setCapMenu] = useState(false)
  const [mcpQuery, setMcpQuery] = useState('')
  const [mcpCat, setMcpCat] = useState('All')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const set = (k: keyof KitForm, v: KitForm[keyof KitForm]) => setF((prev) => ({ ...prev, [k]: v }))

  // In edit mode, load the kit's spec.yaml and hydrate the form + open the
  // capability blocks it already uses. Files aren't in the spec — they're the
  // contents of <kit>/files/ — so list those separately.
  useEffect(() => {
    if (!editKit) return
    let cancelled = false
    Promise.all([
      window.minipit?.readKit(editKit.dir) ?? Promise.resolve(''),
      window.minipit?.listKitFiles(editKit.dir).catch(() => []) ?? Promise.resolve([])
    ]).then(([raw, packed]) => {
      if (cancelled || !raw) return
      const { form, caps: c } = specToForm(raw)
      const files: FileRow[] = (packed ?? []).map((p) => ({ target: p.target, dest: p.dest, packed: true }))
      setF({ ...form, files })
      const hasFiles = files.length > 0 || form.initFiles.length > 0
      setCaps(hasFiles && !c.includes('files') ? [...c, 'files'] : c)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [editKit])

  // Close the base-agent dropdown on outside click.
  useEffect(() => {
    if (!agentDd) return
    const handler = (e: MouseEvent) => {
      if (agentDdRef.current && !agentDdRef.current.contains(e.target as Node)) setAgentDd(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [agentDd])

  // Close and clear the edit target so the next open is a fresh "create".
  const close = () => { setModal(null); setEditKit(null) }

  const addCap = (key: Cap) => setCaps((c) => (c.includes(key) ? c : [...c, key]))
  const removeCap = (key: Cap) => {
    setCaps((c) => c.filter((k) => k !== key))
    // Clear that primitive's content so it doesn't leak into the spec.
    if (key === 'mcp') setF((p) => ({ ...p, mcps: [], customMcps: [] }))
    if (key === 'setup') setF((p) => ({ ...p, installCmds: [], startupCmds: [] }))
    // Files already packed into the kit folder are deleted from the Files list
    // itself, not by closing the block; initFiles are spec-authored and stay.
    if (key === 'files') setF((p) => ({ ...p, files: p.files.filter((x) => x.packed) }))
    if (key === 'env') set('envVars', [])
    if (key === 'cred') set('creds', [])
    if (key === 'network') setF((p) => ({ ...p, allowedDomains: [], deniedDomains: [] }))
    if (key === 'memory') setF((p) => ({ ...p, agentContext: '', aiFilename: '' }))
  }
  const toggleMcp = (id: string) =>
    setF((p) => ({ ...p, mcps: p.mcps.includes(id) ? p.mcps.filter((m) => m !== id) : [...p.mcps, id] }))
  const addCustomMcp = () => setF((p) => ({ ...p, customMcps: [...p.customMcps, { name: '', url: '' }] }))
  const updateCustomMcp = (i: number, field: 'name' | 'url', val: string) =>
    setF((p) => ({ ...p, customMcps: p.customMcps.map((c, j) => (j === i ? { ...c, [field]: val } : c)) }))
  const removeCustomMcp = (i: number) => setF((p) => ({ ...p, customMcps: p.customMcps.filter((_, j) => j !== i) }))

  const addCred = () => setF((p) => ({
    ...p, creds: [...p.creds, { service: '', domains: [''], headerName: 'Authorization', valueFormat: 'Bearer %s', envVars: [''] }]
  }))
  const updateCred = (i: number, v: Partial<CredRow>) =>
    setF((p) => ({ ...p, creds: p.creds.map((c, j) => (j === i ? { ...c, ...v } : c)) }))
  const removeCred = (i: number) => setF((p) => ({ ...p, creds: p.creds.filter((_, j) => j !== i) }))

  const attach = async () => {
    const picked = await window.minipit?.pickFiles().catch(() => [])
    if (!picked?.length) return
    setF((p) => ({
      ...p,
      files: [
        ...p.files,
        ...picked
          .filter((src) => !p.files.some((x) => x.src === src))
          .map((src) => ({ src, target: 'workspace' as const, dest: src.split('/').pop() ?? 'file' }))
      ]
    }))
  }

  const updateFile = (i: number, v: Partial<FileRow>) =>
    setF((p) => ({ ...p, files: p.files.map((x, j) => (j === i ? { ...x, ...v } : x)) }))

  // Files already packed into the kit folder are deleted on the spot; ones picked
  // in this session just leave the list.
  const removeFile = async (i: number) => {
    const row = f.files[i]
    if (row.packed && editKit) {
      const res = await window.minipit?.removeKitFile(editKit.dir, row.target, row.dest)
      if (res && !res.ok) { setError(res.error || 'Failed to remove the file'); return }
    }
    setF((p) => ({ ...p, files: p.files.filter((_, j) => j !== i) }))
  }

  // Only newly-picked files need copying; packed ones are already in place.
  const newFiles = (): KitFile[] =>
    f.files.filter((x) => x.src && !x.packed).map((x) => ({ src: x.src as string, target: x.target, dest: x.dest.trim() || (x.src as string).split('/').pop() || 'file' }))

  const handleCreate = async () => {
    if (!f.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError(''); setDone('')
    try {
      const res = await window.minipit?.createKit(f.name.trim(), buildSpec(f), newFiles())
      setDone(res?.zip ? `Packed → ${res.zip}` : 'Kit created')
      setTimeout(() => close(), 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  // Edit mode: rewrite the existing kit's spec.yaml (name/dir unchanged) and repack.
  const handleSave = async () => {
    if (!editKit) return
    setSaving(true); setError(''); setDone('')
    const res = await window.minipit?.updateKit(editKit.dir, buildSpec(f), newFiles())
      .catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }))
    if (res?.ok) {
      setDone('Saved & re-packed')
      setTimeout(() => close(), 1000)
    } else {
      setError(res?.error || 'Failed to save kit'); setSaving(false)
    }
  }

  const capLabel = (key: Cap) => CAPS.find((c) => c.key === key)?.label ?? key
  // Render blocks in CAPS order regardless of the order they were added.
  const openCaps = CAPS.filter((c) => caps.includes(c.key)).map((c) => c.key)

  return (
    <div className="overlay" onClick={() => !saving && close()}>
      <div className="modal modal-adaptive" style={{ width: 'min(1200px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="m-hdr">
          <div className="m-title">{editing ? 'Edit' : 'New'} {f.kind === 'sandbox' ? 'Sandbox' : 'Mixin'} Kit</div>
          <div className="m-sub">
            {f.kind === 'sandbox'
              ? 'Define a full agent — image, entrypoint, and capabilities. den writes the spec.yaml and packs it.'
              : 'Compose add-ons (MCPs, setup, files, policy, env, credentials, memory) for an existing agent.'}
          </div>
        </div>

        <div className="m-body">
          <div className="frow-2">
            <div className="fg" style={{ flex: 1 }}>
              <label className="flabel">Name {editing && <span className="flabel-hint">can't be renamed</span>}</label>
              <input className="finput" value={f.name} placeholder="my-kit" readOnly={editing} onChange={(e) => set('name', e.target.value)} autoFocus={!editing} />
            </div>
            <div className="fg" style={{ flex: 1 }}>
              <label className="flabel">Display name</label>
              <input className="finput" value={f.displayName} placeholder="My Kit" onChange={(e) => set('displayName', e.target.value)} />
            </div>
          </div>

          <div className="fg">
            <label className="flabel">Description</label>
            <input className="finput" value={f.description} placeholder="What this kit does" onChange={(e) => set('description', e.target.value)} />
          </div>

          {f.kind === 'sandbox' && (() => {
            const selAgent = imgCustom ? null : (AGENTS.find((a) => AGENT_BASES[a.id]?.image === f.image)?.id ?? null)
            const selLabel = imgCustom || !selAgent ? 'Custom image' : (AGENTS.find((a) => a.id === selAgent)?.label ?? selAgent)
            return (
              <>
                <div className="fg">
                  <label className="flabel">Base agent <span className="flabel-hint">image + entrypoint are editable</span></label>
                  <div className="agent-dd" ref={agentDdRef}>
                    <button className="agent-dd-btn" onClick={() => setAgentDd((v) => !v)}>
                      {selAgent ? <AgentIcon agent={selAgent as AgentType} size={18} /> : <Plus size={16} />}
                      <span className="agent-dd-label">{selLabel}</span>
                      <ChevronDown size={15} style={{ marginLeft: 'auto', color: 'var(--t3)' }} />
                    </button>
                    {agentDd && (
                      <div className="agent-dd-list">
                        {AGENTS.filter((a) => AGENT_BASES[a.id]).map((a) => (
                          <button
                            key={a.id}
                            className={`agent-dd-item${selAgent === a.id ? ' on' : ''}`}
                            onClick={() => { setImgCustom(false); setF((p) => ({ ...p, image: AGENT_BASES[a.id].image, entrypoint: AGENT_BASES[a.id].entrypoint })); setAgentDd(false) }}
                          >
                            <AgentIcon agent={a.id} size={18} />
                            {a.label}
                            {selAgent === a.id && <Check size={14} style={{ marginLeft: 'auto', color: 'var(--accent, var(--primary))' }} />}
                          </button>
                        ))}
                        <button className="agent-dd-item" onClick={() => { setImgCustom(true); setF((p) => ({ ...p, image: '' })); setAgentDd(false) }}>
                          <Plus size={16} /> Custom image…
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="fg">
                  <label className="flabel">Image</label>
                  <input className="finput" value={f.image} placeholder="myregistry/my-agent:latest" onChange={(e) => { setImgCustom(true); set('image', e.target.value) }} />
                </div>
                <div className="fg">
                  <label className="flabel">Entrypoint</label>
                  <input className="finput" value={f.entrypoint} placeholder="claude --dangerously-skip-permissions" onChange={(e) => set('entrypoint', e.target.value)} />
                </div>
              </>
            )
          })()}

          {/* Capability composer: blocks first, then an "Add" CTA below them */}
          {openCaps.length > 0 && <label className="flabel">Capabilities</label>}
          {openCaps.map((key) => (
            <div className="cap-block" key={key}>
              <div className="cap-block-hd">
                <span>{capLabel(key)}</span>
                <button className="cap-rm" onClick={() => removeCap(key)} title="Remove"><X size={13} /></button>
              </div>

              {key === 'mcp' && (() => {
                const cats = ['All', ...Array.from(new Set(MCP_CATALOG.map((m) => m.category)))]
                const q = mcpQuery.trim().toLowerCase()
                const shown = MCP_CATALOG.filter((m) =>
                  (mcpCat === 'All' || m.category === mcpCat) &&
                  (!q || m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || m.category.toLowerCase().includes(q))
                )
                return (
                  <>
                    <div className="mcp-filter">
                      <div className="mcp-search">
                        <Search size={13} className="mcp-search-ic" />
                        <input value={mcpQuery} placeholder="Search servers…" onChange={(e) => setMcpQuery(e.target.value)} />
                        {mcpQuery && <button className="mcp-search-x" onClick={() => setMcpQuery('')}><X size={12} /></button>}
                      </div>
                      <select className="mcp-cat" value={mcpCat} onChange={(e) => setMcpCat(e.target.value)}>
                        {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="mcp-grid">
                      {f.customMcps.length === 0 ? (
                        <button
                          className="mcp-card mcp-card-custom"
                          onClick={(e) => { addCustomMcp(); (e.currentTarget as HTMLButtonElement).blur() }}
                          title="Add a custom MCP by URL"
                        >
                          <span className="mcp-card-ic"><Plus size={18} /></span>
                          <span className="mcp-card-name">Custom MCP</span>
                        </button>
                      ) : (
                        <div className="mcp-custom-card">
                          <div className="mcp-custom-card-hd">
                            <span>Custom MCP</span>
                            <button className="mcp-custom-add" onClick={addCustomMcp}><Plus size={12} /> Add another</button>
                          </div>
                          {f.customMcps.map((c, i) => (
                            <div className="mcp-custom-row" key={`custom-${i}`}>
                              <input className="finput mcp-custom-name" value={c.name} placeholder="name" onChange={(e) => updateCustomMcp(i, 'name', e.target.value)} />
                              <input className="finput mcp-custom-url" value={c.url} placeholder="https://mcp.example.com/mcp" onChange={(e) => updateCustomMcp(i, 'url', e.target.value)} />
                              <button className="kit-list-rm btn btn-ghost btn-sm" onClick={() => removeCustomMcp(i)} title="Remove"><X size={13} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                      {shown.map((m) => (
                        <button
                          key={m.id}
                          className={`mcp-card${f.mcps.includes(m.id) ? ' on' : ''}`}
                          onClick={() => toggleMcp(m.id)}
                          title={`${m.name} — ${m.description}`}
                        >
                          <img src={mcpIcon(m.id)} alt="" />
                          <span className="mcp-card-name">{m.name}</span>
                        </button>
                      ))}
                      {shown.length === 0 && <div className="mcp-empty">No servers match.</div>}
                    </div>
                    <div className="fhint">{f.mcps.length + f.customMcps.length || 'No'} selected — each adds an allow rule + a startup <code>claude mcp add</code>.</div>
                  </>
                )
              })()}

              {key === 'setup' && (
                <>
                  <div className="cap-note">
                    Install runs once at create, via <code>sh -c</code>. Startup runs on every start — non-interactive,
                    before the agent attaches; author idempotent.
                  </div>
                  <div className="cap-sub">Install · once at create</div>
                  <CmdField placeholder="uv tool install ruff@latest" addLabel="Add" items={f.installCmds} onChange={(v) => set('installCmds', v)} />
                  <div className="cap-sub" style={{ marginTop: 10 }}>Startup · every start</div>
                  <CmdField placeholder="my-daemon --serve" addLabel="Add" items={f.startupCmds} onChange={(v) => set('startupCmds', v)} background />
                  <div className="fhint">
                    Startup commands run as exec-style argv — shell strings are wrapped in <code>["sh", "-c", …]</code> automatically.
                  </div>
                </>
              )}

              {key === 'files' && (
                <>
                  <div className="cap-note">
                    Static files packed with the kit and copied in at create — config, dotfiles, helper scripts.
                    <code>files/home/</code> → <code>/home/agent/</code> · <code>files/workspace/</code> → the workspace.
                  </div>
                  {f.files.map((x, i) => (
                    <div className="kit-file-row" key={`${x.target}/${x.dest}/${i}`}>
                      <select className="kit-file-target" value={x.target} onChange={(e) => updateFile(i, { target: e.target.value as 'home' | 'workspace' })} disabled={x.packed}>
                        <option value="home">home/</option>
                        <option value="workspace">workspace/</option>
                      </select>
                      <input
                        className="finput"
                        value={x.dest}
                        placeholder="ruff.toml"
                        readOnly={x.packed}
                        onChange={(e) => updateFile(i, { dest: e.target.value })}
                      />
                      {x.packed
                        ? <span className="kit-file-tag">packed</span>
                        : <span className="kit-file-tag" title={x.src}>{x.src?.split('/').pop()}</span>}
                      <button className="btn btn-ghost btn-sm kit-list-rm" onClick={() => removeFile(i)} title="Remove"><X size={13} /></button>
                    </div>
                  ))}
                  <button className="kit-add-line" onClick={attach}>
                    <Paperclip size={12} /> Add
                  </button>
                  {f.initFiles.length > 0 && (
                    <>
                      {/* Written at startup with runtime values — authored in the
                          spec, shown here so they aren't invisible in the editor. */}
                      <div className="cap-sub" style={{ marginTop: 10 }}>Init files · from the spec</div>
                      {f.initFiles.map((x) => (
                        <div className="kit-file-row" key={x.path}>
                          <input className="finput" value={x.path} readOnly />
                          {x.onlyIfMissing && <span className="kit-file-tag">only if missing</span>}
                        </div>
                      ))}
                    </>
                  )}
                  <div className="fhint">
                    Contents are added when you pack the directory. For values only known at start — like <code>${'{WORKDIR}'}</code> —
                    use <code>commands.initFiles</code> in the spec.
                  </div>
                </>
              )}

              {key === 'env' && (
                <>
                  <div className="cap-note">
                    Static variables set in the container. Secrets don't go here — declare a credential below and its
                    env var arrives proxy-managed.
                  </div>
                  {f.envVars.map((e, i) => (
                    <div className="kit-env-row" key={i}>
                      <input
                        className="finput kit-env-key"
                        value={e.key}
                        placeholder="MY_TOOL_WORKSPACE"
                        onChange={(ev) => set('envVars', f.envVars.map((x, j) => (j === i ? { ...x, key: ev.target.value } : x)))}
                      />
                      <input
                        className="finput kit-env-val"
                        value={e.value}
                        placeholder="/home/agent/my-tool"
                        onChange={(ev) => set('envVars', f.envVars.map((x, j) => (j === i ? { ...x, value: ev.target.value } : x)))}
                      />
                      <button className="btn btn-ghost btn-sm kit-list-rm" onClick={() => set('envVars', f.envVars.filter((_, j) => j !== i))} title="Remove"><X size={13} /></button>
                    </div>
                  ))}
                  <button className="kit-add-line" onClick={() => set('envVars', [...f.envVars, { key: '', value: '' }])}>
                    <Plus size={12} /> Add
                  </button>
                </>
              )}

              {key === 'cred' && (
                <>
                  <div className="cap-note">
                    An authenticated service the kit talks to. The secret stays on the host — the proxy injects it on
                    requests to the domain; the container only ever sees a sentinel.
                  </div>
                  {f.creds.map((c, i) => (
                    <div className="kit-cred" key={i}>
                      <div className="kit-cred-hd">
                        <KeyRound size={13} />
                        <input
                          className="finput kit-cred-name"
                          value={c.service}
                          placeholder="my-service"
                          onChange={(e) => updateCred(i, { service: e.target.value })}
                        />
                        <button className="cap-rm" onClick={() => removeCred(i)} title="Remove"><X size={13} /></button>
                      </div>
                      <div className="cap-sub">Domains it authenticates to</div>
                      <ListField placeholder="api.example.com" addLabel="Add domain" items={c.domains} onChange={(v) => updateCred(i, { domains: v })} />
                      <div className="frow-2" style={{ marginTop: 8 }}>
                        <div className="fg" style={{ flex: 1 }}>
                          <label className="flabel">Header</label>
                          <input className="finput" value={c.headerName} placeholder="Authorization" onChange={(e) => updateCred(i, { headerName: e.target.value })} />
                        </div>
                        <div className="fg" style={{ flex: 1 }}>
                          <label className="flabel">Value format</label>
                          <input className="finput" value={c.valueFormat} placeholder="Bearer %s" onChange={(e) => updateCred(i, { valueFormat: e.target.value })} />
                        </div>
                      </div>
                      <div className="cap-sub" style={{ marginTop: 8 }}>Host secret · env var</div>
                      <ListField placeholder="MY_SERVICE_API_KEY" addLabel="Add variable" items={c.envVars} onChange={(v) => updateCred(i, { envVars: v })} />
                    </div>
                  ))}
                  <button className="kit-add-line" onClick={addCred}>
                    <Plus size={12} /> Add
                  </button>
                  <div className="fhint">
                    Set the value on the host with <code>sbx secret set</code>; the agent boots with the variable set to
                    <code>proxy-managed</code>.
                  </div>
                </>
              )}

              {key === 'network' && (
                <>
                  <div className="cap-note">
                    What the kit needs to reach in order to work — declared in the spec's <code>network.allowedDomains</code>.
                    Kits state needs only; they don't carry deny rules.
                  </div>
                  <ListField placeholder="pypi.org" addLabel="Add" items={f.allowedDomains} onChange={(v) => set('allowedDomains', v)} />
                  {f.deniedDomains.length > 0 && (
                    <>
                      {/* Not authored here — kept so editing a hand-written kit
                          doesn't silently drop its deny rules. */}
                      <div className="cap-sub" style={{ marginTop: 10 }}>Deny rules · from the spec</div>
                      {f.deniedDomains.map((d, i) => (
                        <div className="kit-list-row" key={i}>
                          <input className="finput" value={d} readOnly />
                          <button className="btn btn-ghost btn-sm kit-list-rm" onClick={() => set('deniedDomains', f.deniedDomains.filter((_, j) => j !== i))} title="Remove"><X size={13} /></button>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}

              {key === 'memory' && (
                <>
                  <div className="cap-note">
                    Rendered inline into the profile file the kit owns ({f.kind === 'sandbox' ? f.aiFilename.trim() || 'AGENTS.md' : 'the agent\'s own'}) —
                    the agent reads it at session start.
                  </div>
                  {f.kind === 'sandbox' && (
                    <div className="fg" style={{ marginBottom: 8 }}>
                      <label className="flabel">Profile filename</label>
                      <input className="finput" value={f.aiFilename} placeholder="AGENTS.md" onChange={(e) => set('aiFilename', e.target.value)} />
                    </div>
                  )}
                  <textarea
                    className="finput"
                    style={{ minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }}
                    value={f.agentContext}
                    placeholder="This kit exposes X. Ensure Y is set, then call tools under the Z namespace."
                    onChange={(e) => set('agentContext', e.target.value)}
                  />
                  {f.kind === 'mixin' && (
                    <div className="fhint">Mixin kits land in <code>kits-agent-context/{f.name || 'my-kit'}.md</code> next to the agent's profile.</div>
                  )}
                </>
              )}
            </div>
          ))}

          {CAPS.some((c) => !caps.includes(c.key)) && (
            <div className="cap-cta-wrap">
              <button className="cap-cta" onClick={() => setCapMenu((v) => !v)}>
                <Plus size={15} /> Add a capability
              </button>
              {capMenu && (
                <div className="cap-menu">
                  {CAPS.filter((c) => !caps.includes(c.key)).map((c) => (
                    <button key={c.key} className="cap-menu-item" onClick={() => { addCap(c.key); setCapMenu(false) }}>{c.label}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="kit-info-bar">
            <button
              className={`kit-info-toggle${infoView === 'summary' ? ' on' : ''}`}
              onClick={() => setInfoView((v) => (v === 'summary' ? null : 'summary'))}
            >
              <Info size={14} /> Summary
            </button>
            <button
              className={`kit-info-toggle${infoView === 'code' ? ' on' : ''}`}
              onClick={() => setInfoView((v) => (v === 'code' ? null : 'code'))}
            >
              <FileCode2 size={14} /> Code
            </button>
          </div>
          {/* Read-only on purpose: this YAML is generated from the form on every
              keystroke, so an edit here would be overwritten by the next one.
              Hand-editing a spec is what the kit row's "Edit code" panel is for. */}
          {infoView === 'code' && (
            <pre className="kit-code-preview">{buildSpec(f)}</pre>
          )}
          {infoView === 'summary' && (() => {
            const mcpServers = f.mcps.map((id) => MCP_CATALOG.find((m) => m.id === id)).filter(Boolean) as typeof MCP_CATALOG
            const custom = f.customMcps.filter((c) => c.url.trim())
            const { allowed } = kitDomains(f)
            const denied = f.deniedDomains.map((s) => s.trim()).filter(Boolean)
            const envCount = f.envVars.filter((e) => e.key.trim()).length
            const installCount = f.installCmds.filter((c) => c.cmd.trim()).length
            const startupCount = f.startupCmds.filter((c) => c.cmd.trim()).length + mcpStartupCmds(f).length
            const creds = f.creds.filter((c) => c.service.trim())
            const empty = mcpServers.length === 0 && custom.length === 0 && allowed.length === 0 && denied.length === 0 &&
              envCount === 0 && installCount === 0 && startupCount === 0 && creds.length === 0 &&
              f.files.length === 0 && !f.agentContext.trim()
            return (
              <div className="kit-summary">
                <div className="ks-row"><span className="ks-k">Kind</span><span className="ks-v">{f.kind === 'sandbox' ? 'Sandbox kit — full agent' : 'Mixin kit — add-on'}</span></div>
                {f.kind === 'sandbox' && <div className="ks-row"><span className="ks-k">Base</span><span className="ks-v ks-mono">{f.image || '—'}</span></div>}
                {f.kind === 'sandbox' && <div className="ks-row"><span className="ks-k">Entrypoint</span><span className="ks-v ks-mono">{f.entrypoint || '—'}</span></div>}
                {(mcpServers.length > 0 || custom.length > 0) && (
                  <div className="ks-block">
                    <span className="ks-k">Remote MCPs · {mcpServers.length + custom.length}</span>
                    <div className="ks-mcps">
                      {mcpServers.map((m) => (
                        <span className="ks-mcp" key={m.id}><img src={mcpIcon(m.id)} alt="" />{m.name}</span>
                      ))}
                      {custom.map((c, i) => (
                        <span className="ks-mcp" key={`c${i}`}>{c.name.trim() || mcpHost(c.url.trim())}</span>
                      ))}
                    </div>
                  </div>
                )}
                {(installCount > 0 || startupCount > 0) && (
                  <div className="ks-row"><span className="ks-k">Setup</span><span className="ks-v">{installCount} install · {startupCount} startup</span></div>
                )}
                {f.files.length > 0 && (
                  <div className="ks-row"><span className="ks-k">Files</span><span className="ks-v ks-mono">{f.files.map((x) => `${x.target}/${x.dest}`).join(' · ')}</span></div>
                )}
                {envCount > 0 && <div className="ks-row"><span className="ks-k">Environment</span><span className="ks-v">{envCount} variable{envCount === 1 ? '' : 's'}</span></div>}
                {creds.length > 0 && (
                  <div className="ks-row"><span className="ks-k">Credentials</span><span className="ks-v">{creds.map((c) => c.service.trim()).join(' · ')}</span></div>
                )}
                {(allowed.length > 0 || denied.length > 0) && (
                  <div className="ks-row"><span className="ks-k">Requirements</span><span className="ks-v">{allowed.length} allowed{denied.length ? ` · ${denied.length} denied` : ''}</span></div>
                )}
                {f.agentContext.trim() && (
                  <div className="ks-row"><span className="ks-k">Agent instructions</span><span className="ks-v ks-mono">{f.kind === 'sandbox' ? f.aiFilename.trim() || 'AGENTS.md' : `kits-agent-context/${f.name || 'my-kit'}.md`}</span></div>
                )}
                {empty && f.kind === 'mixin' && <div className="ks-empty">No capabilities added yet.</div>}
              </div>
            )
          })()}

          {error && (
            <div style={{ color: 'var(--destruct)', fontSize: 12, marginTop: 4, padding: '8px 10px', background: 'rgba(248,81,73,0.08)', borderRadius: 6, whiteSpace: 'pre-wrap' }}>
              {error}
            </div>
          )}
          {done && (
            <div style={{ color: 'var(--green)', fontSize: 12, marginTop: 4, padding: '8px 10px', background: 'var(--green-dim)', borderRadius: 6 }}>
              ✓ {done}
            </div>
          )}
        </div>

        <div className="m-ftr">
          <button className="btn btn-ghost" onClick={close} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={editing ? handleSave : handleCreate} disabled={saving || !f.name.trim()}>
            {saving ? 'Packing…' : editing ? 'Save & Pack' : 'Create & Pack'}
          </button>
        </div>
      </div>
    </div>
  )
}
