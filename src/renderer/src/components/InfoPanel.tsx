import { useEffect, useState } from 'react'
import { X, Layers, AlertTriangle, ShieldAlert, ChevronRight, ChevronDown, Check, Ban, Globe, Scale, Lock } from 'lucide-react'
import { useStore } from '../store'
import { formatUptime } from '../lib/utils'
import { PortsPanel } from './PortsPanel'
import { MountsPanel } from './MountsPanel'
import { AgentIcon } from './AgentIcon'
import { AGENTS, type Sandbox, type NetworkPolicy, type PolicyBlock, type PolicyRule } from '../types'

const NO_BLOCKS: PolicyBlock[] = []

interface InjectedSecret { name: string; source?: string }

// Read an `sbx inspect --json` object. The v0.35 schema carries `secrets` as
// [{ name, source }] and an `auth_mode` string; we stay tolerant of shape drift
// (string entries, alternate key names).
function extractInspect(json: unknown): { secrets: InjectedSecret[]; authMode?: string } {
  if (!json || typeof json !== 'object') return { secrets: [] }
  const obj = json as Record<string, unknown>
  const rawSecrets = obj.secrets ?? obj.injected_secrets ?? obj.injectedSecrets
  const secrets: InjectedSecret[] = Array.isArray(rawSecrets)
    ? rawSecrets.map((s) => {
        if (typeof s === 'string') return { name: s }
        if (s && typeof s === 'object') {
          const o = s as Record<string, unknown>
          return { name: String(o.name ?? o.service ?? o.id ?? ''), source: o.source ? String(o.source) : undefined }
        }
        return { name: '' }
      }).filter((s) => s.name)
    : []
  const authMode = typeof obj.auth_mode === 'string' ? obj.auth_mode : undefined
  return { secrets, authMode }
}

// Infer which preset is currently in force from the policy's rules, so the
// picker highlights the *active* preset (not just whatever the user last clicked).
function detectPreset(rules: PolicyRule[]): 'allow-all' | 'balanced' | 'deny-all' {
  const names = rules.map((r) => r.rule.toLowerCase())
  if (names.some((n) => n.includes('allow-all')) ||
      rules.some((r) => r.decision.toUpperCase() === 'ALLOW' && r.resources.includes('**'))) return 'allow-all'
  if (names.some((n) => n.includes('deny-all'))) return 'deny-all'
  return 'balanced'
}

