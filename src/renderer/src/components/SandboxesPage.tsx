import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useStore, unackedBlockCount } from '../store'
import { SandboxAvatar } from './SandboxAvatar'
import { formatUptime } from '../lib/utils'
import { useSbxCaps } from '../lib/useSbx'

const projectName = (ws: string): string => ws.split('/').pop() || ws

// Flat list of every sandbox (running first), mirroring the Projects view.
// Reached from the Sandboxes stat on Home and the sidebar "Sandboxes" title.
export function SandboxesPage() {
  const { sandboxes, setActiveSandboxId, setModal } = useStore()
  const policyBlocks = useStore((s) => s.policyBlocks)
  const blocksSeenAt = useStore((s) => s.blocksSeenAt)
  const agentActivity = useStore((s) => s.agentActivity)
  const caps = useSbxCaps()
  const [pruning, setPruning] = useState(false)
  const [pruneMsg, setPruneMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const stopped = sandboxes.filter((s) => s.status !== 'running' && s.status !== 'creating')

  // `sbx prune` (v0.39) removes every stopped sandbox at once. It never touches
  // a running one, so this can't pull the floor out from under an agent — but it
  // is irreversible and can be many at a time, so it says how many first.
  const prune = async () => {
    const n = stopped.length
    const ok = window.confirm(
      `Remove ${n} stopped sandbox${n === 1 ? '' : 'es'}?\n\n` +
      `${stopped.map((x) => `  · ${x.name}`).join('\n')}\n\n` +
      `Running sandboxes are never touched. This can't be undone.`
    )
    if (!ok) return
    setPruning(true); setPruneMsg(null)
    const r = await window.minipit?.pruneSandboxes()
      .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }))
    setPruning(false)
    if (!r?.ok) { setPruneMsg({ ok: false, text: r?.error || 'Could not prune.' }); return }
    // The count comes from what actually disappeared, not from den's idea of
    // "stopped" — that includes states (errored, mid-stop) sbx may decline to
    // prune, and claiming five when three went is worse than saying nothing.
    const gone = r.removed?.length ?? 0
    setPruneMsg(gone === n
      ? { ok: true, text: `Removed ${gone} stopped sandbox${gone === 1 ? '' : 'es'}.` }
      : { ok: true, text: `Removed ${gone} of ${n}. sbx kept the rest — they may be mid-stop or errored.` })
  }

  const sorted = [...sandboxes].sort((a, b) => {
    const ra = a.status === 'running' ? 0 : 1
    const rb = b.status === 'running' ? 0 : 1
    return ra !== rb ? ra - rb : a.name.localeCompare(b.name)
  })

  return (
    <div className="page">
      <div className="page-hdr">
        <span className="page-title">Sandboxes</span>
        {caps.hasEnvFiles && stopped.length > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 'auto' }}
            disabled={pruning}
            onClick={() => void prune()}
            title={`sbx prune — remove ${stopped.length} stopped sandbox${stopped.length === 1 ? '' : 'es'}`}
          >
            <Trash2 size={13} /> {pruning ? 'Pruning…' : `Prune ${stopped.length} stopped`}
          </button>
        )}
        <button
          className="btn btn-primary btn-sm"
          style={caps.hasEnvFiles && stopped.length > 0 ? undefined : { marginLeft: 'auto' }}
          onClick={() => setModal('new-sandbox')}
        >
          <Plus size={13} /> New Sandbox
        </button>
      </div>

      <div className="page-body home-dash">
        {pruneMsg && (
          <div className={`np-banner ${pruneMsg.ok ? 'ok' : 'err'}`} style={{ marginBottom: 12 }}>
            <span className="np-banner-txt" style={{ whiteSpace: 'pre-wrap' }}>{pruneMsg.text}</span>
          </div>
        )}
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
