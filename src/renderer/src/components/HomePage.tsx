import { useEffect, useState } from 'react'
import { Plus, ChevronRight, ShieldCheck, Download } from 'lucide-react'
import { useStore } from '../store'
import { AgentIcon } from './AgentIcon'
import { formatUptime } from '../lib/utils'
import type { NetworkPolicy } from '../types'

function baseSemver(v?: string | null): number[] | null {
  const m = v?.match(/(\d+)\.(\d+)\.(\d+)/)
  return m ? [+m[1], +m[2], +m[3]] : null
}
function isOlder(a: number[] | null, b: number[] | null): boolean {
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0)
  return false
}

export function HomePage() {
  const { sandboxes, setModal, setActiveSandboxId, setActivePage } = useStore()
  const running = sandboxes.filter((s) => s.status === 'running')
  const stopped = sandboxes.filter((s) => s.status !== 'running')

  const [version, setVersion] = useState<string | null>(null)
  const [latest, setLatest] = useState<string | null>(null)
  const [policy, setPolicy] = useState<NetworkPolicy | null>(null)

  useEffect(() => {
    window.minipit?.sbxVersion().then((r) => setVersion(r?.ok ? (r.version ?? null) : null)).catch(() => {})
    window.minipit?.sbxReleases().then((r) => setLatest(r?.[0]?.version ?? null)).catch(() => {})
    window.minipit?.networkPolicy().then((p) => setPolicy(p ?? null)).catch(() => {})
  }, [])

  const updateAvailable = isOlder(baseSemver(version), baseSemver(latest))
  const allowHosts = policy?.ok
    ? (policy.rules ?? []).filter((r) => r.decision.toLowerCase() === 'allow').reduce((n, r) => n + r.resources.length, 0)
    : null

  return (
    <div className="page">
      <div className="page-hdr">
        <span className="page-title">Home</span>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setModal('new-sandbox')}>
          <Plus size={13} />
          New Sandbox
        </button>
      </div>

      <div className="page-body home-dash">
        <div className="home-stats">
          <div className="home-stat">
            <div className="home-stat-n">{sandboxes.length}</div>
            <div className="home-stat-l">Sandboxes</div>
          </div>
          <div className="home-stat">
            <div className="home-stat-n" style={{ color: 'var(--green)' }}>{running.length}</div>
            <div className="home-stat-l">Running</div>
          </div>
          <div className="home-stat">
            <div className="home-stat-n" style={{ color: 'var(--t3)' }}>{stopped.length}</div>
            <div className="home-stat-l">Stopped</div>
          </div>
        </div>

        {/* Runtime + network policy status cards */}
        <div className="home-cards">
          <button className="home-card" onClick={() => setActivePage('settings')}>
            <div className="home-card-ic"><Download size={16} /></div>
            <div className="home-card-body">
              <div className="home-card-title">sbx runtime</div>
              <div className="home-card-sub">{version ?? 'Checking…'}</div>
            </div>
            {updateAvailable
              ? <span className="home-card-badge">Update</span>
              : <ChevronRight size={15} style={{ color: 'var(--t3)' }} />}
          </button>

          <button className="home-card" onClick={() => running[0] && setActiveSandboxId(running[0].id)}>
            <div className="home-card-ic"><ShieldCheck size={16} /></div>
            <div className="home-card-body">
              <div className="home-card-title">Network policy</div>
              <div className="home-card-sub">
                {policy?.ok
                  ? `${allowHosts ?? 0} allowed host${allowHosts === 1 ? '' : 's'}${policy.governance ? ' · governed' : ''}`
                  : 'Unavailable'}
              </div>
            </div>
            <ChevronRight size={15} style={{ color: 'var(--t3)' }} />
          </button>
        </div>

        <div className="ss-hdr" style={{ marginTop: 26 }}>Running now</div>
        {running.length === 0 ? (
          <div style={{ color: 'var(--t3)', fontSize: 13, padding: '14px 2px' }}>
            Nothing running. Create a sandbox to get started.
          </div>
        ) : (
          running.map((s) => (
            <div key={s.id} className="home-row" onClick={() => setActiveSandboxId(s.id)}>
              <AgentIcon agent={s.agent} size={15} />
              <span className="home-row-name">{s.name}</span>
              <span className="home-row-sub">{s.agent}</span>
              {s.uptimeSeconds ? <span className="home-row-up" style={{ marginLeft: 'auto' }}>{formatUptime(s.uptimeSeconds)}</span> : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
