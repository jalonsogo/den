import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useStore } from '../store'
import { termTheme as resolveTermTheme } from '../lib/termThemes'

const CAP = 200_000 // keep the last ~200 KB of log text
const MAX_ROWS = 2500 // cap rendered rows so a long tail stays responsive
// Sentinels for the two in-sandbox log sources (read via `sbx exec cat`).
const KIT_PREFIX = 'kit:'    // /var/log/sbx-kit-startup.log
const SBX_PREFIX = 'sbxlog:' // /var/log/dockerd.log (the sandbox's runtime log)

type Level = 'all' | 'error' | 'warn' | 'info' | 'debug'
type LevelKey = Exclude<Level, 'all'>
const LEVELS: { id: Level; label: string }[] = [
  { id: 'all', label: 'All levels' },
  { id: 'error', label: 'Error' },
  { id: 'warn', label: 'Warning' },
  { id: 'info', label: 'Info' },
  { id: 'debug', label: 'Debug' }
]

// Best-effort severity of a raw line. Matches bare words (ERROR, warn),
// level tags (level=debug, "level":"INFO"), and error synonyms.
function classifyLevel(line: string): LevelKey | null {
  if (/\b(error|err|fatal|panic|exception|fail(?:ed|ure)?)\b/i.test(line)) return 'error'
  if (/\bwarn(?:ing)?\b/i.test(line)) return 'warn'
  if (/\binfo(?:rmation)?\b/i.test(line)) return 'info'
  if (/\b(?:debug|trace|verbose)\b/i.test(line)) return 'debug'
  return null
}

interface Parsed {
  time?: string      // HH:MM:SS.mmm
  level: LevelKey | null
  id?: string        // sandbox/container id (for per-sandbox colouring)
  component?: string // e.g. shim, sandboxd
  msg: string        // the human-readable message
  raw: string
}

function levelFromText(s: string): LevelKey | null {
  const l = s.toLowerCase()
  if (/err|fatal|panic/.test(l)) return 'error'
  if (/warn/.test(l)) return 'warn'
  if (/info/.test(l)) return 'info'
  if (/debug|trace/.test(l)) return 'debug'
  return null
}

// The sbx daemon log is JSON per line ({time,level,msg}); the msg often nests
// logfmt (level=… id=… component=… msg=…). Pull out the useful bits and fall
// back gracefully for plain lines (e.g. kit startup logs).
function parseLine(raw: string): Parsed {
  const line = raw.replace(/\s+$/, '')
  let time: string | undefined
  let outerLevel: string | undefined
  let body = line
  if (line.startsWith('{')) {
    try {
      const o = JSON.parse(line)
      if (typeof o.time === 'string') {
        const m = o.time.match(/T(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)/)
        time = m ? m[1] : undefined
      }
      if (typeof o.level === 'string') outerLevel = o.level
      if (typeof o.msg === 'string') body = o.msg
    } catch { /* not JSON — keep the raw line as the body */ }
  }
  const id = body.match(/\bid=([0-9a-f]{8,})/i)?.[1]
  const component = body.match(/\bcomponent=([\w.-]+)/)?.[1]
  const innerLevel = body.match(/\blevel=([A-Za-z]+)/)?.[1]
  const msgMatch = body.match(/\bmsg=(?:"((?:[^"\\]|\\.)*)"|(\S+))/)
  const msg = (msgMatch ? (msgMatch[1] ?? msgMatch[2]) : body).replace(/\\"/g, '"').trim()
  return {
    time,
    level: levelFromText(innerLevel || outerLevel || '') ?? classifyLevel(line),
    id,
    component,
    msg: msg || body,
    raw: line
  }
}

// Stable colour per sandbox id so lines from the same sandbox share a hue.
function idHue(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360
  return h
}

