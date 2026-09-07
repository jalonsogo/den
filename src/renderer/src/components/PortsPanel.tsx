import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { Port, Sandbox } from '../types'

// Build the sbx port spec used for --unpublish and, when the user fills the
// add form, --publish. Cloud has no host mapping — just the bare sandbox port
// (see `ports --help`'s cloud-mode note: "only the sandbox port number is
// accepted... assigns a publicly reachable URL").
const specFor = (p: Port) => {
  if (p.location === 'cloud') return String(p.container)
  // Include the host IP only when it's not loopback: sbx defaults an omitted IP
  // to loopback, so a 0.0.0.0 (network-exposed) binding must be named explicitly
  // or unpublish silently misses it.
  const ip = p.hostIp && p.hostIp !== '127.0.0.1' && p.hostIp !== '::1' ? `${p.hostIp}:` : ''
  return `${ip}${p.host}:${p.container}/${p.protocol.toLowerCase()}`
}

export function PortsPanel({ sandbox }: { sandbox: Sandbox }) {
  const isCloud = sandbox.location === 'cloud'
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
    window.den?.getPorts(sandbox.name).then((p) => setPorts(p ?? [])).catch(() => {})

  // `sbx ports --json` is the authoritative source (the polled sandbox.ports
  // from `sbx ls` can lag or omit mappings). Refresh on open and when the
  // sandbox starts/stops.
  useEffect(() => {
    refresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandbox.name, sandbox.status])

  const publish = async () => {
    // Cloud: a bare sandbox port typed into the "sandbox" field is enough —
    // there's no host side to fill in.
    const s = isCloud ? sbxPort.trim() : (sbxPort.trim() || hostPort.trim())
    const h = isCloud ? s : hostPort.trim()
    if (!h || busy) return
    setBusy('publish')
    setErr(null)
    let spec: string
    if (isCloud) {
      spec = s
    } else {
      // Publish IPv4-only (tcp4/udp4) explicitly, rather than relying on sbx's
      // default. Below v0.42, a plain `tcp` spec made sbx bind both 127.0.0.1 and
      // [::1] — but sandbox services typically listen on IPv4 0.0.0.0 only,
      // leaving a dead ::1 forwarder, and since macOS resolves `localhost` to ::1
      // first, that dead binding broke `http://localhost:PORT`. sbx 0.42+ made
      // tcp4 the default anyway, so this is now redundant with a current runtime
      // — kept explicit so den still gets IPv4-only behaviour on an older one.
      //
      // Default to loopback (127.0.0.1); when "Expose to network" is checked bind
      // 0.0.0.0 so the port is also reachable from other machines on the LAN. The
      // 0.0.0.0 bind still covers 127.0.0.1 and localhost.
      const hostIp = expose ? '0.0.0.0:' : '127.0.0.1:'
      spec = `${hostIp}${h}:${s}/${proto}4`
    }
    const res = await window.den?.portPublish(sandbox.name, spec).catch(() => null)
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
    const res = await window.den?.portUnpublish(sandbox.name, spec).catch(() => null)
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
            {port.location === 'cloud'
              ? <span className="port-map">{port.container}</span>
              : <span className="port-map">{port.host} → {port.container}</span>}
            {port.location !== 'cloud' && <span className="port-proto">{port.protocol.replace(/[46]$/, '')}</span>}
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              disabled={port.location === 'cloud' && !port.url}
              title={port.location === 'cloud' && !port.url ? 'No public URL reported for this port' : undefined}
              onClick={() => window.den?.openPath(
                port.location === 'cloud'
                  ? (port.url as string)
                  // Use the IPv4 literal, not `localhost`: below sbx v0.42, a
                  // publish also opened a [::1] binding, and macOS resolves
                  // `localhost` to ::1 first — sandbox services that listen only
                  // on IPv4 0.0.0.0 (the common case) returned an empty reply over
                  // IPv6. sbx 0.42+ defaults to tcp4-only, making this moot on a
                  // current runtime, but the literal is kept for older ones.
                  : `http://127.0.0.1:${port.host}`
              )}
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
        <div className="ports-add-form">
          {isCloud ? (
            <div className="ports-add-row">
              <input
                className="s-input pf-port" placeholder="sandbox port"
                value={sbxPort} onChange={(e) => setSbxPort(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') publish() }}
                autoFocus
              />
            </div>
          ) : (
            <div className="ports-add-row">
              <input
                className="s-input pf-port" placeholder="host"
                value={hostPort} onChange={(e) => setHostPort(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') publish() }}
              />
              <span className="pf-arrow">→</span>
              <input
                className="s-input pf-port" placeholder="sandbox"
                value={sbxPort} onChange={(e) => setSbxPort(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') publish() }}
              />
              <select className="s-input pf-proto" value={proto} onChange={(e) => setProto(e.target.value as 'tcp' | 'udp')}>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
            </div>
          )}
          <div className="pf-actions">
            {isCloud ? (
              <span className="pf-expose" style={{ color: 'var(--t3)', fontSize: 11.5 }}>
                The control plane assigns a public URL — no host port to pick.
              </span>
            ) : (
              <label
                className="pf-expose"
                title="Bind 0.0.0.0 so the port is reachable from other machines on your network. Off = loopback only (localhost / 127.0.0.1)."
              >
                <input type="checkbox" checked={expose} onChange={(e) => setExpose(e.target.checked)} style={{ cursor: 'pointer' }} />
                Expose to network
              </label>
            )}
            <div className="pf-btns">
              <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setErr(null); setExpose(false) }}>Cancel</button>
              <button
                className="btn btn-default btn-sm"
                onClick={publish}
                disabled={busy === 'publish' || (isCloud ? !sbxPort.trim() : !hostPort.trim())}
              >
                {busy === 'publish' ? 'Opening…' : 'Open'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button className="btn btn-default btn-sm ports-add" onClick={() => setAdding(true)} disabled={!running} title={running ? undefined : 'Start the sandbox to open a port'}>
          + Open port
        </button>
      )}

      {err && <div className="ports-hint" style={{ color: 'var(--destruct)' }}>{err}</div>}
      <div className="ports-hint">
        {running
          ? (isCloud
            ? 'Ports close when the sandbox stops.'
            : 'Ports close when the sandbox stops. Sandbox services must listen on 0.0.0.0.')
          : 'Start the sandbox to open a port.'}
      </div>
    </div>
  )
}
