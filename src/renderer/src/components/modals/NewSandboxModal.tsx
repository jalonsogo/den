import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronRight, Check, Plus, RefreshCw, Search, Layers, X, DownloadCloud } from 'lucide-react'
import { useStore } from '../../store'
import { AgentIcon } from '../AgentIcon'
import { KitCaps } from '../KitCaps'
import { randomName } from '../../lib/names'
import { parseKitSpec, type ParsedKit } from '../../lib/kitSpec'
import { AGENTS, type AgentType, type Template } from '../../types'

const MEM_VALUES = ['default', '2g', '4g', '8g', '16g', '32g']

export function NewSandboxModal() {
  const { setModal, setSandboxes, setActiveSandboxId, newSandboxWorkspace, newSandboxTemplate, defaultKits } = useStore()

  // Standalone (non-project) sandboxes default to the last folder we created one
  // in; project sessions always pin to the project folder (newSandboxWorkspace).
  const lastWorkspace = localStorage.getItem('minipit:lastWorkspace') ?? ''
  const pinnedWs = newSandboxWorkspace ?? (lastWorkspace || '')

  const [source, setSource]           = useState<'new' | 'template'>(newSandboxTemplate ? 'template' : 'new')
  const [templates, setTemplates]     = useState<Template[]>([])
  const [template, setTemplate]       = useState(newSandboxTemplate ?? '')   // "repository:tag"
  const [name, setName]               = useState(randomName())
  const [agent, setAgent]             = useState<AgentType>('claude')
  const [workspace, setWorkspace]     = useState(pinnedWs)
  const [wsBase, setWsBase]           = useState('')     // ~/den base for the default path
  const [wsEdited, setWsEdited]       = useState(false)  // user picked their own folder
  const [memIdx, setMemIdx]           = useState(0)
  // A session inside a project shares that one folder, so isolate by default to
  // keep concurrent sandboxes from stomping the same working tree (toggleable).
  const [clone, setClone]             = useState(!!newSandboxWorkspace)
  const [advancedOpen, setAdvanced]   = useState(false)
  // Command preview lives in its own accordion; remember the user's show/hide choice.
  const [cmdOpen, setCmdOpen]         = useState(localStorage.getItem('minipit:showCreateCmd') === '1')
  const [ddOpen, setDdOpen]           = useState(false)
  const [launching, setLaunching]     = useState(false)
  const [error, setError]             = useState('')
  const [availKits, setAvailKits]     = useState<{ name: string; dir: string }[]>([])
  const [kitSpecs, setKitSpecs]       = useState<Record<string, ParsedKit>>({})  // dir → parsed spec, for preview
  const [selKits, setSelKits]         = useState<string[]>([])
  const [progress, setProgress]       = useState('')   // live `sbx create` output
  const progRef = useRef<HTMLPreElement>(null)
  const [kitQuery, setKitQuery]       = useState('')
  const [kitDdOpen, setKitDdOpen]     = useState(false)
  const kitDdRef = useRef<HTMLDivElement>(null)

  // Load available templates for the "From template" option.
  useEffect(() => {
    window.minipit?.listTemplates().then((t) => {
      setTemplates(t ?? [])
      if (t && t[0]) setTemplate((cur) => cur || `${t[0].repository}:${t[0].tag}`)
    }).catch(() => {})
    // Mixin kits can be stacked onto the new sandbox at creation (--kit).
    window.minipit?.listKits().then((k) => {
      const mixins = (k ?? []).filter((x) => x.kind === 'mixin').map((x) => ({ name: x.name, dir: x.dir }))
      setAvailKits(mixins)
      // Pre-select any kit the user starred as a default in the Kits page.
      const seed = mixins.filter((m) => defaultKits.includes(m.name)).map((m) => m.dir)
      if (seed.length) setSelKits(seed)
      // Load + parse each local kit's spec so we can preview its capabilities.
      Promise.all(mixins.map(async (m) =>
        [m.dir, parseKitSpec((await window.minipit?.readKit(m.dir)) ?? '')] as const
      )).then((entries) => setKitSpecs(Object.fromEntries(entries))).catch(() => {})
    }).catch(() => {})
  }, [])

  const ddRef = useRef<HTMLDivElement>(null)
  const memValue = MEM_VALUES[memIdx]
  const memPct = `${(memIdx / (MEM_VALUES.length - 1)) * 100}%`
  const agentLabel = AGENTS.find((a) => a.id === agent)?.label ?? agent

  // Close the agent dropdown on outside click.
  useEffect(() => {
    if (!ddOpen) return
    const handler = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setDdOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ddOpen])

  // Close the kit dropdown on outside click.
  useEffect(() => {
    if (!kitDdOpen) return
    const handler = (e: MouseEvent) => {
      if (kitDdRef.current && !kitDdRef.current.contains(e.target as Node)) setKitDdOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [kitDdOpen])

  // Fetch the ~/den base once — only needed for the first-run fallback (no
  // project folder and no remembered last-used folder to default to).
  useEffect(() => {
    if (pinnedWs) return
    window.minipit?.defaultWorkspace().then((dir) => { if (dir) setWsBase(dir) }).catch(() => {})
  }, [pinnedWs])

  // First-run fallback only: default the workspace to ~/den/<name>, tracking the
  // name field until the user picks their own folder. Skipped once we have a
  // pinned folder (a project session, or the remembered last-used folder).
  useEffect(() => {
    if (pinnedWs || wsEdited || !wsBase) return
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
    setWorkspace(slug ? `${wsBase}/${slug}` : wsBase)
  }, [name, wsBase, wsEdited, pinnedWs])

  const handleBrowse = async () => {
    const path = await window.minipit?.showOpenDialog()
    if (path) { setWorkspace(path); setWsEdited(true) }
  }

  const handleLaunch = async () => {
    if (!workspace) { setError('Workspace is required'); return }
    setError('')
    setProgress('')
    setLaunching(true)
    const unsub = window.minipit?.onCreateOutput((chunk) => {
      setProgress((p) => p + chunk)
      requestAnimationFrame(() => { if (progRef.current) progRef.current.scrollTop = progRef.current.scrollHeight })
    })
    try {
      const created = await window.minipit?.createSandbox({
        name: name.trim() || undefined,
        agent,
        workspace,
        memory: memValue !== 'default' ? memValue : undefined,
        branch: clone,
        template: source === 'template' && template ? template : undefined,
        kits: selKits
      })
      // Remember this folder so the next standalone sandbox defaults to it.
      localStorage.setItem('minipit:lastWorkspace', workspace)
      const sandboxes = await window.minipit?.listSandboxes()
      if (sandboxes) setSandboxes(sandboxes)
      // createSandbox also attaches (sbx run) in the main process — jump straight
      // into the new sandbox so its agent terminal is shown.
      if (created) setActiveSandboxId(created)
      unsub?.()
      setModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setLaunching(false)
      unsub?.()
    }
  }

  const cmdParts = [
    'sbx create',
    name.trim() ? `--name ${name.trim()}` : '',
    source === 'template' && template ? `-t ${template}` : '',
    memValue !== 'default' ? `-m ${memValue}` : '',
    clone ? '--clone' : '',
    ...selKits.map((dir) => `--kit ${availKits.find((k) => k.dir === dir)?.name ?? dir}`),
    agent,
    workspace || '<workspace>'
  ].filter(Boolean).join(' ')

  return (
    <div className="overlay" onClick={() => !launching && setModal(null)}>
      <div className="modal" style={{ width: 'clamp(460px, 52vw, 760px)' }} onClick={(e) => e.stopPropagation()}>
        <div className="m-hdr">
          <div className="m-title">New Sandbox</div>
          <div className="m-sub">Pick an agent and workspace, then launch.</div>
        </div>

        <div className="m-body">
          {/* Name — random by default, regenerate or edit */}
          <div className="fg">
            <label className="flabel">Name</label>
            <div className="frow-2">
              <input
                className="finput"
                value={name}
                placeholder="furious-blackhole"
                onChange={(e) => setName(e.target.value)}
              />
              <button className="btn btn-default btn-sm" onClick={() => setName(randomName())} title="Random name">
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          {/* Agent — big dropdown (always shown) */}
          <div className="fg">
            <label className="flabel">Agent</label>
            <div className="agent-dd" ref={ddRef}>
              <button className="agent-dd-btn" onClick={() => setDdOpen((v) => !v)}>
                <AgentIcon agent={agent} size={20} />
                <span className="agent-dd-label">{agentLabel}</span>
                <ChevronDown size={16} style={{ marginLeft: 'auto', color: 'var(--t3)' }} />
              </button>
              {ddOpen && (
                <div className="agent-dd-list">
                  {AGENTS.map((a) => (
                    <div
                      key={a.id}
                      className={`agent-dd-item${a.id === agent ? ' on' : ''}`}
                      onClick={() => { setAgent(a.id); setDdOpen(false) }}
                    >
                      <AgentIcon agent={a.id} size={18} />
                      <span>{a.label}</span>
                      {a.id === agent && <Check size={14} style={{ marginLeft: 'auto', color: 'var(--accent, var(--primary))' }} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Workspace */}
          <div className="fg">
            <label className="flabel">Workspace path</label>
            <div className="frow-2">
              <input
                className="finput"
                value={workspace}
                placeholder="/Users/you/Code/my-project"
                onChange={(e) => { setWorkspace(e.target.value); setWsEdited(true) }}
                autoFocus
              />
              <button className="btn btn-default btn-sm" onClick={handleBrowse}>Browse…</button>
            </div>
            <div className="fhint">The directory sbx mounts as the agent's primary workspace.</div>
          </div>

          {/* Mixin kits — stacked onto the agent at creation (--kit). Accepts
              local kits and remote OCI references (pulled by sbx at creation). */}
          <div className="fg">
            <label className="flabel">Mixin kits <span className="flabel-hint">layered onto the agent</span></label>

            {/* Selected kits as removable items */}
            {selKits.length > 0 && (
              <div className="kit-sel-list">
                {selKits.map((entry) => {
                  const k = availKits.find((a) => a.dir === entry)
                  const remote = !k && entry.includes('/')
                  return (
                    <div key={entry} className="kit-sel-item">
                      {remote ? <DownloadCloud size={13} /> : <Layers size={13} />}
                      <span className="kit-sel-name">{k?.name ?? entry}</span>
                      {remote
                        ? <span className="kit-sel-tag">remote</span>
                        : kitSpecs[entry] && <KitCaps p={kitSpecs[entry]} compact />}
                      <button className="kit-sel-rm" title="Remove" onClick={() => setSelKits((s) => s.filter((d) => d !== entry))}>
                        <X size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Searchable dropdown to add a local kit or paste an OCI reference */}
            <div className="kit-dd" ref={kitDdRef}>
              <button type="button" className="kit-dd-trigger" onClick={() => setKitDdOpen((v) => !v)}>
                <Plus size={13} /> Add a mixin kit
                <ChevronDown size={13} style={{ marginLeft: 'auto', color: 'var(--t3)' }} />
              </button>
              {kitDdOpen && (
                <div className="kit-dd-menu">
                  <div className="kit-dd-search">
                    <Search size={13} className="kit-dd-search-ic" />
                    <input
                      autoFocus
                      value={kitQuery}
                      placeholder="Search local kits or paste an OCI reference…"
                      onChange={(e) => setKitQuery(e.target.value)}
                      onKeyDown={(e) => {
                        const q = kitQuery.trim()
                        if (e.key === 'Enter' && q.includes('/') && !selKits.includes(q)) {
                          setSelKits((s) => [...s, q]); setKitQuery(''); setKitDdOpen(false)
                        }
                      }}
                    />
                  </div>
                  <div className="kit-dd-options">
                    {(() => {
                      const raw = kitQuery.trim()
                      const q = raw.toLowerCase()
                      const opts = availKits.filter((k) => !selKits.includes(k.dir) && (!q || k.name.toLowerCase().includes(q)))
                      const isRef = raw.includes('/') && !selKits.includes(raw)
                      return (
                        <>
                          {isRef && (
                            <button
                              className="kit-dd-opt kit-dd-ref"
                              onClick={() => { setSelKits((s) => [...s, raw]); setKitQuery(''); setKitDdOpen(false) }}
                            >
                              <DownloadCloud size={13} /> Add remote kit: <span className="kit-dd-ref-v">{raw}</span>
                            </button>
                          )}
                          {opts.map((k) => (
                            <div key={k.dir} className="kit-dd-opt-row">
                              <button
                                className="kit-dd-opt"
                                onClick={() => { setSelKits((s) => [...s, k.dir]); setKitQuery(''); setKitDdOpen(false) }}
                              >
                                <Layers size={13} /> {k.name}
                              </button>
                              {kitSpecs[k.dir] && <KitCaps p={kitSpecs[k.dir]} compact />}
                            </div>
                          ))}
                          {!isRef && opts.length === 0 && (
                            <div className="kit-dd-empty">
                              {raw ? 'No local match — paste a full OCI reference to add a remote kit' : 'No local kits — paste an OCI reference to add a remote kit'}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Isolation — clone vs. direct mount changes how your working tree is
              exposed. Defaults on for project sessions (they share one folder). */}
          <div className="fg">
            <label className="flabel">Isolation</label>
            <div className="tog-row">
              <button
                className={`s-toggle${clone ? ' on' : ''}`}
                onClick={() => setClone(!clone)}
              />
              Git clone isolation{' '}
              <code style={{ fontSize: 11, background: 'var(--bg-subtle)', padding: '1px 6px', borderRadius: 4 }}>
                --clone
              </code>
            </div>
            <div className="fhint">
              Work in a standalone clone; your changes stay in the sandbox until you fetch them, instead of mounting your working tree directly.
              {newSandboxWorkspace && ' On by default here because sessions in a project share its folder.'}
            </div>
          </div>

          {/* Advanced — collapsible */}
          <div className="adv">
            <button className="adv-toggle" onClick={() => setAdvanced((v) => !v)}>
              <ChevronRight size={13} style={{ transform: advancedOpen ? 'rotate(90deg)' : undefined, transition: 'transform 0.12s' }} />
              Advanced
            </button>

            {advancedOpen && (
              <div className="adv-body">
                {/* Base: new agent image vs an existing template */}
                <div className="fg">
                  <label className="flabel">Base image</label>
                  <div className="src-seg">
                    <button className={`src-seg-item${source === 'new' ? ' active' : ''}`} onClick={() => setSource('new')}>
                      Default
                    </button>
                    <button
                      className={`src-seg-item${source === 'template' ? ' active' : ''}`}
                      onClick={() => setSource('template')}
                      disabled={templates.length === 0}
                      title={templates.length === 0 ? 'No templates available' : undefined}
                    >
                      From template
                    </button>
                  </div>
                  {source === 'template' && (
                    <>
                      <input
                        className="finput"
                        style={{ marginTop: 8 }}
                        list="tpl-refs"
                        value={template}
                        spellCheck={false}
                        placeholder="registry/repo:tag — pick a local template or paste an OCI reference"
                        onChange={(e) => setTemplate(e.target.value)}
                      />
                      <datalist id="tpl-refs">
                        {templates.map((t) => (
                          <option key={t.id} value={`${t.repository}:${t.tag}`}>{t.tag} · {t.flavor}</option>
                        ))}
                      </datalist>
                      <div className="fhint">Local templates autocomplete; or paste a full OCI reference — sbx pulls it at creation.</div>
                    </>
                  )}
                </div>

                <div className="fg">
                  <label className="flabel" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    Memory
                    <span className="mem-slider-value">{memValue}</span>
                  </label>
                  <div className="mem-slider-wrap">
                    <input
                      type="range" className="mem-slider"
                      min={0} max={MEM_VALUES.length - 1} value={memIdx}
                      style={{ '--pct': memPct } as React.CSSProperties}
                      onChange={(e) => setMemIdx(+e.target.value)}
                    />
                    <div className="mem-slider-labels">
                      {MEM_VALUES.map((v) => <span key={v}>{v}</span>)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {launching || progress ? (
            <div className="cmd-blk create-log">
              <pre ref={progRef} className="create-log-pre">{progress || 'Starting…'}</pre>
            </div>
          ) : (
            <div className="adv">
              <button
                className="adv-toggle"
                onClick={() => { const v = !cmdOpen; setCmdOpen(v); localStorage.setItem('minipit:showCreateCmd', v ? '1' : '0') }}
              >
                <ChevronRight size={13} style={{ transform: cmdOpen ? 'rotate(90deg)' : undefined, transition: 'transform 0.12s' }} />
                Command
              </button>
              {cmdOpen && (
                <div className="adv-body">
                  <div className="cmd-blk">
                    {cmdParts.split(' ').map((word, i) => {
                      if (word === 'sbx') return <span key={i} className="cm-b">{word} </span>
                      if (word === 'create' || word === agent) return <span key={i} className="cm-a">{word} </span>
                      if (word.startsWith('-')) return <span key={i} className="cm-f">{word} </span>
                      return <span key={i} className="cm-v">{word} </span>
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ color: 'var(--destruct)', fontSize: 12, marginTop: 10, padding: '8px 10px', background: 'rgba(239,68,68,0.06)', borderRadius: 6 }}>
              {error}
            </div>
          )}
        </div>

        <div className="m-ftr">
          <button className="btn btn-ghost" onClick={() => setModal(null)} disabled={launching}>Cancel</button>
          <button className="btn btn-primary" onClick={handleLaunch} disabled={launching}>
            {launching ? 'Creating…' : 'Create Sandbox'}
          </button>
        </div>
      </div>
    </div>
  )
}
