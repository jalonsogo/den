import { useEffect, useState } from 'react'
import { AlertTriangle, ShieldAlert, Check, Ban, Globe, Scale, Lock, RotateCw } from 'lucide-react'
import { useStore } from '../store'
import { PortsPanel } from './PortsPanel'
import { AccordionSection } from './AccordionSection'
import type { Sandbox, NetworkPolicy, PolicyBlock, PolicyRule } from '../types'

const NO_BLOCKS: PolicyBlock[] = []
const NO_CHANGES: string[] = []

// How long an allowed block stays on screen showing its "Allowed" confirmation
// before it fades out. Must match the .np-block.done animation in main.css.
const BLOCK_FADE_MS = 1600

// `sbx policy log` reports the raw engine verdict, e.g. "no applicable policies
// for op=(action:net:connect:tcp, resource=net:domain:example.com:443)" — true
// but unreadable, and it's the same sentence on every row. Say what it means
// instead; the host is already the row's title.
function blockReason(b: Pick<PolicyBlock, 'rule' | 'reason'>): string {
  const raw = `${b.rule ?? ''} ${b.reason ?? ''}`.toLowerCase()
  if (!raw.trim()) return 'Blocked by network policy'
  if (raw.includes('no applicable') || raw.includes('default deny')) return 'No allow rule — default deny'
  // A named rule is worth showing verbatim: it tells the user which rule to edit.
  return b.rule ? `Denied by rule “${b.rule}”` : 'Blocked by network policy'
}

