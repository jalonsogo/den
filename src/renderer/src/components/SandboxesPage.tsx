import { Plus } from 'lucide-react'
import { useStore, unackedBlockCount } from '../store'
import { SandboxAvatar } from './SandboxAvatar'
import { formatUptime } from '../lib/utils'

const projectName = (ws: string): string => ws.split('/').pop() || ws

// Flat list of every sandbox (running first), mirroring the Projects view.
// Reached from the Sandboxes stat on Home and the sidebar "Sandboxes" title.
export function SandboxesPage() {
  const { sandboxes, setActiveSandboxId, setModal } = useStore()
  const policyBlocks = useStore((s) => s.policyBlocks)
  const blocksSeenAt = useStore((s) => s.blocksSeenAt)
  const agentActivity = useStore((s) => s.agentActivity)

  const sorted = [...sandboxes].sort((a, b) => {
    const ra = a.status === 'running' ? 0 : 1
    const rb = b.status === 'running' ? 0 : 1
    return ra !== rb ? ra - rb : a.name.localeCompare(b.name)
  })

  return (
    <div className="page">
      <div className="page-hdr">
        <span className="page-title">Sandboxes</span>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setModal('new-sandbox')}>
          <Plus size={13} /> New Sandbox
        </button>
      </div>

      <div className="page-body home-dash">
        {sandboxes.length === 0 ? (
          <div className="proj-empty">
            <p>No sandboxes yet. Create one to run an agent in its own isolated space.</p>
            <button className="btn btn-primary btn-sm" onClick={() => setModal('new-sandbox')}>
              <Plus size={13} /> New Sandbox
            </button>
          </div>
        ) : (
          sorted.map((s) => {
            const creating = s.status === 'creating'
            return (
              <div
                key={s.id}
                className="home-row"
                style={creating ? { cursor: 'default', opacity: 0.85 } : undefined}
                onClick={() => { if (!creating) setActiveSandboxId(s.id) }}
              >
                <SandboxAvatar
                  sandbox={s}
                  size={28}
                  alert={unackedBlockCount(policyBlocks, blocksSeenAt, s.name) > 0}
                  activity={s.status === 'running' ? (agentActivity[s.name] ?? null) : null}
                />
                <span className="home-row-name">{s.name}</span>
                <span className="home-row-sub">{s.agent} · {projectName(s.workspace)}</span>
                <span className="sbx-row-right">
                  {creating ? (
                    <span className="home-row-up">Creating…</span>
                  ) : s.uptimeSeconds ? (
                    <span className="home-row-up">{formatUptime(s.uptimeSeconds)}</span>
                  ) : null}
                  <span className={`proj-dot ${s.status === 'running' ? 'running' : creating ? 'creating' : 'stopped'}`} />
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
