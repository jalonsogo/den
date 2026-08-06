// Debug traces for agent API failures ("connection closed mid-response",
// ECONNRESET, …).
//
// den never sees the connection that breaks: the agent runs inside the
// container and opens its own HTTPS connection through the sbx proxy. What den
// *can* see is the error text on the PTY and the host-side circumstances around
// it — and that turns out to be exactly what's needed to tell the two remaining
// causes apart (see docs/errors.md):
//
//   · a hard connection-lifetime cap → `streamMs` clusters around one value
//     across traces, and the host was doing nothing special
//   · a reset of the whole path      → `sinceResumeMs` / `sinceNetChangeMs` is
//     small (the Mac just woke or changed network), or the daemon probe fails
//
// One JSON object per line under userData/traces/, so a handful of failures can
// be diffed without a log parser.

import { app, powerMonitor } from 'electron'
import { appendFileSync, mkdirSync, readFileSync, existsSync, statSync, renameSync } from 'fs'
import { join } from 'path'
import { networkInterfaces } from 'os'

export interface ApiErrorTrace {
  at: string
  sandbox: string
  agent?: string
  kind: 'closed-mid-response' | 'econnreset' | 'timeout' | 'other'
  message: string
  /** ms the agent had been mid-turn when it failed — the lifetime-cap signal. */
  streamMs: number | null
  /** ms since the previous output chunk, i.e. how long the stream had been quiet. */
  quietMs: number | null
  sandboxUptimeMs: number | null
  /** ms since the Mac last woke. Small ⇒ the wake reset the connection. */
  sinceResumeMs: number | null
  /** ms since the host's network interfaces last changed (Wi-Fi switch, VPN). */
  sinceNetChangeMs: number | null
  net: string
  /** Host-side liveness taken right after the failure, if it was probed. */
  probe?: { daemon: 'ok' | 'failed'; detail?: string; ms: number }
}

// Claude Code prints `API ERROR: <text>`; other agents word it differently, so
// match the shape rather than the exact sentence. Anchored to a line start so a
// message *about* an API error (an agent quoting one back) doesn't trip it.
const API_ERR_RE = /^[^\S\r\n]*(?:⎿\s*)?(?:API\s+ERROR|API\s+Error|Error):?\s*([^\r\n]{0,300})/gm
// The failures worth tracing. Anything else matching the line shape above is
// ordinary agent chatter and is dropped.
const TRACEABLE = /connection closed|econnreset|econnrefused|epipe|etimedout|socket hang up|premature close|unable to connect|network error|fetch failed/i

function classify(msg: string): ApiErrorTrace['kind'] {
  const m = msg.toLowerCase()
  if (m.includes('connection closed') || m.includes('premature close')) return 'closed-mid-response'
  if (m.includes('econnreset') || m.includes('socket hang up')) return 'econnreset'
  if (m.includes('etimedout') || m.includes('timeout')) return 'timeout'
  return 'other'
}

// ── Host-side circumstances ──────────────────────────────────────────────────

let lastResumeAt: number | null = null
let lastNetChangeAt: number | null = null
let netSig = ''

/** Signature of the host's routable addresses — changes on Wi-Fi/VPN switches. */
function networkSignature(): string {
  const out: string[] = []
  for (const [iface, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.internal) continue
      out.push(`${iface}:${a.address}`)
    }
  }
  return out.sort().join(',')
}

/** Start watching for sleep/wake and network changes. Call once, after ready. */
export function startApiTraceWatchers(): () => void {
  netSig = networkSignature()
  const onResume = () => { lastResumeAt = Date.now() }
  powerMonitor.on('resume', onResume)
  // A wake can restore interfaces a beat later, so sample on a timer too —
  // cheap (a few string joins) and it catches a Wi-Fi hop with no sleep.
  const timer = setInterval(() => {
    const sig = networkSignature()
    if (sig !== netSig) { netSig = sig; lastNetChangeAt = Date.now() }
  }, 10_000)
  return () => { powerMonitor.off('resume', onResume); clearInterval(timer) }
}

// ── Per-sandbox stream bookkeeping ───────────────────────────────────────────

