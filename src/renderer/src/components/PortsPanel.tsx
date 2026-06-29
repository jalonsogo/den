import type { Sandbox } from '../types'

export function PortsPanel({ sandbox }: { sandbox: Sandbox }) {
  if (sandbox.ports.length === 0) {
    return (
      <div className="ports-empty">
        <span>No port forwards</span>
        <button className="btn btn-ghost btn-sm">+ Add</button>
      </div>
    )
  }

  return (
    <div className="ports-list">
      {sandbox.ports.map((port, i) => (
        <div className="port-row" key={i}>
          <span className={`p-dot${port.active ? ' on' : ''}`} />
          <span className="port-map">{port.host} → {port.container}</span>
          <span className="port-proto">{port.protocol}</span>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>Open ↗</button>
        </div>
      ))}
      <button className="ports-add">+ Add forward</button>
      <div className="ports-hint">Forwards are removed when the sandbox stops.</div>
    </div>
  )
}
