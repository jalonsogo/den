import { useEffect, useState } from 'react'
import { X, Layers, AlertTriangle, ShieldAlert, ChevronRight, ChevronDown } from 'lucide-react'
import { useStore } from '../store'
import { formatUptime } from '../lib/utils'
import { PortsPanel } from './PortsPanel'
import { AGENTS, type Sandbox, type NetworkPolicy, type PolicyBlock } from '../types'

const NO_BLOCKS: PolicyBlock[] = []

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

  useEffect(() => {
    window.minipit?.appliedKits(sandbox.name).then((k) => setKits(k ?? [])).catch(() => setKits([]))
  }, [sandbox.name])
  const [allowInput, setAllowInput] = useState('')
  const [allowBusy, setAllowBusy] = useState(false)
  const [allowMsg, setAllowMsg] = useState<{ ok: boolean; text: string; offerRestart?: boolean } | null>(null)
  const [restarting, setRestarting] = useState(false)

  const loadPolicy = () => {
    setPolLoading(true)
    window.minipit?.networkPolicy(sandbox.name)
      .then((p) => setPolicy(p ?? null))
      .catch(() => setPolicy(null))
      .finally(() => setPolLoading(false))
  }
  useEffect(loadPolicy, [sandbox.name])

  const handleAllow = async () => {
    const resources = allowInput.trim()
    if (!resources || allowBusy) return
    setAllowBusy(true)
    setAllowMsg(null)
    const res = await window.minipit?.policyAllow(sandbox.name, resources).catch(() => null)
    setAllowBusy(false)
    if (res?.ok) {
      setAllowInput('')
      setAllowMsg({ ok: true, text: 'Rule added.', offerRestart: true })
      loadPolicy()
    } else {
      setAllowMsg({ ok: false, text: res?.error || 'Failed to add rule.' })
    }
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

  // Restart (or start) the sandbox so a freshly-added policy takes effect.
  const handleRestart = async () => {
    setRestarting(true)
    try {
      if (sandbox.status === 'running') await window.minipit?.stopSandbox(sandbox.name)
      await window.minipit?.runSandbox(sandbox.name)
      updateSandbox(sandbox.id, { status: 'running' })
      setAllowMsg({ ok: true, text: 'Sandbox restarted — new policy applied.' })
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
          <span className="is-v">{AGENTS.find((a) => a.id === sandbox.agent)?.label ?? sandbox.agent}</span>
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

      <AccordionSection id="workspaces" title="Workspaces" defaultOpen>
        <div className="info-row">
          <span className="ir-label">Primary (read-write)</span>
          <span
            className="ir-val"
            title="Double-click to reveal in Finder"
            onDoubleClick={() => window.minipit?.openInFinder(sandbox.workspace)}
          >{sandbox.workspace}</span>
        </div>
        {sandbox.additionalWorkspaces?.map((ws, i) => (
          <div className="info-row" key={i}>
            <span className="ir-label">{ws.readonly ? 'Read-only' : 'Read-write'}</span>
            <span className="ir-val">{ws.path}</span>
          </div>
        ))}
      </AccordionSection>

      <AccordionSection id="ports" title="Ports" badge={sandbox.ports.length || undefined} defaultOpen>
        <PortsPanel sandbox={sandbox} />
      </AccordionSection>

      {kits.length > 0 && (
        <AccordionSection id="kits" title="Kits" badge={kits.length}>
          <div className="info-kits">
            {kits.map((k) => <span className="info-kit" key={k}><Layers size={12} />{k}</span>)}
          </div>
        </AccordionSection>
      )}

      <AccordionSection
        id="network"
        title="Network policy"
        badge={blocks.length || undefined}
        alert={blocks.length > 0}
        defaultOpen={blocks.length > 0}
      >
        <div style={{ display: 'flex', marginBottom: 8 }}>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={loadPolicy} disabled={polLoading}>
            {polLoading ? 'Checking…' : 'Refresh'}
          </button>
        </div>

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
                      {r.resources.map((res, j) => <span className="np-chip" key={j}>{res}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="np-empty">No explicit network rules — traffic follows the default policy.</div>
            )}
            <div className="np-note">
              Agents can only reach the allowed resources above; anything else is blocked by the default deny policy.
            </div>
          </>
        )}

        {blocks.length > 0 && (
          <div className="np-blocks">
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

        {!polLoading && (
          <div className="np-add-box">
            <label className="np-add-lbl">Add allow rule</label>
            <div className="np-add">
              <input
                className="np-add-input"
                value={allowInput}
                placeholder="chatgpt.com,  *.example.com:443"
                onChange={(e) => setAllowInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAllow() }}
              />
              <button className="btn btn-primary btn-sm" onClick={handleAllow} disabled={allowBusy || !allowInput.trim()}>
                {allowBusy ? 'Adding…' : 'Allow'}
              </button>
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
