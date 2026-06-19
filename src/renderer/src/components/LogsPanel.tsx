import { useEffect, useRef, useState } from 'react'

const CAP = 200_000 // keep the last ~200 KB of log text

export function LogsPanel() {
  const [logs, setLogs] = useState<{ name: string; path: string }[]>([])
  const [path, setPath] = useState('')
  const [text, setText] = useState('')
  const [follow, setFollow] = useState(true)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Discover available log files.
  useEffect(() => {
    window.minipit?.listLogs().then((l) => {
      setLogs(l ?? [])
      if (l && l.length) {
        const preferred = l.find((x) => x.name === 'daemon.log') ?? l[0]
        setPath((p) => p || preferred.path)
      }
    }).catch(() => {})
  }, [])

  // Tail the selected log.
  useEffect(() => {
    if (!path) return
    setText('')
    const unsub = window.minipit?.onLogTail((chunk) => {
      setText((t) => {
        const next = t + chunk
        return next.length > CAP ? next.slice(-CAP) : next
      })
    })
    window.minipit?.startLogTail(path)
    return () => {
      unsub?.()
      window.minipit?.stopLogTail()
    }
  }, [path])

  // Auto-scroll to bottom while following.
  useEffect(() => {
    if (follow && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [text, follow])

  return (
    <div className="logs">
      <div className="logs-bar">
        <select className="finput" style={{ width: 220, cursor: 'pointer' }} value={path} onChange={(e) => setPath(e.target.value)}>
          {logs.length === 0 && <option value="">No logs found</option>}
          {logs.map((l) => <option key={l.path} value={l.path}>{l.name}</option>)}
        </select>
        <label className="logs-follow">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          Follow
        </label>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={() => setText('')}>Clear</button>
        <button className="btn btn-ghost btn-sm" onClick={() => path && window.minipit?.openInFinder(path)}>Reveal</button>
      </div>
      <div className="logs-body" ref={bodyRef} onWheel={() => setFollow(false)}>
        {text ? <pre className="logs-pre">{text}</pre> : <div className="files-empty">Waiting for log output…</div>}
      </div>
    </div>
  )
}
