import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { Port, Sandbox } from '../types'

// Build the sbx port spec (host:sandbox/proto) used for --unpublish and, when
// the user fills the add form, --publish.
const specFor = (p: Port) => {
  // Include the host IP only when it's not loopback: sbx defaults an omitted IP
  // to loopback, so a 0.0.0.0 (network-exposed) binding must be named explicitly
  // or unpublish silently misses it.
  const ip = p.hostIp && p.hostIp !== '127.0.0.1' && p.hostIp !== '::1' ? `${p.hostIp}:` : ''
  return `${ip}${p.host}:${p.container}/${p.protocol.toLowerCase()}`
}

export function PortsPanel({ sandbox }: { sandbox: Sandbox }) {
  const [ports, setPorts] = useState<Port[]>(sandbox.ports)
  const [adding, setAdding] = useState(false)
  const [hostPort, setHostPort] = useState('')
  const [sbxPort, setSbxPort] = useState('')
  const [proto, setProto] = useState<'tcp' | 'udp'>('tcp')
  const [expose, setExpose] = useState(false)
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
    // Publish IPv4-only (tcp4/udp4). A plain `tcp` spec makes sbx bind both
    // 127.0.0.1 and [::1], but sandbox services typically listen on IPv4
    // 0.0.0.0 only — leaving a dead ::1 forwarder. Since macOS resolves
    // `localhost` to ::1 first, that dead binding breaks `http://localhost:PORT`.
    // Binding IPv4-only means the ::1 attempt is refused and the client falls
    // back to 127.0.0.1, so `localhost` works.
    //
    // Default to loopback (127.0.0.1); when "Expose to network" is checked bind
    // 0.0.0.0 so the port is also reachable from other machines on the LAN. The
    // 0.0.0.0 bind still covers 127.0.0.1 and localhost.
    const hostIp = expose ? '0.0.0.0:' : '127.0.0.1:'
    const spec = `${hostIp}${h}:${s}/${proto}4`
    const res = await window.minipit?.portPublish(sandbox.name, spec).catch(() => null)
    setBusy(null)
    if (res?.ok) {
      setHostPort(''); setSbxPort(''); setExpose(false); setAdding(false)
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
            <span className="port-proto">{port.protocol.replace(/[46]$/, '')}</span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              // Use the IPv4 literal, not `localhost`: sbx publishes both a
              // 127.0.0.1 and a [::1] binding, but macOS resolves `localhost`
              // to ::1 first — and sandbox services that listen only on IPv4
              // 0.0.0.0 (the common case) return an empty reply over IPv6.
              onClick={() => window.minipit?.openPath(`http://127.0.0.1:${port.host}`)}
            >
              Open <ExternalLink size={13} />
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
          <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setErr(null); setExpose(false) }}>Cancel</button>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, opacity: 0.8, flexBasis: '100%' }}
            title="Bind 0.0.0.0 so the port is reachable from other machines on your network. Off = loopback only (localhost / 127.0.0.1)."
          >
            <input type="checkbox" checked={expose} onChange={(e) => setExpose(e.target.checked)} style={{ cursor: 'pointer' }} />
            Expose to network
          </label>
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
