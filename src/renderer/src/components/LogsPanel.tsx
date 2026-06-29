import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useStore } from '../store'
import { termTheme as resolveTermTheme } from '../lib/termThemes'

const CAP = 200_000 // keep the last ~200 KB of log text

export function LogsPanel() {
  const [logs, setLogs] = useState<{ name: string; path: string }[]>([])
  const [path, setPath] = useState('')
  const [text, setText] = useState('')
  const [follow, setFollow] = useState(true)
  const [query, setQuery] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)

  // Match the Logs viewer to the terminal theme picked in settings.
  const termThemeId = useStore((s) => s.termTheme)
  const theme = resolveTermTheme(termThemeId).theme
  const bg = theme.background ?? '#0a0a0a'
  const fg = theme.foreground ?? '#d4d4d4'

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

  // Filter lines by the search query (case-insensitive substring).
  const q = query.trim().toLowerCase()
  const shown = q
    ? text.split('\n').filter((l) => l.toLowerCase().includes(q)).join('\n')
    : text
  const matchCount = q ? (shown ? shown.split('\n').length : 0) : 0

  // Auto-scroll to bottom while following (disabled when filtering).
  useEffect(() => {
    if (follow && !q && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [shown, follow, q])

  return (
    <div className="logs">
      <div className="logs-bar">
        <select className="finput" style={{ width: 200, cursor: 'pointer' }} value={path} onChange={(e) => setPath(e.target.value)}>
          {logs.length === 0 && <option value="">No logs found</option>}
          {logs.map((l) => <option key={l.path} value={l.path}>{l.name}</option>)}
        </select>
        <div className="logs-search">
          <Search size={13} className="logs-search-ic" />
          <input
            value={query}
            placeholder="Search logs…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
          />
          {q && <span className="logs-search-count">{matchCount}</span>}
          {query && <button className="logs-search-x" onClick={() => setQuery('')} title="Clear"><X size={13} /></button>}
        </div>
        <label className="logs-follow">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          Follow
        </label>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={() => setText('')}>Clear</button>
        <button className="btn btn-ghost btn-sm" onClick={() => path && window.minipit?.openInFinder(path)}>Reveal</button>
      </div>
      <div className="logs-body" ref={bodyRef} onWheel={() => setFollow(false)} style={{ background: bg }}>
        {shown
          ? <pre className="logs-pre" style={{ color: fg }}>{shown}</pre>
          : <div className="files-empty" style={{ color: fg, opacity: 0.5 }}>
              {q ? 'No matching lines' : 'Waiting for log output…'}
            </div>}
      </div>
    </div>
  )
}
