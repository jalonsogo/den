import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useStore } from '../store'
import { termTheme as resolveTermTheme } from '../lib/termThemes'

const CAP = 200_000 // keep the last ~200 KB of log text
const KIT_PREFIX = 'kit:' // sentinel for in-sandbox kit/startup log sources

export function LogsPanel() {
  const [logs, setLogs] = useState<{ name: string; path: string }[]>([])
  const [source, setSource] = useState('') // a host file path, or `kit:<sandbox>`
  const [text, setText] = useState('')
  const [follow, setFollow] = useState(true)
  const [query, setQuery] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)

  const sandboxes = useStore((s) => s.sandboxes)
  const running = sandboxes.filter((s) => s.status === 'running')
  const isKit = source.startsWith(KIT_PREFIX)
  const kitName = isKit ? source.slice(KIT_PREFIX.length) : ''

  // Match the Logs viewer to the terminal theme picked in settings.
  const termThemeId = useStore((s) => s.termTheme)
  const appTheme = useStore((s) => s.theme)
  const theme = resolveTermTheme(termThemeId, appTheme).theme
  const bg = theme.background ?? '#0a0a0a'
  const fg = theme.foreground ?? '#d4d4d4'

  // Discover available host log files.
  useEffect(() => {
    window.minipit?.listLogs().then((l) => {
      setLogs(l ?? [])
      if (l && l.length) {
        const preferred = l.find((x) => x.name === 'daemon.log') ?? l[0]
        setSource((p) => p || preferred.path)
      }
    }).catch(() => {})
  }, [])

  // Host file source: tail it live.
  useEffect(() => {
    if (!source || isKit) return
    setText('')
    const unsub = window.minipit?.onLogTail((chunk) => {
      setText((t) => {
        const next = t + chunk
        return next.length > CAP ? next.slice(-CAP) : next
      })
    })
    window.minipit?.startLogTail(source)
    return () => {
      unsub?.()
      window.minipit?.stopLogTail()
    }
  }, [source, isKit])

  // Kit/startup log source: in-sandbox, so fetch on demand and poll while following.
  useEffect(() => {
    if (!isKit || !kitName) return
    let alive = true
    const fetchOnce = () =>
      window.minipit?.sandboxKitLog(kitName).then((r) => {
        if (!alive) return
        setText(r?.ok ? (r.text || '(kit startup log is empty — no startup commands have run yet)')
          : `Couldn’t read kit startup log${r?.error ? `: ${r.error}` : '.'}`)
      }).catch(() => {})
    setText('Reading kit startup log…')
    fetchOnce()
    const id = follow ? setInterval(fetchOnce, 3000) : null
    return () => { alive = false; if (id) clearInterval(id) }
  }, [isKit, kitName, follow])

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
        <select className="finput" style={{ width: 220, cursor: 'pointer' }} value={source} onChange={(e) => setSource(e.target.value)}>
          {logs.length === 0 && running.length === 0 && <option value="">No logs found</option>}
          {logs.length > 0 && (
            <optgroup label="Daemon logs">
              {logs.map((l) => <option key={l.path} value={l.path}>{l.name}</option>)}
            </optgroup>
          )}
          {running.length > 0 && (
            <optgroup label="Sandbox · kit startup">
              {running.map((s) => <option key={s.name} value={`${KIT_PREFIX}${s.name}`}>{s.name} · kit log</option>)}
            </optgroup>
          )}
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
          {isKit ? 'Auto-refresh' : 'Follow'}
        </label>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={() => setText('')}>Clear</button>
        {!isKit && (
          <button className="btn btn-ghost btn-sm" onClick={() => source && window.minipit?.openInFinder(source)}>Reveal</button>
        )}
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