const turnStartedAt = new Map<string, number>()
const lastOutputAt = new Map<string, number>()

/** The agent began a turn (state → working): the clock for `streamMs`. */
export function noteTurnStart(name: string): void {
  turnStartedAt.set(name, Date.now())
}

export function forgetSandbox(name: string): void {
  turnStartedAt.delete(name)
  lastOutputAt.delete(name)
  lastTraceAt.delete(name)
  lineCarry.delete(name)
}

// ── Writing ──────────────────────────────────────────────────────────────────

const MAX_BYTES = 1_000_000   // roll at ~1 MB; one previous file is kept

export function traceDir(): string {
  return join(app.getPath('userData'), 'traces')
}
export function traceFile(): string {
  return join(traceDir(), 'api-errors.jsonl')
}

function append(entry: ApiErrorTrace): void {
  try {
    mkdirSync(traceDir(), { recursive: true })
    const file = traceFile()
    // Roll before writing so the live file never grows unbounded.
    if (existsSync(file) && statSync(file).size > MAX_BYTES) {
      renameSync(file, `${file}.1`)
    }
    appendFileSync(file, `${JSON.stringify(entry)}\n`)
  } catch (e) {
    console.error('apiTrace: write failed:', e)
  }
}

/** How many traces are on disk, for the Settings row. Cheap enough on demand. */
export function traceCount(): number {
  try {
    const file = traceFile()
    if (!existsSync(file)) return 0
    return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).length
  } catch { return 0 }
}

// Repeats collapse: an agent can print the same failure several times while it
// retries, and three identical lines are one event, not three.
const lastTraceAt = new Map<string, number>()
const REPEAT_MS = 10_000

// ── Detection ────────────────────────────────────────────────────────────────

// Tail of the current (incomplete) line per sandbox. Scanning whole lines only,
// exactly once, is what keeps a failure sitting in a rolling buffer from being
// re-detected on every subsequent chunk.
const lineCarry = new Map<string, string>()
const CARRY_MAX = 4096

/**
 * Feed a chunk of ANSI-stripped agent output. Returns any traces detected
 * (usually none), so the caller can enrich and persist them.
 *
 * On the PTY hot path: the common case is a split, a regex miss, and a map set.
 */
export function scanOutputForApiErrors(
  name: string,
  chunk: string,
  ctx: { agent?: string; uptimeAt?: number }
): ApiErrorTrace[] {
  const now = Date.now()
  const text = (lineCarry.get(name) ?? '') + chunk
  const lines = text.split(/\r?\n/)
  // The last element is whatever hasn't been terminated yet — carry it forward.
  // Cap it so a binary blob with no newline can't grow without bound.
  lineCarry.set(name, (lines.pop() ?? '').slice(-CARRY_MAX))

  // Read the previous output time before this chunk overwrites it: `quietMs`
  // is how long the stream had been silent *before* the failure landed.
  const prevOutput = lastOutputAt.get(name)
  lastOutputAt.set(name, now)

  const found: ApiErrorTrace[] = []
  const buf = lines.join('\n')
  if (!buf) return found
  API_ERR_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = API_ERR_RE.exec(buf)) !== null) {
    const message = m[1].trim()
    if (!message || !TRACEABLE.test(message)) continue
    const prev = lastTraceAt.get(name) ?? 0
    if (now - prev < REPEAT_MS) continue
    lastTraceAt.set(name, now)

    const turn = turnStartedAt.get(name)
    found.push({
      at: new Date(now).toISOString(),
      sandbox: name,
      agent: ctx.agent,
      kind: classify(message),
      message: message.slice(0, 300),
      streamMs: turn ? now - turn : null,
      quietMs: prevOutput ? now - prevOutput : null,
      sandboxUptimeMs: ctx.uptimeAt ? now - ctx.uptimeAt : null,
      sinceResumeMs: lastResumeAt ? now - lastResumeAt : null,
      sinceNetChangeMs: lastNetChangeAt ? now - lastNetChangeAt : null,
      net: netSig
    })
  }
  return found
}

/** Persist a trace (optionally after its probe has filled in). */
export function writeApiErrorTrace(entry: ApiErrorTrace): void {
  append(entry)
}
