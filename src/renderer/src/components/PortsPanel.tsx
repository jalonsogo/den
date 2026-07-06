import { useEffect, useState } from 'react'
import type { Port, Sandbox } from '../types'

// Build the sbx port spec (host:sandbox/proto) used for --unpublish and, when
// the user fills the add form, --publish.
const specFor = (p: Port) => `${p.host}:${p.container}/${p.protocol.toLowerCase()}`

export function PortsPanel({ sandbox }: { sandbox: Sandbox }) {
  const [ports, setPorts] = useState<Port[]>(sandbox.ports)
  const [adding, setAdding] = useState(false)
  const [hostPort, setHostPort] = useState('')
  const [sbxPort, setSbxPort] = useState('')
  const [proto, setProto] = useState<'tcp' | 'udp'>('tcp')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const running = sandbox.status === 'running'

  const refresh = () =>
    window.minipit?.getPorts(sandbox.name).then((p) => setPorts(p ?? [])).catch(() => {})

  // `sbx ports --json` is the authoritative source (the polled sandbox.ports
  // from `sbx ls` can lag or omit mappings). Refresh on open and when the
  // sandbox starts/stops.
  useEffect(() => {
    refresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandbox.name, sandbox.status])

  const publish = async () => {
    const h = hostPort.trim()
    const s = sbxPort.trim() || h
    if (!h || busy) return
    setBusy('publish')
    setErr(null)
    const spec = `${h}:${s}/${proto}`
    const res = await window.minipit?.portPublish(sandbox.name, spec).catch(() => null)
    setBusy(null)
    if (res?.ok) {
      setHostPort(''); setSbxPort(''); setAdding(false)
      refresh()
    } else {
      setErr(res?.error || 'Failed to publish port.')
    }
  }

  const unpublish = async (p: Port) => {
    const spec = specFor(p)
    if (busy) return
    setBusy(spec)
    setErr(null)
    const res = await window.minipit?.portUnpublish(sandbox.name, spec).catch(() => null)
    setBusy(null)
    if (res?.ok) refresh()
    else setErr(res?.error || 'Failed to unpublish port.')
  }

  return (
    <div className="ports-list">
      {ports.map((port, i) => {
        const spec = specFor(port)
        return (
          <div className="port-row" key={i}>
            <span className={`p-dot${port.active ? ' on' : ''}`} />
            <span className="port-map">{port.host} → {port.container}</span>
            <span className="port-proto">{port.protocol}</span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => window.minipit?.openPath(`http://localhost:${port.host}`)}
            >
              Open ↗
            </button>
            <button
              className="btn btn-ghost btn-sm"
              title="Unpublish"
              disabled={busy === spec}
              onClick={() => unpublish(port)}
            >
              {busy === spec ? '…' : '×'}
            </button>
          </div>
        )
      })}

      {ports.length === 0 && !adding && (
        <div className="ports-empty"><span>No open ports</span></div>
      )}

      {adding ? (
        <div className="ports-add-form" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '6px 0' }}>
          <input
            className="s-input" style={{ width: 78 }} placeholder="host"
            value={hostPort} onChange={(e) => setHostPort(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') publish() }}
          />
          <span style={{ opacity: 0.5 }}>→</span>
          <input
            className="s-input" style={{ width: 78 }} placeholder="sandbox"
            value={sbxPort} onChange={(e) => setSbxPort(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') publish() }}
          />
          <select className="s-input" style={{ width: 68, cursor: 'pointer' }} value={proto} onChange={(e) => setProto(e.target.value as 'tcp' | 'udp')}>
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={publish} disabled={busy === 'publish' || !hostPort.trim()}>
            {busy === 'publish' ? 'Opening…' : 'Open'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setErr(null) }}>Cancel</button>
        </div>
      ) : (
        <button className="ports-add" onClick={() => setAdding(true)} disabled={!running} title={running ? undefined : 'Start the sandbox to open a port'}>
          + Open port
        </button>
      )}

      {err && <div className="ports-hint" style={{ color: 'var(--destruct)' }}>{err}</div>}
      <div className="ports-hint">
        {running
          ? 'Ports close when the sandbox stops. Sandbox services must listen on 0.0.0.0.'
          : 'Start the sandbox to open a port.'}
      </div>
    </div>
  )
}
