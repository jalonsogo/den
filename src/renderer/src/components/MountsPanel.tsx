import { useEffect, useState } from 'react'
import { FolderInput } from 'lucide-react'
import type { MountEntry, Sandbox } from '../types'

// Live host-path mounts for a running sandbox (`sbx mount` / `sbx umount`).
// den only tracks the mounts it created (sbx has no `mount ls`).
export function MountsPanel({ sandbox }: { sandbox: Sandbox }) {
  const [mounts, setMounts] = useState<MountEntry[]>([])
  const [adding, setAdding] = useState(false)
  const [host, setHost] = useState('')
  const [target, setTarget] = useState('')
  const [ro, setRo] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const running = sandbox.status === 'running'

  useEffect(() => {
    window.minipit?.mountsGet(sandbox.name).then((m) => setMounts(m ?? [])).catch(() => {})
  }, [sandbox.name])

  const pick = async () => {
    const dir = await window.minipit?.showOpenDialog().catch(() => null)
    if (dir) setHost(dir)
  }

  const mount = async () => {
    if (!host || busy) return
    setBusy('mount'); setErr(null)
    const res = await window.minipit?.sbxMount(sandbox.name, host, target.trim(), ro).catch(() => null)
    setBusy(null)
    if (res?.ok) {
      setMounts(res.mounts ?? [])
      setHost(''); setTarget(''); setRo(false); setAdding(false)
    } else {
      setErr(res?.error || 'Failed to mount.')
    }
  }

  const unmount = async (m: MountEntry) => {
    const key = `${m.host}|${m.target ?? ''}`
    if (busy) return
    setBusy(key); setErr(null)
    const res = await window.minipit?.sbxUmount(sandbox.name, m.host, m.target ?? '').catch(() => null)
    setBusy(null)
    if (res?.ok) setMounts(res.mounts ?? [])
    else setErr(res?.error || 'Failed to unmount.')
  }

  return (
    <div className="mounts">
      {mounts.map((m, i) => {
        const key = `${m.host}|${m.target ?? ''}`
        return (
          <div className="mount-row" key={i}>
            <div className="mount-body">
              <span className="mount-host" title={m.host}>{m.host}</span>
              <span className="mount-target">{m.target ? `→ ${m.target}` : '→ /mnt/host/…'}{m.ro ? ' · ro' : ''}</span>
            </div>
            <button className="btn btn-ghost btn-sm" title="Unmount" disabled={busy === key} onClick={() => unmount(m)}>
              {busy === key ? '…' : '×'}
            </button>
          </div>
        )
      })}

      {adding ? (
        <div className="mount-add">
          <button className="btn btn-default btn-sm mount-pick" onClick={pick}>
            <FolderInput size={13} /> {host ? host.split('/').pop() || host : 'Choose host folder…'}
          </button>
          {host && <div className="mount-host-full" title={host}>{host}</div>}
          <input
            className="s-input" placeholder="Container path (optional, e.g. /workspace/data)"
            value={target} onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') mount() }}
          />
          <div className="mount-actions">
            <label className="mount-ro"><input type="checkbox" checked={ro} onChange={(e) => setRo(e.target.checked)} /> Read-only</label>
            <div className="mount-actions-btns">
              <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setErr(null); setHost(''); setTarget(''); setRo(false) }}>Cancel</button>
              <button className="btn btn-default btn-sm" onClick={mount} disabled={busy === 'mount' || !host}>
                {busy === 'mount' ? 'Mounting…' : 'Mount'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-default btn-sm mounts-add"
          onClick={() => setAdding(true)}
          disabled={!running}
          title={running ? undefined : 'Start the sandbox to mount a directory'}
        >
          + Mount directory
        </button>
      )}

      {err && <div className="mounts-hint" style={{ color: 'var(--destruct)' }}>{err}</div>}
      <div className="mounts-hint">
        Exposes a host folder into the running sandbox live (via <code>sbx mount</code>). Only mounts added here are listed.
      </div>
    </div>
  )
}
