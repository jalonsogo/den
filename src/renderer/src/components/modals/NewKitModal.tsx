import { useState, useEffect } from 'react'
import { Plus, X, Paperclip, Info, Search, ChevronDown, Check } from 'lucide-react'
import { useStore } from '../../store'
import { MCP_CATALOG, mcpHost, mcpIcon } from '../../lib/mcpCatalog'
import { parseKitSpec } from '../../lib/kitSpec'
import { AgentIcon } from '../AgentIcon'
import { AGENTS, type AgentType } from '../../types'

type Cap = 'mcp' | 'network' | 'env' | 'memory'

interface KitForm {
  kind: 'mixin' | 'sandbox'
  name: string
  displayName: string
  description: string
  image: string
  entrypoint: string
  mcps: string[]            // catalog ids (Remote MCP primitive)
  installCmds: string[]
  allowedDomains: string[]
  deniedDomains: string[]
  envVars: string[]
  agentContext: string
  attachFiles: string[]     // host paths to bundle into the kit
  customMcps: { name: string; url: string }[]
}

const EMPTY: KitForm = {
  kind: 'mixin', name: '', displayName: '', description: '',
  image: '', entrypoint: '', mcps: [], installCmds: [], allowedDomains: [], deniedDomains: [], envVars: [], agentContext: '', attachFiles: [], customMcps: []
}

const CAPS: { key: Cap; label: string }[] = [
  { key: 'mcp',     label: 'Remote MCPs' },
  { key: 'network', label: 'Network policy' },
  { key: 'env',     label: 'Environment variables' },
  { key: 'memory',  label: 'Agent memory & files' }
]

// One-click starting points for common mixin kits. Selecting one fills the form
// and turns on the capability sections it needs.
const KIT_PRESETS: { id: string; label: string; caps: Cap[]; form: Partial<KitForm> }[] = [
  {
    id: 'vscode-ssh',
    label: 'VSCode (SSH)',
    caps: ['network', 'memory'],
    form: {
      name: 'vscode-ssh',
      displayName: 'VSCode (SSH)',
      description: 'Attach desktop VSCode to this sandbox over the sbx SSH endpoint (Remote-SSH).',
      // Egress VSCode's Remote-SSH server + extension downloads need. The SSH
      // server itself is provided by the sbx endpoint and auto-installed by VSCode
      // on first connect, so no install command is required here.
      allowedDomains: [
        'update.code.visualstudio.com',
        '*.vscode-cdn.net',
        'vscode.download.prss.microsoft.com',
        'marketplace.visualstudio.com',
        '*.vscode-unpkg.net',
        '*.gallerycdn.vsassets.io'
      ],
      agentContext: 'This sandbox is reachable from desktop VSCode via Remote-SSH (den → “Open in VSCode”).'
    }
  }
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

function buildSpec(f: KitForm): string {
  const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`
  const lines: string[] = ['schemaVersion: "1"', `kind: ${f.kind}`, `name: ${f.name || 'my-kit'}`]
  if (f.displayName.trim()) lines.push(`displayName: ${f.displayName.trim()}`)
  if (f.description.trim()) lines.push(`description: ${f.description.trim()}`)

  if (f.kind === 'sandbox') {
    const run = (f.entrypoint.trim() || 'bash').split(/\s+/).filter(Boolean).map(q).join(', ')
    lines.push('sandbox:')
    lines.push(`  image: ${q(f.image.trim() || 'docker/sandbox-templates:claude-code-docker')}`)
    lines.push('  entrypoint:', `    run: [${run}]`)
  }

  // Custom MCPs the user typed (name + url).
  const customMcps = f.customMcps.filter((c) => c.url.trim())
  // Network: manual allow-domains + every selected MCP's host (catalog + custom).
  const mcpServers = f.mcps.map((id) => MCP_CATALOG.find((m) => m.id === id)).filter(Boolean) as typeof MCP_CATALOG
  const allowed = [...new Set([
    ...f.allowedDomains.map((s) => s.trim()).filter(Boolean),
    ...mcpServers.map((m) => mcpHost(m.url)),
    ...customMcps.map((c) => mcpHost(c.url.trim()))
  ])]
  const denied = f.deniedDomains.map((s) => s.trim()).filter(Boolean)
  if (allowed.length || denied.length) {
    lines.push('network:')
    if (allowed.length) { lines.push('  allowedDomains:'); allowed.forEach((d) => lines.push(`    - ${d}`)) }
    if (denied.length) { lines.push('  deniedDomains:'); denied.forEach((d) => lines.push(`    - ${d}`)) }
  }

  const envs = f.envVars.map((s) => s.trim()).filter((s) => s.includes('='))
  if (envs.length) {
    lines.push('environment:', '  variables:')
    envs.forEach((e) => { const i = e.indexOf('='); lines.push(`    ${e.slice(0, i).trim()}: ${q(e.slice(i + 1).trim())}`) })
  }

  // Commands: manual install commands + `claude mcp add` per selected MCP.
  const installCmds = f.installCmds.map((s) => s.trim()).filter(Boolean)
  // MCP registration must run at STARTUP (after the sandbox seeds the agent's
  // settings) and as the agent user, with --scope user so it persists — running
  // it as an install command gets overwritten by setup. `claude` is not on the
  // default PATH for the startup shell (see sbx's own durable-startup script),
  // so prepend the same PATH it uses. Idempotent via `|| true`.
  const PATHFIX = 'export PATH="$HOME/.local/bin:$HOME/.claude/local:$PATH"; '
  const startupCmds = [
    ...mcpServers.map((m) => `${PATHFIX}claude mcp add ${m.id} --transport ${m.transport} ${m.url} --scope user || true`),
    ...customMcps.map((c) => `${PATHFIX}claude mcp add ${(c.name.trim() || 'custom').replace(/\s+/g, '-')} --transport http ${c.url.trim()} --scope user || true`)
  ]
  if (installCmds.length || startupCmds.length) {
    lines.push('commands:')
    if (installCmds.length) {
      lines.push('  install:')
      installCmds.forEach((c) => lines.push(`    - command: ${q(c)}`))
    }
    if (startupCmds.length) {
      // spec.StartupCommand.command is an ARGV array (sbx runs `exec <argv...>`),
      // NOT shell lines — so a bare command string is exec'd as a binary name and
      // fails with 127. Wrap each in `sh -c "<script>"` (mirrors sbx's own startup
      // dispatcher). Runs as `user` 1000 (the agent) so `claude mcp add --scope
      // user` lands in the agent's config, which `/mcp` reads.
      lines.push('  startup:')
      startupCmds.forEach((c) => {
        lines.push('    - command:')
        lines.push('        - "sh"')
        lines.push('        - "-c"')
        lines.push(`        - ${q(c)}`)
        lines.push('      user: "1000"')
      })
    }
  }

  if (f.agentContext.trim()) {
    lines.push('agentContext: |')
    f.agentContext.trim().split('\n').forEach((l) => lines.push(`  ${l}`))
  }
  return lines.join('\n') + '\n'
}