// Collapsible section with a badge that stays visible when collapsed (so
// attention items like network blocks aren't hidden). Open state persists.
function AccordionSection({ id, title, badge, alert = false, defaultOpen = false, children }: {
  id: string
  title: string
  badge?: React.ReactNode
  alert?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const key = `minipit:info-acc:${id}`
  const [open, setOpen] = useState(() => {
    const v = localStorage.getItem(key)
    return v === null ? defaultOpen : v === '1'
  })
  const toggle = () => { const n = !open; setOpen(n); localStorage.setItem(key, n ? '1' : '0') }
  return (
    <div className={`info-acc${open ? ' open' : ''}`}>
      <button className="info-acc-hd" onClick={toggle}>
        {open ? <ChevronDown size={14} className="info-acc-chev" /> : <ChevronRight size={14} className="info-acc-chev" />}
        <span className="info-acc-title">{title}</span>
        {badge != null && <span className={`info-acc-badge${alert ? ' alert' : ''}`}>{badge}</span>}
      </button>
      {open && <div className="info-acc-body">{children}</div>}
    </div>
  )
}

export function InfoPanel({ sandbox, onClose }: { sandbox: Sandbox; onClose?: () => void }) {
  const { updateSandbox, ackPolicyBlocks } = useStore()
  // Select the stored array directly (a stable ref) and fall back to a shared
  // constant — `?? []` inside the selector returns a new array each render and
  // sends zustand into an infinite re-render loop.
  const blocks = useStore((s) => s.policyBlocks[sandbox.name]) ?? NO_BLOCKS

  // Looking at the panel counts as seeing the blocks → clears the badge.
  useEffect(() => { ackPolicyBlocks(sandbox.name) }, [sandbox.name, blocks.length])

  const [policy, setPolicy] = useState<NetworkPolicy | null>(null)
  const [polLoading, setPolLoading] = useState(true)
  const [kits, setKits] = useState<string[]>([])
  // `sbx inspect --json` detail — injected secrets + auth mode.
  const [inspect, setInspect] = useState<{ secrets: InjectedSecret[]; authMode?: string } | null>(null)

  useEffect(() => {
    window.minipit?.appliedKits(sandbox.name).then((k) => setKits(k ?? [])).catch(() => setKits([]))
    window.minipit?.sbxInspect(sandbox.name)
      .then((r) => setInspect(r?.ok ? extractInspect(r.json) : null))
      .catch(() => setInspect(null))
  }, [sandbox.name])
  const [allowBusy, setAllowBusy] = useState(false)   // one-click allow from a recent block
  const [allowMsg, setAllowMsg] = useState<{ ok: boolean; text: string; offerRestart?: boolean } | null>(null)
  const [restarting, setRestarting] = useState(false)
  const [rmBusy, setRmBusy] = useState<string | null>(null)
  const [preset, setPreset] = useState('balanced')
  const [presetBusy, setPresetBusy] = useState(false)
  // Staged rules: "+ Add rule" appends a pending card; "Apply" commits them all.
  const [addOpen, setAddOpen] = useState(false)
  const [addDecision, setAddDecision] = useState<'allow' | 'block'>('allow')
  const [addInput, setAddInput] = useState('')
  const [pending, setPending] = useState<{ decision: 'allow' | 'block'; resources: string }[]>([])
  const [applyBusy, setApplyBusy] = useState(false)
  // "Test access" — preview whether the current policy would allow a host,
  // without running anything (`sbx policy check network`).
  const [checkOpen, setCheckOpen] = useState(false)
  const [checkInput, setCheckInput] = useState('')
  const [checkBusy, setCheckBusy] = useState(false)
  const [checkResult, setCheckResult] = useState<{ decision: 'allow' | 'deny' | 'unknown'; text: string } | null>(null)

  const loadPolicy = () => {
    setPolLoading(true)
    window.minipit?.networkPolicy(sandbox.name)
      .then((p) => {
        setPolicy(p ?? null)
        // Sync the picker to the active preset so it reflects reality.
        if (p?.ok && p.rules) setPreset(detectPreset(p.rules))
      })
      .catch(() => setPolicy(null))
      .finally(() => setPolLoading(false))
  }
  useEffect(loadPolicy, [sandbox.name])

  // Stage a rule as a pending card (committed later via Apply).
  const addPending = () => {
    const resources = addInput.trim()
    if (!resources) return
    setPending((p) => [...p, { decision: addDecision, resources }])
    setAddInput('')
    setAddOpen(false)
    setAllowMsg(null)
  }

  // Commit all staged rules (allow → policyAllow, block → policyDeny).
  const applyPending = async () => {
    if (!pending.length || applyBusy) return
    setApplyBusy(true)
    setAllowMsg(null)
    const remaining: typeof pending = []
    let failed: string | null = null
    for (const r of pending) {
      const res = r.decision === 'allow'
        ? await window.minipit?.policyAllow(sandbox.name, r.resources).catch(() => null)
        : await window.minipit?.policyDeny(sandbox.name, r.resources).catch(() => null)
      if (!res?.ok) { remaining.push(r); if (!failed) failed = res?.error || `Failed to add ${r.resources}.` }
    }
    setPending(remaining)
    setApplyBusy(false)
    if (failed) setAllowMsg({ ok: false, text: failed })
    else { setAllowMsg({ ok: true, text: 'Rules applied.', offerRestart: true }); loadPolicy() }
  }

  const runCheck = async () => {
    const resource = checkInput.trim()
    if (!resource || checkBusy) return
    setCheckBusy(true)
    setCheckResult(null)
    const r = await window.minipit?.policyCheck(resource, sandbox.name).catch(() => null)
    setCheckBusy(false)
    if (!r) { setCheckResult({ decision: 'unknown', text: 'Check failed.' }); return }
    const text = r.decision === 'allow' ? `Allowed — ${resource} would be reachable.`
      : r.decision === 'deny' ? `Blocked — ${resource} would be denied by policy.`
        : (r.raw?.trim() || r.error || 'Could not determine a decision.')
    setCheckResult({ decision: r.decision, text })
  }

  // One-click allow straight from a recent block.
  const allowHost = async (host: string) => {
    if (allowBusy) return
    setAllowBusy(true)
    setAllowMsg(null)
    const res = await window.minipit?.policyAllow(sandbox.name, host).catch(() => null)
    setAllowBusy(false)
    if (res?.ok) {
      setAllowMsg({ ok: true, text: `Allowed ${host}.`, offerRestart: true })
      loadPolicy()
    } else {
      setAllowMsg({ ok: false, text: res?.error || `Failed to allow ${host}.` })
    }
  }

  // Remove a local rule by its resource value (the chip you click ×).
  const removeResource = async (resource: string) => {
    if (rmBusy) return
    setRmBusy(resource)
    setAllowMsg(null)
    const res = await window.minipit?.policyRm(sandbox.name, resource).catch(() => null)
    setRmBusy(null)
    if (res?.ok) {
      setAllowMsg({ ok: true, text: `Removed ${resource}.`, offerRestart: true })
      loadPolicy()
    } else {
      setAllowMsg({ ok: false, text: res?.error || `Failed to remove ${resource}.` })
    }
  }

  // Reset ALL custom network rules, then set the chosen preset as default.
  const resetPolicy = async () => {
    if (presetBusy) return
    if (!window.confirm(`Remove all custom network rules and set the default preset to “${preset}”?`)) return
    setPresetBusy(true)
    setAllowMsg(null)
    const res = await window.minipit?.policyReset(preset).catch(() => null)
    setPresetBusy(false)
    if (res?.ok) {
      setAllowMsg({ ok: true, text: `Rules reset — default preset is now “${preset}”.`, offerRestart: true })
      loadPolicy()
    } else {
      setAllowMsg({ ok: false, text: res?.error || 'Failed to reset rules.' })
    }
  }

  // Restart (or start) the sandbox so a freshly-added policy takes effect.
  const handleRestart = async () => {
    setRestarting(true)
    try {
      if (sandbox.status === 'running') await window.minipit?.stopSandbox(sandbox.name)
      await window.minipit?.runSandbox(sandbox.name)
      updateSandbox(sandbox.id, { status: 'running' })
      setAllowMsg({ ok: true, text: 'Sandbox restarted — new policy applied.' })
      // The new policy only takes effect on (re)start, so re-read it now to
      // refresh the rule list (and the active-preset highlight).
      loadPolicy()
    } catch {
      setAllowMsg({ ok: false, text: 'Restart failed — try Stop then Run manually.' })
    } finally {
      setRestarting(false)
    }
  }


  return (
    <div className="info-dock">
      <div className="info-dock-hd">
        <span className="info-dock-title">Sandbox info</span>
        {onClose && (
          <button className="info-dock-x" onClick={onClose} title="Close"><X size={15} /></button>
        )}
      </div>
      <div className="info-panel">
      <div className="info-stats">
        <div className="info-stat">
          <span className="is-k">Status</span>
          <span className="is-v" style={{ textTransform: 'capitalize' }}>
            {sandbox.status}
            {sandbox.status === 'running' && sandbox.uptimeSeconds
              ? <span className="is-sub">· {formatUptime(sandbox.uptimeSeconds)}</span> : null}
          </span>
        </div>
        <div className="info-stat">
          <span className="is-k">Agent</span>
          <span className="is-v is-agent"><AgentIcon agent={sandbox.agent} size={14} />{AGENTS.find((a) => a.id === sandbox.agent)?.label ?? sandbox.agent}</span>
        </div>
        <div className="info-stat">
          <span className="is-k">Memory</span>
          <span className="is-v">{sandbox.memory ?? '—'} <span className="is-sub">· max 32g</span></span>
        </div>
        <div className="info-stat">
          <span className="is-k">Branch</span>
          <span className="is-v">{sandbox.branch ?? '—'} <span className="is-sub">· {sandbox.branch ? 'worktree' : 'no isolation'}</span></span>
        </div>
      </div>

      {blocks.length > 0 && (
        <div className="np-blocks np-blocks-top">
          <div className="np-blocks-hd">
            <ShieldAlert size={13} className="np-blocks-ic" />
            Recent blocks
          </div>
          {blocks.slice(0, 6).map((b, i) => (
            <div className="np-block" key={`${b.host}|${b.at}|${i}`}>
              <div className="np-block-body">
                <span className="np-block-host">{b.host}</span>
                <span className="np-block-meta">
                  {b.rule ? `${b.rule} · ` : ''}{new Date(b.at).toLocaleTimeString()}
                </span>
              </div>
              <button className="btn btn-default btn-sm" onClick={() => allowHost(b.host)} disabled={allowBusy}>
                Allow
              </button>
            </div>
          ))}
        </div>
      )}

      <AccordionSection id="workspaces" title="Workspaces" defaultOpen>
        <div className="info-row info-row-stack">
          <span className="ir-label">Primary (read-write)</span>
          <span
            className="ir-val"
            title="Double-click to reveal in Finder"
            onDoubleClick={() => window.minipit?.openInFinder(sandbox.workspace)}
          >{sandbox.workspace}</span>
        </div>
        {sandbox.additionalWorkspaces?.map((ws, i) => (
          <div className="info-row info-row-stack" key={i}>
            <span className="ir-label">{ws.readonly ? 'Read-only' : 'Read-write'}</span>
            <span className="ir-val">{ws.path}</span>
          </div>
        ))}
        <MountsPanel sandbox={sandbox} />
      </AccordionSection>

      {kits.length > 0 && (
        <AccordionSection id="kits" title="Kits" badge={kits.length}>
          <div className="info-kits">
            {kits.map((k) => <span className="info-kit" key={k}><Layers size={12} />{k}</span>)}
          </div>
        </AccordionSection>
      )}

      {inspect && (inspect.secrets.length > 0 || inspect.authMode) && (
        <AccordionSection id="secrets" title="Injected secrets" badge={inspect.secrets.length || undefined}>
          {inspect.authMode && (
            <div className="ss-sub" style={{ marginBottom: 6 }}>Auth mode: <strong>{inspect.authMode}</strong></div>
          )}
          {inspect.secrets.length > 0 && (
            <div className="info-kits">
              {inspect.secrets.map((s) => (
                <span className="info-kit" key={s.name}>
                  <Lock size={12} />{s.name}{s.source ? <span style={{ opacity: 0.6 }}> · {s.source}</span> : null}
                </span>
              ))}
            </div>
          )}
          <div className="ss-sub" style={{ marginTop: 6 }}>
            Credentials this sandbox receives via the proxy (from <code>sbx inspect</code>). Values are never exposed.
          </div>
        </AccordionSection>
      )}

      <AccordionSection id="ports" title="Ports" badge={sandbox.ports.length || undefined} defaultOpen>
        <PortsPanel sandbox={sandbox} />
      </AccordionSection>

      <AccordionSection
        id="network"
        title="Network policy"
        badge={blocks.length || undefined}
        alert={blocks.length > 0}
        defaultOpen={blocks.length > 0}
      >

        {polLoading ? (
          <div className="np-empty">Reading policy…</div>
        ) : !policy?.ok ? (
          <div className="np-empty">Couldn’t read policy{policy?.error ? `: ${policy.error}` : '.'}</div>
        ) : (
          <>
            {(policy.governance || policy.sync) && (
              <div className="np-meta">
                {policy.governance && <span className="np-gov">⛬ {policy.governance}</span>}
                {policy.sync && <span className="np-sync">{policy.sync}</span>}
              </div>
            )}
            {policy.governance && (
              <div className="np-gov-note">
                <AlertTriangle size={14} className="np-gov-ic" />
                <span>
                  <strong>{policy.governance}.</strong> Local allow rules may be overridden — to guarantee
                  access, the domain must be added to the governance profile.
                </span>
              </div>
            )}
            {!policy.governance && (() => {
              const activePreset = detectPreset(policy.rules ?? [])
              const PRESETS = [
                { v: 'allow-all', l: 'Allow all', s: 'All outbound', Icon: Globe },
                { v: 'balanced', l: 'Balanced', s: 'AI APIs & pkgs', Icon: Scale },
                { v: 'deny-all', l: 'Deny all', s: 'Allowlist only', Icon: Lock }
              ] as const
              // What each preset does — shown as a preview when a different one is selected.
              const PREVIEW: Record<string, string[]> = {
                'allow-all': ['Allow all outbound traffic (**).'],
                'balanced': ['Allow AI provider APIs (Anthropic, OpenAI, Google, …)', 'Allow package registries (npm, PyPI, crates, …)', 'Block everything else'],
                'deny-all': ['Block all outbound', 'Only rules you add below are allowed']
              }
              const changing = preset !== activePreset
              const label = PRESETS.find((p) => p.v === preset)?.l ?? preset
              return (
                <div className="np-preset">
                  <span className="np-preset-lbl">Default preset</span>
                  <div className="np-seg">
                    {PRESETS.map((o) => (
                      <button key={o.v} className={`np-seg-opt${preset === o.v ? ' on' : ''}`} onClick={() => setPreset(o.v)}>
                        <o.Icon size={15} className="np-seg-ic" />
                        <span className="np-seg-l">
                          {o.l}
                          {activePreset === o.v && <span className="np-seg-dot" title="Active preset" />}
                        </span>
                        <span className="np-seg-s">{o.s}</span>
                      </button>
                    ))}
                  </div>
                  {changing && (
                    <div className="np-preview">
                      <div className="np-preview-hd">Preview · {label}</div>
                      {PREVIEW[preset]?.map((line, i) => <div className="np-preview-line" key={i}>{line}</div>)}
                      <div className="np-preview-note">
                        Replaces the current rules{policy.rules && policy.rules.length ? ` (removes the ${policy.rules.length} below)` : ''}; takes effect after a restart.
                      </div>
                    </div>
                  )}
                  <div className="np-preset-actions">
                    <button
                      className="btn btn-default btn-sm"
                      onClick={resetPolicy}
                      disabled={presetBusy || !changing}
                      title={changing ? 'Apply the selected preset (resets custom rules).' : 'This preset is already active.'}
                    >
                      {presetBusy ? 'Applying…' : changing ? 'Apply preset' : 'Current preset'}
                    </button>
                  </div>
                </div>
              )
            })()}
            {policy.rules && policy.rules.length > 0 ? (
              <div className="np-rules">
                {policy.rules.map((r, i) => (
                  <div className="np-rule" key={i}>
                    <div className="np-rule-hd">
                      <span className={`np-dec np-dec-${r.decision.toLowerCase()}`}>{r.decision}</span>
                      <span className="np-rule-name">{r.rule}</span>
                      <span className="np-scope">
                        {r.appliesTo === 'all' ? 'all sandboxes' : r.appliesTo} · {r.provenance}
                      </span>
                    </div>
                    <div className="np-res">
                      {r.resources.map((res, j) => (
                        <span className="np-chip" key={j}>
                          {res}
                          {!policy.governance && (
                            <button
                              className="np-chip-x"
                              title="Remove this rule"
                              disabled={rmBusy === res}
                              onClick={() => removeResource(res)}
                              style={{
                                marginLeft: 5, border: 'none', background: 'none',
                                cursor: 'pointer', color: 'inherit', opacity: 0.6, padding: 0,
                                font: 'inherit', lineHeight: 1
                              }}
                            >
                              {rmBusy === res ? '…' : '×'}
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="np-empty">No explicit network rules — traffic follows the default policy.</div>
            )}
            {pending.length > 0 && (
              <div className="np-rules" style={{ marginTop: 7 }}>
                {pending.map((p, i) => (
                  <div className="np-rule np-rule-pending" key={i}>
                    <div className="np-rule-hd">
                      <span className={`np-dec np-dec-${p.decision === 'allow' ? 'allow' : 'deny'}`}>{p.decision === 'allow' ? 'ALLOW' : 'BLOCK'}</span>
                      <span className="np-rule-name">Pending — apply to save</span>
                      <button className="np-pending-x" title="Remove" onClick={() => setPending(pending.filter((_, j) => j !== i))}>×</button>
                    </div>
                    <div className="np-res">
                      {p.resources.split(',').map((res, j) => res.trim() && <span className="np-chip" key={j}>{res.trim()}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="np-note">
              Agents can only reach the allowed resources above; anything else is blocked by the default deny policy.
            </div>
          </>
        )}

        {!polLoading && (
          <div className="np-add-box">
            {/* The draft "fake card" for a new rule sits above the CTA row. */}
            {addOpen && (
              <div className="np-add-form np-rule np-rule-draft">
                <div className="np-dec-seg">
                  <button className={`np-dec-opt${addDecision === 'allow' ? ' on' : ''}`} onClick={() => setAddDecision('allow')}>
                    <Check size={13} className="np-dec-ic-allow" /> Allow
                  </button>
                  {!policy?.governance && (
                    <button className={`np-dec-opt${addDecision === 'block' ? ' on' : ''}`} onClick={() => setAddDecision('block')}>
                      <Ban size={13} className="np-dec-ic-block" /> Block
                    </button>
                  )}
                </div>
                <input
                  className="np-add-input"
                  value={addInput}
                  placeholder="example.com,  *.example.com:443"
                  autoFocus
                  onChange={(e) => setAddInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addPending() }}
                />
                <div className="np-add-form-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => { setAddOpen(false); setAddInput('') }}>Cancel</button>
                  <button className="btn btn-default btn-sm" onClick={addPending} disabled={!addInput.trim()}>Add</button>
                </div>
              </div>
            )}

            {checkOpen && (
              <div className="np-add-form np-rule np-rule-draft">
                <input
                  className="np-add-input"
                  value={checkInput}
                  placeholder="example.com  or  example.com:443"
                  autoFocus
                  onChange={(e) => { setCheckInput(e.target.value); setCheckResult(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') runCheck() }}
                />
                <div className="np-add-form-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => { setCheckOpen(false); setCheckInput(''); setCheckResult(null) }}>Cancel</button>
                  <button className="btn btn-default btn-sm" onClick={runCheck} disabled={!checkInput.trim() || checkBusy}>
                    {checkBusy ? 'Checking…' : 'Check'}
                  </button>
                </div>
              </div>
            )}

            {checkResult && (
              <div className={`np-banner ${checkResult.decision === 'allow' ? 'ok' : checkResult.decision === 'deny' ? 'err' : ''}`}>
                <span className="np-banner-txt">{checkResult.text}</span>
              </div>
            )}

            <div className="np-add-cta">
              {pending.length > 0 && (
                <button className="btn btn-default btn-sm" onClick={applyPending} disabled={applyBusy}>
                  {applyBusy ? 'Applying…' : `Apply${pending.length > 1 ? ` (${pending.length})` : ''}`}
                </button>
              )}
              <button className="btn btn-default btn-sm" onClick={() => { setCheckOpen((o) => !o); setCheckResult(null) }}>Test access</button>
              <button className="btn btn-default btn-sm" onClick={() => { setAddOpen((o) => !o); setAllowMsg(null) }}>+ Add rule</button>
            </div>

            {allowMsg && (
              <div className={`np-banner ${allowMsg.ok ? 'ok' : 'err'}`}>
                <span className="np-banner-txt">{allowMsg.text}</span>
                {allowMsg.offerRestart && (
                  <button className="btn btn-default btn-sm" onClick={handleRestart} disabled={restarting}>
                    {restarting
                      ? (sandbox.status === 'running' ? 'Restarting…' : 'Starting…')
                      : (sandbox.status === 'running' ? 'Restart sandbox' : 'Start sandbox')}
                  </button>
                )}
              </div>
            )}

          </div>
        )}
      </AccordionSection>
      </div>
    </div>
  )
}
