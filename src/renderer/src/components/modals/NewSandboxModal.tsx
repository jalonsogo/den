import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronRight, Check, Plus, RefreshCw } from 'lucide-react'
import { useStore } from '../../store'
import { AgentIcon } from '../AgentIcon'
import { randomName } from '../../lib/names'
import { AGENTS, type AgentType, type Template } from '../../types'

const MEM_VALUES = ['default', '2g', '4g', '8g', '16g', '32g']

export function NewSandboxModal() {
  const { setModal, setSandboxes, setActiveSandboxId, newSandboxWorkspace, newSandboxTemplate } = useStore()

  const [source, setSource]           = useState<'new' | 'template'>(newSandboxTemplate ? 'template' : 'new')
  const [templates, setTemplates]     = useState<Template[]>([])
  const [template, setTemplate]       = useState(newSandboxTemplate ?? '')   // "repository:tag"
  const [name, setName]               = useState(randomName())
  const [agent, setAgent]             = useState<AgentType>('claude')
  const [workspace, setWorkspace]     = useState(newSandboxWorkspace ?? '')
  const [memIdx, setMemIdx]           = useState(0)
  const [clone, setClone]             = useState(false)
  const [advancedOpen, setAdvanced]   = useState(false)
  const [ddOpen, setDdOpen]           = useState(false)
  const [launching, setLaunching]     = useState(false)
  const [error, setError]             = useState('')
  const [availKits, setAvailKits]     = useState<{ name: string; dir: string }[]>([])
  const [selKits, setSelKits]         = useState<string[]>([])

  // Load available templates for the "From template" option.
  useEffect(() => {
    window.minipit?.listTemplates().then((t) => {
      setTemplates(t ?? [])
      if (t && t[0]) setTemplate((cur) => cur || `${t[0].repository}:${t[0].tag}`)
    }).catch(() => {})
    // Mixin kits can be stacked onto the new sandbox at creation (--kit).
    window.minipit?.listKits().then((k) =>
      setAvailKits((k ?? []).filter((x) => x.kind === 'mixin').map((x) => ({ name: x.name, dir: x.dir })))
    ).catch(() => {})
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

  // Default the workspace to the shared ~/minipit folder unless a project was chosen.
  useEffect(() => {
    if (newSandboxWorkspace) return
    window.minipit?.defaultWorkspace().then((dir) => {
      if (dir) setWorkspace((w) => w || dir)
    }).catch(() => {})
  }, [newSandboxWorkspace])

  const handleBrowse = async () => {
    const path = await window.minipit?.showOpenDialog()
    if (path) setWorkspace(path)
  }

  const handleLaunch = async () => {
    if (!workspace) { setError('Workspace is required'); return }
    setError('')
    setLaunching(true)
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
      const sandboxes = await window.minipit?.listSandboxes()
      if (sandboxes) setSandboxes(sandboxes)
      // createSandbox also attaches (sbx run) in the main process — jump straight
      // into the new sandbox so its agent terminal is shown.
      if (created) setActiveSandboxId(created)
      setModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setLaunching(false)
    }
  }

  const cmdParts = [
    'sbx create',
    name.trim() ? `--name ${name.trim()}` : '',
    source === 'template' && template ? `-t ${template.split('/').pop()}` : '',
    memValue !== 'default' ? `-m ${memValue}` : '',
    clone ? '--clone' : '',
    agent,
    workspace || '<workspace>'
  ].filter(Boolean).join(' ')

  return (
    <div className="overlay" onClick={() => !launching && setModal(null)}>
      <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
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
              <select
                className="finput"
                style={{ marginTop: 8, cursor: 'pointer' }}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                {templates.map((t) => {
                  const ref = `${t.repository}:${t.tag}`
                  return <option key={t.id} value={ref}>{t.tag} · {t.flavor}</option>
                })}
              </select>
            )}
          </div>

          {/* Workspace */}
          <div className="fg">
            <label className="flabel">Workspace path</label>
            <div className="frow-2">
              <input
                className="finput"
                value={workspace}
                placeholder="/Users/you/Code/my-project"
                onChange={(e) => setWorkspace(e.target.value)}
                autoFocus
              />
              <button className="btn btn-default btn-sm" onClick={handleBrowse}>Browse…</button>
            </div>
            <div className="fhint">The directory sbx mounts as the agent's primary workspace.</div>
          </div>

          {/* Advanced — collapsible */}
          <div className="adv">
            <button className="adv-toggle" onClick={() => setAdvanced((v) => !v)}>
              <ChevronRight size={13} style={{ transform: advancedOpen ? 'rotate(90deg)' : undefined, transition: 'transform 0.12s' }} />
              Advanced
            </button>

            {advancedOpen && (
              <div className="adv-body">
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

                {availKits.length > 0 && (
                  <div className="fg">
                    <label className="flabel">Mixins <span className="flabel-hint">stacked with --kit</span></label>
                    <div className="kit-multi">
                      {availKits.map((k) => {
                        const on = selKits.includes(k.dir)
                        return (
                          <button
                            key={k.dir}
                            className={`kit-chip${on ? ' on' : ''}`}
                            onClick={() => setSelKits((s) => on ? s.filter((d) => d !== k.dir) : [...s, k.dir])}
                          >
                            {on ? <Check size={12} /> : <Plus size={12} />} {k.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="cmd-blk">
            {cmdParts.split(' ').map((word, i) => {
              if (word === 'sbx') return <span key={i} className="cm-b">{word} </span>
              if (word === 'create' || word === agent) return <span key={i} className="cm-a">{word} </span>
              if (word.startsWith('-')) return <span key={i} className="cm-f">{word} </span>
              return <span key={i} className="cm-v">{word} </span>
            })}
          </div>

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
