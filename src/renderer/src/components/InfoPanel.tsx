import { useEffect, useState } from 'react'
import { X, Layers, AlertTriangle } from 'lucide-react'
import { useStore } from '../store'
import { formatUptime } from '../lib/utils'
import { PortsPanel } from './PortsPanel'
import { AGENTS, type Sandbox, type NetworkPolicy } from '../types'

export function InfoPanel({ sandbox, onClose }: { sandbox: Sandbox; onClose?: () => void }) {
  const { updateSandbox } = useStore()

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

      <div className="info-block">
        <div className="info-block-title">Workspaces</div>
        <div className="info-row">
          <span className="ir-label">Primary (read-write)</span>
          <span className="ir-val">{sandbox.workspace}</span>
        </div>
        {sandbox.additionalWorkspaces?.map((ws, i) => (
          <div className="info-row" key={i}>
            <span className="ir-label">{ws.readonly ? 'Read-only' : 'Read-write'}</span>
            <span className="ir-val">{ws.path}</span>
          </div>
        ))}
      </div>

      <div className="info-block">
        <div className="info-block-title">Ports</div>
        <PortsPanel sandbox={sandbox} />
      </div>

      {kits.length > 0 && (
        <div className="info-block">
          <div className="info-block-title">Kits</div>
          <div className="info-kits">
            {kits.map((k) => <span className="info-kit" key={k}><Layers size={12} />{k}</span>)}
          </div>
        </div>
      )}

      <div className="info-block">
        <div className="info-block-title" style={{ display: 'flex', alignItems: 'center' }}>
          Network policy
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
      </div>
      </div>
    </div>
  )
}
