import { useStore } from '../store'
import { formatUptime } from '../lib/utils'
import { PortsPanel } from './PortsPanel'
import { AGENTS, type Sandbox } from '../types'

export function InfoPanel({ sandbox }: { sandbox: Sandbox }) {
  const { setDeleting, setSandboxes } = useStore()
  const isDeleting = sandbox.status === 'deleting'

  const handleDelete = async () => {
    if (isDeleting) return
    if (!confirm(`Delete sandbox "${sandbox.name}"? This cannot be undone.`)) return
    setDeleting(sandbox.id, true)
    try {
      await window.minipit?.deleteSandbox(sandbox.name)
      // Refresh immediately so the row disappears without waiting for the poll.
      const list = await window.minipit?.listSandboxes()
      if (list) setSandboxes(list)
    } catch (e) {
      console.error(e)
      setDeleting(sandbox.id, false)
    }
  }

  return (
    <div className="info-panel">
      <div className="info-grid">
        <div className="info-card">
          <div className="ic-label">Status</div>
          <div className="ic-val" style={{ textTransform: 'capitalize' }}>{sandbox.status}</div>
          <div className="ic-sub">
            {sandbox.status === 'running' && sandbox.uptimeSeconds
              ? formatUptime(sandbox.uptimeSeconds)
              : '—'}
          </div>
        </div>
        <div className="info-card">
          <div className="ic-label">Agent</div>
          <div className="ic-val">{sandbox.agent}</div>
          <div className="ic-sub">
            {AGENTS.find((a) => a.id === sandbox.agent)?.label ?? sandbox.agent}
          </div>
        </div>
        <div className="info-card">
          <div className="ic-label">Memory</div>
          <div className="ic-val">{sandbox.memory ?? '—'}</div>
          <div className="ic-sub">max 32g</div>
        </div>
        <div className="info-card">
          <div className="ic-label">Branch</div>
          <div className="ic-val" style={{ fontSize: 14, marginTop: 4 }}>
            {sandbox.branch ?? '—'}
          </div>
          <div className="ic-sub">{sandbox.branch ? 'worktree in .sbx/' : 'no isolation'}</div>
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

      <div className="info-actions">
        <button className="btn btn-default btn-sm">Save snapshot</button>
        <button className="btn btn-ghost btn-sm">Reset</button>
        <button className="btn btn-destructive btn-sm" style={{ marginLeft: 'auto' }} onClick={handleDelete} disabled={isDeleting}>
          {isDeleting ? 'Deleting…' : 'Delete sandbox'}
        </button>
      </div>
    </div>
  )
}
