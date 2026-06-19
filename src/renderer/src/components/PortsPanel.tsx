import { Info } from 'lucide-react'
import type { Sandbox } from '../types'

export function PortsPanel({ sandbox }: { sandbox: Sandbox }) {
  return (
    <div className="ports-panel">
      <div className="ports-notice">
        <Info size={13} style={{ flexShrink: 0 }} />
        Port forwards are removed when the sandbox stops.
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>
          + Add forward
        </button>
      </div>

      {sandbox.ports.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--t3)', fontSize: 13, padding: '32px 0' }}>
          No port forwards configured
        </div>
      ) : (
        <div className="ports-tbl">
          <div className="ptbl-hdr">
            <div className="pth">Host</div>
            <div className="pth">Container</div>
            <div className="pth">Protocol</div>
            <div className="pth">Status</div>
            <div className="pth" />
          </div>
          {sandbox.ports.map((port, i) => (
            <div className="ptbl-row" key={i}>
              <div className="pval">{port.host}</div>
              <div className="pval2">{port.container}</div>
              <div className="pproto">{port.protocol}</div>
              <div className={`p-status${port.active ? '' : ''}`}>
                {port.active && <div className="p-status-dot" />}
                {port.active ? 'Active' : 'Inactive'}
              </div>
              <div>
                <button className="btn btn-ghost btn-sm">Open ↗</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
