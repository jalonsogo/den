import { useState } from 'react'
import { useStore } from '../../store'

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function TemplateInspectModal() {
  const t = useStore((s) => s.inspectTemplate)
  const close = useStore((s) => s.setInspectTemplate)
  const [copied, setCopied] = useState(false)

  if (!t) return null
  const ref = `${t.repository}:${t.tag}`

  const copy = () => {
    navigator.clipboard?.writeText(ref).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  const rows: [string, string][] = [
    ['Repository', t.repository],
    ['Tag', t.tag],
    ['Flavor', t.flavor],
    ['Image ID', t.id],
    ['Created', fmtDate(t.createdAt)],
  ]

  return (
    <div className="overlay" onClick={() => close(null)}>
      <div className="modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="m-hdr">
          <div className="m-title">Template details</div>
          <div className="m-sub">{ref}</div>
        </div>

        <div className="m-body">
          <div className="tpl-detail">
            {rows.map(([k, v]) => (
              <div className="tpl-detail-row" key={k}>
                <div className="tpl-detail-k">{k}</div>
                <div className="tpl-detail-v" title={v}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="m-ftr">
          <button className="btn btn-ghost" onClick={copy}>{copied ? 'Copied' : 'Copy reference'}</button>
          <button className="btn btn-primary" onClick={() => close(null)}>Done</button>
        </div>
      </div>
    </div>
  )
}