export function LogsPanel() {
  const [logs, setLogs] = useState<{ name: string; path: string }[]>([])
  const [source, setSource] = useState('') // a host file path, or `kit:<sandbox>`
  const [text, setText] = useState('')
  const [follow, setFollow] = useState(true)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<Level>('all')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const bodyRef = useRef<HTMLDivElement>(null)
  const retry = () => { setLoadError(null); setText(''); setReloadKey((k) => k + 1) }

  const sandboxes = useStore((s) => s.sandboxes)
  const running = sandboxes.filter((s) => s.status === 'running')
  const isKit = source.startsWith(KIT_PREFIX)
  const isSbxLog = source.startsWith(SBX_PREFIX)
  const inSandbox = isKit || isSbxLog
  const sbxTarget = isKit ? source.slice(KIT_PREFIX.length) : isSbxLog ? source.slice(SBX_PREFIX.length) : ''

  // Opened via a sandbox's "Logs" action → focus that sandbox's runtime log.
  const logsSandbox = useStore((s) => s.logsSandbox)
  const setLogsSandbox = useStore((s) => s.setLogsSandbox)
  useEffect(() => {
    if (!logsSandbox) return
    setSource(`${SBX_PREFIX}${logsSandbox}`)
    setLogsSandbox(null)
  }, [logsSandbox, setLogsSandbox])

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
    if (!source || inSandbox) return
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
  }, [source, inSandbox])

  // In-sandbox log source: read on demand via exec, poll while auto-refresh is on.
  useEffect(() => {
    if (!inSandbox || !sbxTarget) return
    const kind = isKit ? 'kit' : 'sandbox'
    const emptyMsg = isKit
      ? '(kit startup log is empty — no startup commands have run yet)'
      : '(sandbox log is empty)'
    const label = isKit ? 'kit startup' : 'sandbox'
    let alive = true
    const fetchOnce = () => {
      const p = window.minipit?.sandboxLog?.(sbxTarget, kind)
      if (!p) { if (alive) setLoadError('The log reader isn’t available yet — fully restart the app to load the latest update, then retry.'); return }
      p.then((r) => {
        if (!alive) return
        if (r?.ok) { setText(r.text || emptyMsg); setLoadError(null) }
        else setLoadError(`Couldn’t read the ${label} log${r?.error ? `: ${r.error}` : '.'}`)
      }).catch((e) => { if (alive) setLoadError(`Couldn’t reach the sandbox to read its ${label} log: ${e?.message ?? e}`) })
    }
    fetchOnce()
    const id = follow ? setInterval(fetchOnce, 3000) : null
    return () => { alive = false; if (id) clearInterval(id) }
  }, [inSandbox, isKit, sbxTarget, follow, reloadKey])

  // Reset any error when the selected source changes.
  useEffect(() => { setLoadError(null) }, [source])

  // Parse + filter the tail into rows. Memoised so tailing/theme changes don't
  // re-parse needlessly; only the last MAX_ROWS are rendered to stay snappy.
  const q = query.trim().toLowerCase()
  const filtering = !!q || level !== 'all'
  const { rows, matchCount } = useMemo(() => {
    const raw = text ? text.split('\n') : []
    const kept = raw.filter((l) =>
      l && (!q || l.toLowerCase().includes(q)) && (level === 'all' || classifyLevel(l) === level))
    return { rows: kept.slice(-MAX_ROWS).map(parseLine), matchCount: kept.length }
  }, [text, q, level])

  // Distinct sandbox ids present → show the colour legend only when it helps.
  const ids = useMemo(() => {
    const seen: string[] = []
    for (const r of rows) if (r.id && !seen.includes(r.id)) seen.push(r.id)
    return seen
  }, [rows])

  // Auto-scroll to bottom while following (disabled when filtering — the
  // filtered view is a subset, so jumping to its end would be misleading).
  useEffect(() => {
    if (follow && !filtering && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [rows, follow, filtering])

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
            <optgroup label="Sandbox logs">
              {running.flatMap((s) => [
                <option key={`k-${s.name}`} value={`${KIT_PREFIX}${s.name}`}>{s.name} · kit startup</option>,
                <option key={`s-${s.name}`} value={`${SBX_PREFIX}${s.name}`}>{s.name} · sandbox log</option>
              ])}
            </optgroup>
          )}
        </select>
        <select className="finput" style={{ width: 120, cursor: 'pointer' }} value={level} onChange={(e) => setLevel(e.target.value as Level)}>
          {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        {!inSandbox && ids.length > 0 && (
          <span className="logs-kind" title="Distinct sandboxes appearing in this log (each has its own colour)">
            {ids.length} sandbox{ids.length > 1 ? 'es' : ''}
          </span>
        )}
        <div className="logs-search">
          <Search size={13} className="logs-search-ic" />
          <input
            value={query}
            placeholder="Search logs…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
          />
          {filtering && <span className="logs-search-count">{matchCount}</span>}
          {query && <button className="logs-search-x" onClick={() => setQuery('')} title="Clear"><X size={13} /></button>}
        </div>
        <div className="logs-follow" onClick={() => setFollow((f) => !f)}>
          <button
            type="button"
            className={`s-toggle${follow ? ' on' : ''}`}
            role="switch"
            aria-checked={follow}
            tabIndex={-1}
          />
          {inSandbox ? 'Auto-refresh' : 'Follow'}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={() => setText('')}>Clear</button>
        {!inSandbox && (
          <button className="btn btn-ghost btn-sm" onClick={() => source && window.minipit?.openInFinder(source)}>Reveal</button>
        )}
      </div>
      <div className="logs-body" ref={bodyRef} onWheel={() => setFollow(false)} style={{ background: bg }}>
        {loadError ? (
          <div className="logs-error">
            <div className="logs-error-msg">{loadError}</div>
            <div className="logs-error-actions">
              <button className="btn btn-primary btn-sm" onClick={retry}>Retry</button>
            </div>
          </div>
        ) : rows.length ? (
          <div className="logs-lines" style={{ color: fg }}>
            {rows.map((r, i) => (
              <div key={i} className={`logline${r.level ? ` lvl-${r.level}` : ''}`} title={r.raw}>
                {r.time && <span className="logline-time">{r.time}</span>}
                {r.id && (
                  <span
                    className="logline-sid"
                    style={{ color: `hsl(${idHue(r.id)}, 70%, 66%)`, borderColor: `hsl(${idHue(r.id)}, 70%, 66%)` }}
                    title={`sandbox container ${r.id.slice(0, 16)}`}
                  >
                    {r.id.slice(0, 6)}
                  </span>
                )}
                {r.level && <span className={`logline-lvl lvl-${r.level}`}>{r.level.slice(0, 4).toUpperCase()}</span>}
                {r.component && <span className="logline-comp">{r.component}</span>}
                <span className="logline-msg">{r.msg}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="files-empty" style={{ color: fg, opacity: 0.5 }}>
            {filtering ? 'No matching lines' : 'Waiting for log output…'}
          </div>
        )}
      </div>
    </div>
  )
}