// Inverse of buildSpec — best-effort parse of an existing spec.yaml back into the
// visual form so a kit can be edited. Round-trips kits composed with this editor;
// hand-written YAML with exotic startup commands may not fully map back.
function specToForm(raw: string): { form: KitForm; caps: Cap[] } {
  const p = parseKitSpec(raw)
  // Recover MCP registrations (id/name, transport, url) from `claude mcp add`.
  const mcps: string[] = []
  const customMcps: { name: string; url: string }[] = []
  for (const m of raw.matchAll(/claude\s+mcp\s+add\s+(\S+)\s+--transport\s+(\S+)\s+(\S+)/g)) {
    const name = m[1], url = m[3]
    if (MCP_CATALOG.some((c) => c.id === name)) { if (!mcps.includes(name)) mcps.push(name) }
    else if (!customMcps.some((c) => c.url === url)) customMcps.push({ name, url })
  }
  // Real install commands exclude the auto-generated MCP registrations.
  const installCmds = p.installCmds.filter((c) => !/claude\s+mcp\s+add\s/.test(c))
  // Manual allow-domains exclude hosts auto-derived from the selected MCPs.
  const mcpHosts = new Set<string>([
    ...mcps.map((id) => { const c = MCP_CATALOG.find((x) => x.id === id); return c ? mcpHost(c.url) : '' }),
    ...customMcps.map((c) => mcpHost(c.url))
  ].filter(Boolean))
  const allowedDomains = p.allowedDomains.filter((d) => !mcpHosts.has(d))

  const form: KitForm = {
    kind: p.kind === 'sandbox' ? 'sandbox' : 'mixin',
    name: p.name, displayName: p.displayName, description: p.description,
    image: p.image, entrypoint: p.entrypoint,
    mcps, installCmds, allowedDomains, deniedDomains: p.deniedDomains,
    envVars: p.envVars, agentContext: p.agentContext, attachFiles: [], customMcps
  }
  const caps: Cap[] = []
  if (mcps.length || customMcps.length) caps.push('mcp')
  if (allowedDomains.length || p.deniedDomains.length) caps.push('network')
  if (form.envVars.length) caps.push('env')
  if (form.agentContext.trim()) caps.push('memory')
  return { form, caps }
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

export function NewKitModal() {
  const { setModal, activePage, editKit, setEditKit } = useStore()
  const editing = !!editKit
  // Kind is set by the section that opened the modal (Sandbox Kits vs Mixin Kits);
  // in edit mode it's replaced by the loaded kit's kind.
  const kind: 'mixin' | 'sandbox' = activePage === 'kits' ? 'sandbox' : 'mixin'
  const [f, setF] = useState<KitForm>({
    ...EMPTY, kind,
    ...(kind === 'sandbox' ? { image: AGENT_BASES.claude.image, entrypoint: AGENT_BASES.claude.entrypoint } : {})
  })
  const [imgCustom, setImgCustom] = useState(false)
  const [agentDd, setAgentDd] = useState(false)
  const [caps, setCaps] = useState<Cap[]>([])
  const [showInfo, setShowInfo] = useState(false)
  const [capMenu, setCapMenu] = useState(false)
  const [mcpQuery, setMcpQuery] = useState('')
  const [mcpCat, setMcpCat] = useState('All')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const set = (k: keyof KitForm, v: KitForm[keyof KitForm]) => setF((prev) => ({ ...prev, [k]: v }))

  // In edit mode, load the kit's spec.yaml and hydrate the form + open the
  // capability blocks it already uses.
  useEffect(() => {
    if (!editKit) return
    let cancelled = false
    window.minipit?.readKit(editKit.dir).then((raw) => {
      if (cancelled || !raw) return
      const { form, caps: c } = specToForm(raw)
      setF(form)
      setCaps(c)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [editKit])

  // Close and clear the edit target so the next open is a fresh "create".
  const close = () => { setModal(null); setEditKit(null) }

  const addCap = (key: Cap) => setCaps((c) => (c.includes(key) ? c : [...c, key]))
  const removeCap = (key: Cap) => {
    setCaps((c) => c.filter((k) => k !== key))
    // Clear that primitive's content so it doesn't leak into the spec.
    if (key === 'mcp') setF((p) => ({ ...p, mcps: [], customMcps: [] }))
    if (key === 'network') setF((p) => ({ ...p, allowedDomains: [], deniedDomains: [] }))
    if (key === 'env') set('envVars', [])
    if (key === 'memory') setF((p) => ({ ...p, agentContext: '', attachFiles: [] }))
  }
  const toggleMcp = (id: string) =>
    setF((p) => ({ ...p, mcps: p.mcps.includes(id) ? p.mcps.filter((m) => m !== id) : [...p.mcps, id] }))
  const addCustomMcp = () => setF((p) => ({ ...p, customMcps: [...p.customMcps, { name: '', url: '' }] }))
  const updateCustomMcp = (i: number, field: 'name' | 'url', val: string) =>
    setF((p) => ({ ...p, customMcps: p.customMcps.map((c, j) => (j === i ? { ...c, [field]: val } : c)) }))
  const removeCustomMcp = (i: number) => setF((p) => ({ ...p, customMcps: p.customMcps.filter((_, j) => j !== i) }))

  const attach = async () => {
    const picked = await window.minipit?.pickFiles().catch(() => [])
    if (picked?.length) setF((p) => ({ ...p, attachFiles: [...new Set([...p.attachFiles, ...picked])] }))
  }

  const applyPreset = (p: (typeof KIT_PRESETS)[number]) => {
    setF((prev) => ({ ...EMPTY, kind: prev.kind, ...p.form }))
    setCaps(p.caps)
  }

  const handleCreate = async () => {
    if (!f.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError(''); setDone('')
    try {
      const res = await window.minipit?.createKit(f.name.trim(), buildSpec(f), f.attachFiles)
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
    const res = await window.minipit?.updateKit(editKit.dir, buildSpec(f), f.attachFiles)
      .catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }))
    if (res?.ok) {
      setDone('Saved & re-packed')
      setTimeout(() => close(), 1000)
    } else {
      setError(res?.error || 'Failed to save kit'); setSaving(false)
    }
  }

  const capLabel = (key: Cap) => CAPS.find((c) => c.key === key)?.label ?? key

  return (
    <div className="overlay" onClick={() => !saving && close()}>
      <div className="modal modal-adaptive" style={{ width: 'min(1200px, 100%)' }} onClick={(e) => e.stopPropagation()}>
        <div className="m-hdr">
          <div className="m-title">{editing ? 'Edit' : 'New'} {f.kind === 'sandbox' ? 'Sandbox' : 'Mixin'} Kit</div>
          <div className="m-sub">
            {f.kind === 'sandbox'
              ? 'Define a full agent — image, entrypoint, and capabilities. den writes the spec.yaml and packs it.'
              : 'Compose add-ons (MCPs, commands, policy, env, memory) for an existing agent.'}
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

          {!editing && f.kind === 'mixin' && (
            <div className="fg">
              <label className="flabel">Start from a preset <span className="flabel-hint">fills the form below</span></label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {KIT_PRESETS.map((p) => (
                  <button key={p.id} className="btn btn-default btn-sm" type="button" onClick={() => applyPreset(p)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {f.kind === 'sandbox' && (() => {
            const selAgent = imgCustom ? null : (AGENTS.find((a) => AGENT_BASES[a.id]?.image === f.image)?.id ?? null)
            const selLabel = imgCustom || !selAgent ? 'Custom image' : (AGENTS.find((a) => a.id === selAgent)?.label ?? selAgent)
            return (
              <>
                <div className="fg">
                  <label className="flabel">Base agent <span className="flabel-hint">image + entrypoint are editable</span></label>
                  <div className="agent-dd">
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
          {caps.length > 0 && <label className="flabel">Capabilities</label>}
          {caps.map((key) => (
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
                    <div className="fhint">{f.mcps.length + f.customMcps.length || 'No'} selected — each adds an allow rule + <code>claude mcp add</code>.</div>
                  </>
                )
              })()}

              {key === 'network' && (
                <>
                  <div className="cap-sub">Allowed domains</div>
                  <ListField placeholder="api.example.com" addLabel="Add allowed" items={f.allowedDomains} onChange={(v) => set('allowedDomains', v)} />
                  <div className="cap-sub" style={{ marginTop: 8 }}>Denied domains</div>
                  <ListField placeholder="telemetry.example.com" addLabel="Add denied" items={f.deniedDomains} onChange={(v) => set('deniedDomains', v)} />
                </>
              )}

              {key === 'env' && (
                <ListField placeholder="KEY=value" addLabel="Add variable" items={f.envVars} onChange={(v) => set('envVars', v)} />
              )}

              {key === 'memory' && (
                <>
                  <textarea
                    className="finput"
                    style={{ minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }}
                    value={f.agentContext}
                    placeholder="Notes appended to the agent's memory (CLAUDE.md / AGENTS.md)…"
                    onChange={(e) => set('agentContext', e.target.value)}
                  />
                  <div className="cap-sub" style={{ marginTop: 10 }}>Reference files</div>
                  {f.attachFiles.map((p, i) => (
                    <div className="kit-file" key={p}>
                      <Paperclip size={12} />
                      <span className="kit-file-name">{p.split('/').pop()}</span>
                      <button className="kit-file-rm" onClick={() => set('attachFiles', f.attachFiles.filter((_, j) => j !== i))} title="Remove"><X size={12} /></button>
                    </div>
                  ))}
                  <button className="kit-add-line" onClick={attach}>
                    <Paperclip size={12} /> Attach files (pdf, txt, md…)
                  </button>
                  <div className="fhint">Bundled into the kit and dropped into the sandbox workspace.</div>
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

          <button className={`kit-info-toggle${showInfo ? ' on' : ''}`} onClick={() => setShowInfo((v) => !v)}>
            <Info size={14} /> Summary
          </button>
          {showInfo && (() => {
            const mcpServers = f.mcps.map((id) => MCP_CATALOG.find((m) => m.id === id)).filter(Boolean) as typeof MCP_CATALOG
            const custom = f.customMcps.filter((c) => c.url.trim())
            const allowed = new Set([...f.allowedDomains.map((s) => s.trim()).filter(Boolean), ...mcpServers.map((m) => mcpHost(m.url)), ...custom.map((c) => mcpHost(c.url.trim()))])
            const denied = f.deniedDomains.map((s) => s.trim()).filter(Boolean)
            const envCount = f.envVars.filter((s) => s.includes('=')).length
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
                {(allowed.size > 0 || denied.length > 0) && (
                  <div className="ks-row"><span className="ks-k">Network</span><span className="ks-v">{allowed.size} allowed · {denied.length} denied</span></div>
                )}
                {envCount > 0 && <div className="ks-row"><span className="ks-k">Env vars</span><span className="ks-v">{envCount}</span></div>}
                {(f.agentContext.trim() || f.attachFiles.length > 0) && (
                  <div className="ks-row"><span className="ks-k">Memory</span><span className="ks-v">{[f.agentContext.trim() ? 'notes' : '', f.attachFiles.length ? `${f.attachFiles.length} file${f.attachFiles.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</span></div>
                )}
                {mcpServers.length === 0 && allowed.size === 0 && denied.length === 0 && envCount === 0 && !f.agentContext.trim() && f.attachFiles.length === 0 && f.kind === 'mixin' && (
                  <div className="ks-empty">No capabilities added yet.</div>
                )}
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
