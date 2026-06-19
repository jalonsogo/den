import { Plus, Box, Play } from 'lucide-react'
import { useStore } from '../store'

export function HomePage() {
  const { sandboxes, setModal, setActiveSandboxId } = useStore()
  const running = sandboxes.filter((s) => s.status === 'running')

  return (
    <div className="page">
      <div className="page-hdr">
        <span className="page-title">Home</span>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setModal('new-sandbox')}>
          <Plus size={13} />
          New Sandbox
        </button>
      </div>

      <div className="page-body" style={{ maxWidth: 640 }}>
        <div className="home-stats">
          <div className="home-stat">
            <div className="home-stat-n">{sandboxes.length}</div>
            <div className="home-stat-l">Sandboxes</div>
          </div>
          <div className="home-stat">
            <div className="home-stat-n" style={{ color: 'var(--green)' }}>{running.length}</div>
            <div className="home-stat-l">Running</div>
          </div>
        </div>

        <div className="ss-hdr" style={{ marginTop: 26 }}>Running now</div>
        {running.length === 0 ? (
          <div style={{ color: 'var(--t3)', fontSize: 13, padding: '14px 2px' }}>
            Nothing running. Create a sandbox to get started.
          </div>
        ) : (
          running.map((s) => (
            <div key={s.id} className="home-row" onClick={() => setActiveSandboxId(s.id)}>
              <Box size={15} style={{ color: 'var(--t3)' }} />
              <span className="home-row-name">{s.name}</span>
              <span className="home-row-sub">{s.agent}</span>
              <Play size={13} style={{ marginLeft: 'auto', color: 'var(--green)' }} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