function agoLabel(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(at).toLocaleDateString()
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

// Header carries no close button — see the note on InfoPanel: the toolbar's
// right-dock toggle and the rail icon already close the dock.
export function NetworkPanel({ sandbox }: { sandbox: Sandbox }) {
  const { updateSandbox, ackPolicyBlocks, dismissPolicyBlocks, notePolicyChange, clearPolicyRestart } = useStore()
  // Select the stored array directly (a stable ref) and fall back to a shared
  // constant — `?? []` inside the selector returns a new array each render and
  // sends zustand into an infinite re-render loop.
  const blocks = useStore((s) => s.policyBlocks[sandbox.name]) ?? NO_BLOCKS

  // Looking at the panel counts as seeing the blocks → clears the badge.
  useEffect(() => { ackPolicyBlocks(sandbox.name) }, [sandbox.name, blocks.length])

  // Re-render on a slow tick so the "just now / 4m ago" labels don't go stale
  // while the panel sits open.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!blocks.length) return
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [blocks.length])

  const [policy, setPolicy] = useState<NetworkPolicy | null>(null)
  const [polLoading, setPolLoading] = useState(true)
  // Per-host state for the one-click allow on a recent block, so one row's
  // progress never disables (or claims the outcome of) its neighbours.
  const [blockState, setBlockState] = useState<Record<string, 'busy' | 'done' | 'err'>>({})
  // Keyed by host alone, so drop it when the panel switches sandboxes — two
  // sandboxes can be blocked on the same domain.
  useEffect(() => { setBlockState({}) }, [sandbox.name])
  const [allowMsg, setAllowMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // Rule edits are written immediately but only take effect on (re)start, so
  // every change lands in the store and the dock grows a persistent "restart to
  // apply" footer until the sandbox is cycled. Without it the user is left
  // guessing whether their click did anything. It lives in the store because a
  // toast can add a rule too, from anywhere in the app.
  const restartPending = useStore((s) => s.policyRestartPending[sandbox.name]) ?? NO_CHANGES
  const [restartDone, setRestartDone] = useState(false)
  const [restarting, setRestarting] = useState(false)

  const noteChange = (text: string) => {
    setRestartDone(false)
    notePolicyChange(sandbox.name, text)
  }
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
  // `support` is the org's governance support message (sbx v0.37+) — shown
  // verbatim on a denial so the user knows who to ask, instead of just "blocked".
  const [checkResult, setCheckResult] = useState<{ decision: 'allow' | 'deny' | 'unknown'; text: string; support?: string } | null>(null)

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
    else {
      setAllowMsg(null)
      pending.forEach((r) => noteChange(`${r.decision === 'allow' ? 'Allowed' : 'Blocked'} ${r.resources}`))
      loadPolicy()
    }
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
    setCheckResult({ decision: r.decision, text, support: r.supportMessage })
  }

  // One-click allow straight from a recent block. The row confirms in place,
  // fades out, and drops off the list — the block is handled, so leaving it
  // sitting there (indistinguishable from the ones that aren't) is a lie.
  const allowHost = async (host: string) => {
    // 'err' must fall through — that's the Retry click.
    if (blockState[host] === 'busy' || blockState[host] === 'done') return
    setBlockState((s) => ({ ...s, [host]: 'busy' }))
    setAllowMsg(null)
    const res = await window.minipit?.policyAllow(sandbox.name, host).catch(() => null)
    if (res?.ok) {
      setBlockState((s) => ({ ...s, [host]: 'done' }))
      noteChange(`Allowed ${host}`)
      loadPolicy()
      setTimeout(() => {
        dismissPolicyBlocks(sandbox.name, host)
        setBlockState((s) => { const n = { ...s }; delete n[host]; return n })
      }, BLOCK_FADE_MS)
    } else {
      setBlockState((s) => ({ ...s, [host]: 'err' }))
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
      noteChange(`Removed ${resource}`)
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
      noteChange(`Default preset → “${preset}” (custom rules reset)`)
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
      clearPolicyRestart(sandbox.name)
      setRestartDone(true)
      setTimeout(() => setRestartDone(false), 6000)
      // The new policy only takes effect on (re)start, so re-read it now to
      // refresh the rule list (and the active-preset highlight).
      loadPolicy()
    } catch {
      setAllowMsg({ ok: false, text: 'Restart failed — try Stop then Run manually.' })
    } finally {
      setRestarting(false)
    }
  }

  // One row per host: the same domain is usually denied over and over (every
  // retry logs a block), and six rows for two hosts reads as six problems.
  const grouped = (() => {
    const m = new Map<string, { host: string; at: number; hits: number; rule?: string; reason?: string }>()
    for (const b of blocks) {
      const g = m.get(b.host)
      if (g) { g.hits += 1; g.at = Math.max(g.at, b.at); g.rule ??= b.rule; g.reason ??= b.reason }
      else m.set(b.host, { host: b.host, at: b.at, hits: 1, rule: b.rule, reason: b.reason })
    }
    return [...m.values()].sort((a, b) => b.at - a.at)
  })()
  const shown = grouped.slice(0, 5)

  return (
    <div className="info-dock">
      <div className="info-dock-hd">
        <span className="info-dock-title">Network</span>
      </div>
      <div className="info-panel">
        <AccordionSection id="ports" title="Ports" badge={sandbox.ports.length || undefined} defaultOpen>
          <PortsPanel sandbox={sandbox} />
        </AccordionSection>

        <AccordionSection
          id="network"
          title="Network policy"
          badge={grouped.length || undefined}
          alert={grouped.length > 0}
          defaultOpen
        >
          {grouped.length > 0 && (
            <div className="np-blocks">
              <div className="np-blocks-hd">
                <ShieldAlert size={13} className="np-blocks-ic" />
                <span>Blocked requests</span>
                <span className="np-blocks-count">{grouped.length}</span>
              </div>
              {shown.map((b) => {
                const st = blockState[b.host]
                return (
                  <div className={`np-block${st ? ` ${st}` : ''}`} key={b.host}>
                    <div className="np-block-body">
                      <span className="np-block-host" title={b.host}>{b.host}</span>
                      <span className="np-block-meta">
                        {st === 'done'
                          ? 'Rule added — restart to apply'
                          : st === 'err'
                            ? 'Couldn’t add the rule — try again'
                            : <>{blockReason(b)} · {agoLabel(b.at)}{b.hits > 1 ? ` · ${b.hits}×` : ''}</>}
                      </span>
                    </div>
                    {st === 'done' ? (
                      <span className="np-block-ok"><Check size={13} /> Allowed</span>
                    ) : (
                      <button
                        className={`btn btn-sm ${st === 'err' ? 'btn-default' : 'btn-primary'} np-block-btn`}
                        onClick={() => allowHost(b.host)}
                        disabled={st === 'busy'}
                        title={`Add an allow rule for ${b.host}`}
                      >
                        {st === 'busy' ? 'Allowing…' : st === 'err' ? 'Retry' : 'Allow'}
                      </button>
                    )}
                  </div>
                )
              })}
              {grouped.length > shown.length && (
                <div className="np-blocks-more">+{grouped.length - shown.length} more host{grouped.length - shown.length > 1 ? 's' : ''} blocked</div>
              )}
            </div>
          )}

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
                  <span className="np-banner-txt">
                    {checkResult.text}
                    {/* The org's own words, so render them as given — den has no
                        idea whether it's a name, a URL or a ticket queue. */}
                    {checkResult.support && (
                      <span className="np-banner-support">{checkResult.support}</span>
                    )}
                  </span>
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
                </div>
              )}

            </div>
          )}
        </AccordionSection>
      </div>

      {/* Docked outside the scroll area: a policy edit is inert until the
          sandbox is cycled, so the one action that makes it real stays in view
          no matter how far down the panel you scrolled to make the change. */}
      {restartPending.length > 0 && (
        <div className="np-restart">
          <RotateCw size={14} className="np-restart-ic" />
          <div className="np-restart-main">
            <div className="np-restart-title">
              {sandbox.status === 'running' ? 'Restart to apply' : 'Start to apply'}
            </div>
            <div className="np-restart-sub" title={restartPending.join('\n')}>
              {restartPending.length === 1
                ? restartPending[0]
                : `${restartPending.length} policy changes pending`}
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleRestart} disabled={restarting}>
            {restarting
              ? (sandbox.status === 'running' ? 'Restarting…' : 'Starting…')
              : (sandbox.status === 'running' ? 'Restart' : 'Start')}
          </button>
        </div>
      )}
      {restartPending.length === 0 && restartDone && (
        <div className="np-restart ok">
          <Check size={14} className="np-restart-ic" />
          <div className="np-restart-main">
            <div className="np-restart-title">New policy active</div>
            <div className="np-restart-sub">Sandbox restarted with the updated rules.</div>
          </div>
        </div>
      )}
    </div>
  )
}
