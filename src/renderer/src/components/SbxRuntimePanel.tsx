import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { useSbxCaps, V039_FEATURES } from '../lib/useSbx'
import { ExternalLink, Copy, UploadCloud, Stethoscope, RotateCw, Bug, Check } from 'lucide-react'
import { useStore } from '../store'
import { AccordionSection } from './AccordionSection'
import { bridgeError } from '../lib/utils'
import type { SbxRelease } from '../types'

type DiagMode = 'text' | 'json' | 'github-issue' | 'upload'

const CAP = 200_000
const MANAGER_LABEL: Record<string, string> = {
  brew: 'Homebrew', winget: 'winget', apt: 'apt', manual: 'manual install'
}
const mb = (bytes: number): string => (bytes / 1_000_000).toFixed(0)

// Extract the base x.y.z semver from a version string for comparison.
function baseSemver(v?: string | null): string | null {
  const m = v?.match(/(\d+)\.(\d+)\.(\d+)/)
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null
}

function cmpSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

function fmtDate(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

// Pull the username out of `sbx login`'s confirmation line, e.g.
// "You are signed in [username: javieralonso716]" (ANSI colour codes stripped
// first, since the stream may carry them). Returns null if no name is present.
function parseSignedInUser(output: string): string | null {
  // eslint-disable-next-line no-control-regex
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '')
  const m = clean.match(/username:\s*([^\]\s,]+)/i)
  return m ? m[1] : null
}

// `sbx diagnose` / `sbx daemon` animate their checklist with a spinner — ANSI
// escape codes plus carriage returns and cursor moves that redraw lines in
// place. Streaming those raw bytes into a <pre> shows every intermediate frame
// and control code, which mangles the layout. We resolve the stream into the
// final frame a terminal would show — honoring \r (return to column 0), \n
// (next row), cursor up/down, column reset, and erase-to-EOL — while KEEPING
// the SGR (color/bold/…) attributes on each cell so the output renders in
// colour rather than being flattened to plain text.
type Style = { fg?: string; bold?: boolean; dim?: boolean; italic?: boolean; underline?: boolean }
type TCell = { ch: string; style: Style }

// Basic 16-colour ANSI palette, tuned for the near-black output box.
const ANSI_16: Record<number, string> = {
  30: '#6b6b6b', 31: '#f14c4c', 32: '#23d18b', 33: '#f5f543',
  34: '#3b8eea', 35: '#d670d6', 36: '#29b8db', 37: '#d4d4d4',
  90: '#8a8a8a', 91: '#f14c4c', 92: '#23d18b', 93: '#f5f543',
  94: '#3b8eea', 95: '#d670d6', 96: '#29b8db', 97: '#ffffff'
}

// xterm 256-colour cube → hex (16-231 = 6×6×6 cube, 232-255 = grayscale ramp).
function xterm256(n: number): string {
  if (n < 16) return ANSI_16[n < 8 ? n + 30 : n + 82] ?? '#d4d4d4'
  if (n >= 232) { const v = 8 + (n - 232) * 10; return `rgb(${v},${v},${v})` }
  const c = n - 16
  const levels = [0, 95, 135, 175, 215, 255]
  return `rgb(${levels[Math.floor(c / 36) % 6]},${levels[Math.floor(c / 6) % 6]},${levels[c % 6]})`
}

// Fold an SGR parameter list into the running style. Handles reset (0),
// bold/dim/italic/underline, the 16-colour set, and 256/truecolour foreground
// (`38;5;n` / `38;2;r;g;b`). Background codes are consumed but not applied.
function applySgr(prev: Style, params: string): Style {
  const codes = (params === '' ? '0' : params).split(';').map((p) => parseInt(p, 10) || 0)
  let s: Style = { ...prev }
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]
    if (c === 0) s = {}
    else if (c === 1) s.bold = true
    else if (c === 2) s.dim = true
    else if (c === 3) s.italic = true
    else if (c === 4) s.underline = true
    else if (c === 22) { s.bold = false; s.dim = false }
    else if (c === 23) s.italic = false
    else if (c === 24) s.underline = false
    else if (c === 39) delete s.fg
    else if (ANSI_16[c]) s.fg = ANSI_16[c]
    else if (c === 38) {
      if (codes[i + 1] === 5) { s.fg = xterm256(codes[i + 2] ?? 0); i += 2 }
      else if (codes[i + 1] === 2) { s.fg = `rgb(${codes[i + 2] ?? 0},${codes[i + 3] ?? 0},${codes[i + 4] ?? 0})`; i += 4 }
    } else if (c === 48) {                                              // background — skip its args
      if (codes[i + 1] === 5) i += 2
      else if (codes[i + 1] === 2) i += 4
    }
  }
  return s
}

function styleToCss(style: Style): CSSProperties {
  const s: CSSProperties = {}
  if (style.fg) s.color = style.fg
  if (style.bold) s.fontWeight = 700
  if (style.dim) s.opacity = 0.7
  if (style.italic) s.fontStyle = 'italic'
  if (style.underline) s.textDecoration = 'underline'
  return s
}

const EMPTY_STYLE: Style = {}
const styleKey = (s: Style) => `${s.fg ?? ''}|${s.bold ? 1 : 0}${s.dim ? 1 : 0}${s.italic ? 1 : 0}${s.underline ? 1 : 0}`
const isBlank = (c: TCell) => c.ch === ' ' && styleKey(c.style) === styleKey(EMPTY_STYLE)

// Resolve a raw terminal stream (ANSI escapes, \r, cursor moves) into a grid of
// styled cells — the final frame a terminal would show, colours kept.
function terminalGrid(raw: string): TCell[][] {
  const rows: TCell[][] = [[]]
  let row = 0
  let col = 0
  let style: Style = {}
  const ensureRow = () => { while (rows.length <= row) rows.push([]) }
  const padTo = (r: TCell[]) => { while (r.length < col) r.push({ ch: ' ', style: {} }) }
  for (let i = 0; i < raw.length; ) {
    const ch = raw[i]
    if (ch === '\x1b') {
      const m = /^\x1b\[([0-9;?]*)([A-Za-z])/.exec(raw.slice(i))
      if (m) {
        const params = m[1]
        const n = parseInt(params || '1', 10) || 1
        switch (m[2]) {
          case 'm': style = applySgr(style, params); break              // SGR (colour/bold/…)
          case 'A': row = Math.max(0, row - n); col = 0; break          // cursor up
          case 'B': row += n; col = 0; ensureRow(); break               // cursor down
          case 'G': col = 0; break                                      // to column 1
          case 'K': ensureRow(); rows[row] = rows[row].slice(0, col); break // erase to EOL
          default: break                                                // other escapes — no-op
        }
        i += m[0].length
      } else {
        i += 1                                                          // lone/unknown escape — skip
      }
      continue
    }
    if (ch === '\r') { col = 0; i += 1; continue }
    if (ch === '\n') { row += 1; col = 0; ensureRow(); i += 1; continue }
    ensureRow()
    padTo(rows[row])
    rows[row][col] = { ch, style }                                      // overwrite at cursor
    col += 1
    i += 1
  }
  return rows
}

// Render the resolved grid as coloured React nodes for the <pre>. Consecutive
// cells sharing a style collapse into one <span>; rows join with '\n'.
function terminalNodes(raw: string): ReactNode[] {
  const rows = terminalGrid(raw)
  const out: ReactNode[] = []
  rows.forEach((cells, r) => {
    let end = cells.length
    while (end > 0 && isBlank(cells[end - 1])) end -= 1                 // trim trailing blanks
    const segs: { key: string; style: Style; text: string }[] = []
    for (let c = 0; c < end; c++) {
      const cell = cells[c]
      const key = styleKey(cell.style)
      const last = segs[segs.length - 1]
      if (last && last.key === key) last.text += cell.ch
      else segs.push({ key, style: cell.style, text: cell.ch })
    }
    segs.forEach((seg, si) => {
      out.push(seg.key === styleKey(EMPTY_STYLE)
        ? seg.text
        : <span key={`${r}-${si}`} style={styleToCss(seg.style)}>{seg.text}</span>)
    })
    if (r < rows.length - 1) out.push('\n')
  })
  return out
}

// Plain-text version of the resolved grid — for the clipboard (Copy JSON / For
// bug report), where escape codes in pasted text would be noise.
function terminalText(raw: string): string {
  return terminalGrid(raw)
    .map((cells) => cells.map((c) => c.ch).join('').replace(/\s+$/, ''))
    .join('\n')
}

export function SbxRuntimePanel({
  sbxPath,
  onChangePath
}: {
  sbxPath: string
  onChangePath: (path: string) => void
}) {
  const [version, setVersion] = useState<string | null>(null)
  const [versionErr, setVersionErr] = useState<string | null>(null)
  const [releases, setReleases] = useState<SbxRelease[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<null | 'update' | 'redownload'>(null)
  const [output, setOutput] = useState('')
  const [verify, setVerify] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle')
  const [install, setInstall] = useState<import('../types').SbxInstallInfo | null>(null)
  const [account, setAccount] = useState<{ loggedIn: boolean; username?: string } | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  // A DNS/network reachability failure during sign-in/out — surfaced under the
  // Authentication row so a network blip doesn't read as "not signed in".
  const [authNetErr, setAuthNetErr] = useState<string | null>(null)
  const [loginOut, setLoginOut] = useState('')
  const outRef = useRef<HTMLDivElement>(null)
  const loginRef = useRef<HTMLDivElement>(null)

  // Diagnostics (`sbx diagnose`) — its own busy/output state so it doesn't
  // collide with the update/login stream above.
  const [diagBusy, setDiagBusy] = useState<null | DiagMode>(null)
  const [diagOut, setDiagOut] = useState('')
  const [diagCopied, setDiagCopied] = useState<null | 'json' | 'github-issue'>(null)
  // The export/share options (Copy JSON, For bug report, Upload bundle) stay
  // hidden until a diagnostics run has completed at least once — they only make
  // sense once you've actually run the probe.
  const [diagRan, setDiagRan] = useState(false)
  // Daemon restart (`sbx daemon restart`) — its own output
  // box, rendered under the Restart daemon button.
  const [daemonBusy, setDaemonBusy] = useState(false)
  const [daemonOut, setDaemonOut] = useState('')
  const diagRef = useRef<HTMLDivElement>(null)
  const daemonRef = useRef<HTMLDivElement>(null)

  // Debug traces for dropped agent API connections. Recorded in the background
  // whether or not anyone is looking — the failure is intermittent, so the count
  // here is usually the first sign one happened.
  const [traces, setTraces] = useState<{ path: string; count: number } | null>(null)
  const [traceErr, setTraceErr] = useState<string | null>(null)
  useEffect(() => {
    const load = () => { void window.minipit?.apiTraces?.().then(setTraces).catch(() => {}) }
    load()
    // Refresh live: a failure can land while this panel is open.
    return window.minipit?.onApiError?.(load)
  }, [])

  // Daemon health + log level (`sbx daemon status` / `log-level`).
  const [daemonStatus, setDaemonStatus] = useState<{ running: boolean; raw?: string } | null>(null)
  const [daemonChecking, setDaemonChecking] = useState(false)
  const [daemonCheckedAt, setDaemonCheckedAt] = useState<number | null>(null)
  const [logLevel, setLogLevel] = useState<string>('')
  const [logLevelBusy, setLogLevelBusy] = useState(false)

  // Runtime settings (`sbx settings set`) + reset (`sbx reset`).
  const [imagePaste, setImagePaste] = useState(false)
  const [settingBusy, setSettingBusy] = useState(false)
  const caps = useSbxCaps()
  type RtStatus = Awaited<ReturnType<NonNullable<typeof window.minipit>['runtimeStatus']>>
  const [rt, setRt] = useState<RtStatus | null>(null)
  const [rtBusy, setRtBusy] = useState(false)
  const [rtMsg, setRtMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [rtProg, setRtProg] = useState<{ phase: string; got: number; total: number } | null>(null)
  // What the user just asked for, shown while the switch is still in flight —
  // otherwise the toggle reads "My own install" during the whole download.
  const [rtPending, setRtPending] = useState<'managed' | 'system' | null>(null)
  const [remoteControl, setRemoteControl] = useState(false)
  const [remoteKnown, setRemoteKnown] = useState(false)
  const [remoteBusy, setRemoteBusy] = useState(false)
  const [mirror, setMirror] = useState('')
  const [mirrorKnown, setMirrorKnown] = useState(false)
  const [mirrorTouched, setMirrorTouched] = useState(false)
  const [mirrorBusy, setMirrorBusy] = useState(false)
  const [mirrorSaved, setMirrorSaved] = useState<'ok' | 'fail' | null>(null)
  // den-managed runtime env overrides (proxy / virtiofs cache). Take effect on
  // the next daemon restart.
  const [runtimeProxy, setRuntimeProxy] = useState('')
  const [runtimeNoProxy, setRuntimeNoProxy] = useState('')
  const [virtiofsCache, setVirtiofsCache] = useState(true)
  const [runtimeEnvDirty, setRuntimeEnvDirty] = useState(false)
  // SSH access (`sbx setup ssh`) — the managed *.sbx block in ~/.ssh/config.
  const [ssh, setSsh] = useState<import('../types').SshStatus | null>(null)
  const [sshBusy, setSshBusy] = useState(false)
  const [sshMsg, setSshMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [preserveSecrets, setPreserveSecrets] = useState(true)
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // The changelog sits (collapsed) under the update button as an accordion.
  // The destructive "Reset everything" button only turns red once the user has
  // typed the confirmation word; until then it's a neutral, disabled button.
  const canReset = resetConfirm.trim().toLowerCase() === 'reset'

  const loadAccount = () =>
    window.minipit?.dockerAccount()
      .then((a) => setAccount(a ?? { loggedIn: false }))
      .catch(() => setAccount({ loggedIn: false }))

  // `sbx login` opens a browser to authenticate the runtime — the fix for the
  // "not authenticated … please sign in" 401 that blocks sandbox creation.
  const handleSignIn = async () => {
    if (signingIn) return
    setSigningIn(true)
    setLoginOut('')
    setAuthNetErr(null)
    const r = await window.minipit?.dockerLogin().catch((e) => ({ ok: false, error: String(e) }))
    setSigningIn(false)
    if (r?.ok) {
      // The runtime login can authenticate a different account than the Docker
      // Hub credential store `loadAccount()` reads, so its confirmation ("You
      // are signed in [username: …]") is the authoritative source here — reflect
      // it directly rather than re-reading the credential store, which may not
      // carry the runtime login and would wrongly revert the row to "Not signed
      // in". Only fall back to the credential store when the runtime reports no
      // username.
      const out = 'output' in r ? r.output : undefined
      const username = out ? parseSignedInUser(out) : null
      if (username) {
        setAccount({ loggedIn: true, username })
      } else {
        const a = await window.minipit?.dockerAccount().catch(() => null)
        setAccount(a?.loggedIn ? a : { loggedIn: true })
      }
      // Refresh the shared account (toolbar menu, push-namespace prefills).
      useStore.getState().loadDockerAccount()
    } else if (r && 'netError' in r && r.netError) {
      // Couldn't reach Docker Hub — say so instead of implying a bad login.
      setAuthNetErr('Couldn’t reach Docker Hub — check your network/DNS (or a proxy/firewall in front of it) and try again.')
    }
  }

  // `sbx logout` clears all stored Docker credentials (v0.35), so this fully
  // resets the Authentication state.
  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    setLoginOut('')
    setAuthNetErr(null)
    const r = await window.minipit?.dockerLogout().catch((e) => ({ ok: false, error: String(e) }))
    setSigningOut(false)
    if (r?.ok) {
      setAccount({ loggedIn: false })
      // Refresh the shared account (toolbar menu, push-namespace prefills).
      useStore.getState().loadDockerAccount()
    } else if (r && 'netError' in r && r.netError) {
      setAuthNetErr('Couldn’t reach Docker Hub to sign out — check your network/DNS and try again.')
    }
  }

  const loadVersion = () => {
    window.minipit?.sbxVersion(sbxPath).then((r) => {
      if (r?.ok) { setVersion(r.version ?? r.raw ?? null); setVersionErr(null) }
      else setVersionErr(r?.error ?? 'sbx not found')
    }).catch(() => setVersionErr('sbx not found'))
  }

  const handleVerify = async () => {
    setVerify('checking')
    const res = await window.minipit?.sbxVersion(sbxPath).catch(() => null)
    setVerify(res?.ok ? 'ok' : 'fail')
    if (res?.ok) { setVersion(res.version ?? res.raw ?? null); setVersionErr(null) }
    setTimeout(() => setVerify('idle'), 2500)
  }

  // `sbx daemon status` spawns a process, and a re-check that returns the same
  // answer leaves the row byte-identical — so without an explicit in-flight state
  // and a checked-at stamp, a working button is indistinguishable from a dead one.
  const loadDaemonStatus = () => {
    setDaemonChecking(true)
    return window.minipit?.daemonStatus()
      .then((s) => setDaemonStatus(s?.ok ? { running: s.running, raw: s.raw } : { running: false, raw: s?.error }))
      .catch(() => setDaemonStatus(null))
      .finally(() => { setDaemonChecking(false); setDaemonCheckedAt(Date.now()) })
  }

  useEffect(() => {
    loadVersion()
    loadAccount()
    loadDaemonStatus()
    window.minipit?.sbxInstallInfo().then((i) => setInstall(i ?? null)).catch(() => {})
    window.minipit?.sbxReleases().then((r) => setReleases(r ?? [])).catch(() => {}).finally(() => setLoading(false))
    window.minipit?.getSettings().then((s) => {
      setImagePaste(!!s?.imagePaste)
      setRuntimeProxy(s?.runtimeProxy ?? '')
      setRuntimeNoProxy(s?.runtimeNoProxy ?? '')
      setVirtiofsCache(s?.runtimeVirtiofsCache ?? true)
    }).catch(() => {})
    window.minipit?.daemonLogLevel().then((r) => { if (r?.ok && r.level) setLogLevel(r.level) }).catch(() => {})
    // Read the two v0.39 settings back from sbx rather than trusting what den
    // last wrote — they can be changed from the terminal.
    void window.minipit?.sbxSettingGet?.('claude.remoteControl')
      .then((r) => { if (r?.ok) { setRemoteControl(/^(true|1|yes|on)$/i.test(r.value)); setRemoteKnown(true) } })
      .catch(() => {})
    void window.minipit?.sbxSettingGet?.('platform.images.registryMirror')
      // Don't clobber something already being typed if the read lands late.
      .then((r) => { if (r?.ok) { setMirrorKnown(true); setMirror((cur) => (cur ? cur : r.value)) } })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist the toggle in den's settings AND apply it to the runtime via
  // `sbx settings set` so the two stay in step.
  const toggleImagePaste = async () => {
    if (settingBusy) return
    const next = !imagePaste
    setSettingBusy(true)
    setImagePaste(next)
    const res = await window.minipit?.sbxSettingSet('clipboard.imagePaste', String(next)).catch(() => null)
    if (res?.ok) window.minipit?.saveSettings({ imagePaste: next }).catch(() => {})
    else setImagePaste(!next) // revert on failure
    setSettingBusy(false)
  }

  // Claude Code's /remote-control inside a sandbox (v0.39). Off by default in
  // sbx: it opens a control channel into the sandbox, which is exactly the kind
  // of thing that should be a deliberate choice rather than a default.
  const toggleRemoteControl = async () => {
    if (remoteBusy) return
    const next = !remoteControl
    setRemoteBusy(true)
    setRemoteControl(next)
    const res = await window.minipit?.sbxSettingSet('claude.remoteControl', String(next)).catch(() => null)
    // A successful write is itself knowledge of the current value, so the
    // "couldn't read it" caveat should stop contradicting a value den just set.
    if (res?.ok) setRemoteKnown(true)
    else setRemoteControl(!next) // revert on failure
    setRemoteBusy(false)
  }

  // Redirect Docker Hub-resolving template and kit images to an org mirror
  // (v0.39). Empty clears it, which is the documented way back to Hub.
  const saveMirror = async () => {
    if (mirrorBusy) return
    // Saving an empty box clears the org's mirror. That's a legitimate action,
    // but only if den could actually read what's there — otherwise "empty"
    // means "unknown", and Save would silently wipe a configured mirror.
    if (!mirror.trim() && !mirrorKnown && !window.confirm(
      'den could not read the current registry mirror from sbx.\n\n' +
      'Saving an empty value clears any mirror your organisation has configured. Continue?'
    )) return
    setMirrorBusy(true)
    const res = await window.minipit?.sbxSettingSet('platform.images.registryMirror', mirror.trim())
      .catch(() => null)
    setMirrorSaved(res?.ok ? 'ok' : 'fail')
    setMirrorBusy(false)
    setTimeout(() => setMirrorSaved(null), 2500)
  }

  const loadRuntime = () => {
    void window.minipit?.runtimeStatus?.().then(setRt).catch(() => {})
  }
  useEffect(loadRuntime, [])
  useEffect(() => {
    const off = window.minipit?.onRuntimeProgress?.((p) => setRtProg(p))
    return () => { off?.() }
  }, [])

  // Installing adopts the runtime as a side effect, so there's no separate
  // "switch" step to forget. Output streams on the existing runtime channel.
  const installManaged = async () => {
    if (rtBusy) return
    setRtBusy(true); setRtMsg(null); setRtProg(null); setRtPending('managed')
    const r = await window.minipit?.runtimeInstall()
      .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }))
    setRtBusy(false); setRtPending(null); setRtProg(null)
    setRtMsg(r?.ok
      ? { ok: true, text: `sbx ${r.version} installed and in use. Restart the daemon to apply it.` }
      : { ok: false, text: r?.error || 'Install failed.' })
    loadRuntime()
  }

  const setRuntimeSource = async (source: 'managed' | 'system') => {
    if (rtBusy || rt?.source === source) return
    setRtBusy(true); setRtMsg(null); setRtPending(source)
    const r = source === 'system'
      ? await window.minipit?.runtimeRevert().catch(() => null)
      : await window.minipit?.runtimeSetSource('managed').catch(() => null)
    setRtBusy(false)
    if (source === 'managed' && r && 'needsInstall' in r && r.needsInstall) { void installManaged(); return }
    setRtPending(null)
    setRtMsg(r?.ok
      ? { ok: true, text: 'Runtime source changed. Restart the daemon to apply it.' }
      : { ok: false, text: (r && 'error' in r && r.error) || 'Could not change the runtime source.' })
    loadRuntime()
  }

  const changeLogLevel = async (level: string) => {
    if (logLevelBusy || !level) return
    setLogLevelBusy(true)
    const prev = logLevel
    setLogLevel(level)
    const r = await window.minipit?.daemonLogLevel(level).catch(() => null)
    if (!r?.ok) setLogLevel(prev) // revert on failure
    else if (r.level) setLogLevel(r.level)
    setLogLevelBusy(false)
  }

  // Persist a den-managed runtime env override. Marks the section dirty so we
  // can prompt for the daemon restart that actually applies it.
  const saveRuntimeEnv = async (key: 'runtimeProxy' | 'runtimeNoProxy' | 'runtimeVirtiofsCache', value: string | boolean) => {
    await window.minipit?.setRuntimeEnv(key, value === '' ? null : value).catch(() => {})
    window.minipit?.saveSettings({ [key]: value }).catch(() => {})
    setRuntimeEnvDirty(true)
  }

  const toggleVirtiofsCache = () => {
    const next = !virtiofsCache
    setVirtiofsCache(next)
    saveRuntimeEnv('runtimeVirtiofsCache', next)
  }

  const handleReset = async () => {
    if (resetBusy || !canReset) return
    setResetBusy(true)
    setResetMsg(null)
    const res = await window.minipit?.sbxReset(preserveSecrets).catch((e) => ({ ok: false, error: String(e) }))
    setResetBusy(false)
    setResetConfirm('')
    if (res?.ok) setResetMsg({ ok: true, text: 'Reset complete. All sandbox data was removed.' })
    else setResetMsg({ ok: false, text: (res && 'error' in res && res.error) || 'Reset failed.' })
  }

  // Stream brew (update/redownload) into the main output box, and `sbx login`
  // into its own box under the Authentication row so the sign-in confirmation
  // shows next to that control rather than at the bottom of the card.
  useEffect(() => {
    const unsubRt = window.minipit?.onRuntimeOutput((chunk) =>
      setOutput((t) => { const next = t + chunk; return next.length > CAP ? next.slice(-CAP) : next }))
    const unsubLogin = window.minipit?.onLoginOutput((chunk) =>
      setLoginOut((t) => { const next = t + chunk; return next.length > CAP ? next.slice(-CAP) : next }))
    return () => { unsubRt?.(); unsubLogin?.() }
  }, [])

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight
  }, [output])

  useEffect(() => {
    if (loginRef.current) loginRef.current.scrollTop = loginRef.current.scrollHeight
  }, [loginOut])

  // Stream `sbx diagnose` output into its own box.
  useEffect(() => {
    const unsub = window.minipit?.onDiagnoseOutput((chunk) =>
      setDiagOut((t) => { const next = t + chunk; return next.length > CAP ? next.slice(-CAP) : next })
    )
    return () => unsub?.()
  }, [])

  useEffect(() => {
    if (diagRef.current) diagRef.current.scrollTop = diagRef.current.scrollHeight
  }, [diagOut])

  // Read the SSH-config state once on mount (cheap, and read-only).
  const loadSsh = () => window.minipit?.sshStatus().then((s) => setSsh(s ?? null)).catch(() => setSsh(null))
  useEffect(() => { void loadSsh() }, [])

  const runSshSetup = async () => {
    if (sshBusy) return
    setSshBusy(true)
    setSshMsg(null)
    // Report what actually failed. Swallowing the rejection here (`.catch(() =>
    // null)`) and falling back to "could not write the SSH config" blamed the
    // file for what is usually an IPC problem — most often a stale main process
    // in dev, where the renderer hot-reloads but the handler doesn't exist yet.
    const r = await Promise.resolve()
      .then(() => window.minipit?.sshSetup())
      // bridgeError separates a stale preload/main bundle (needs an app relaunch,
      // and would otherwise surface as a bare JS error) from a real sbx failure.
      .catch((e) => ({ ok: false, error: bridgeError(e, 'Running sbx setup ssh') }))
    setSshBusy(false)
    if (r?.ok) {
      setSshMsg({ ok: true, text: 'SSH config written — sandboxes are reachable at <name>.sbx.' })
    } else {
      setSshMsg({ ok: false, text: r?.error?.trim() || bridgeError(null, 'Running sbx setup ssh') })
    }
    void loadSsh()
  }

  // Stream `sbx daemon` (restart) output into its own box.
  useEffect(() => {
    const unsub = window.minipit?.onDaemonOutput((chunk) =>
      setDaemonOut((t) => { const next = t + chunk; return next.length > CAP ? next.slice(-CAP) : next })
    )
    return () => unsub?.()
  }, [])

  useEffect(() => {
    if (daemonRef.current) daemonRef.current.scrollTop = daemonRef.current.scrollHeight
  }, [daemonOut])

  // Run a diagnostics variant that renders into the output box: `text` (the
  // colour report) and `upload` (streams progress, prints the shareable id).
  const runDiag = async (mode: 'text' | 'upload') => {
    if (diagBusy || daemonBusy) return
    setDiagBusy(mode)
    setDiagOut('')
    const res = await window.minipit?.diagnose(mode).catch((e) => ({ ok: false, output: undefined, error: String(e) }))
    setDiagBusy(null)
    if (res?.ok) setDiagRan(true)
  }

  // Copy a diagnostics report to the clipboard in the background — json (for
  // tooling) or github-issue (pre-formatted bug report). These run their own
  // `sbx diagnose` but deliberately leave the visible report untouched.
  const copyDiag = async (mode: 'json' | 'github-issue') => {
    if (diagBusy || daemonBusy) return
    setDiagBusy(mode)
    const res = await window.minipit?.diagnose(mode).catch(() => null)
    setDiagBusy(null)
    if (res?.ok && res.output) {
      try {
        await navigator.clipboard.writeText(terminalText(res.output))
        setDiagCopied(mode)
        setTimeout(() => setDiagCopied((cur) => (cur === mode ? null : cur)), 2000)
      } catch { /* clipboard unavailable */ }
    }
  }

  // Stop and restart the sbx daemon. Output streams into its own box under the
  // Restart daemon button.
  const restartDaemon = async () => {
    if (daemonBusy || diagBusy) return
    setDaemonBusy(true)
    setDaemonOut('')
    await window.minipit?.daemonRestart().catch(() => null)
    setDaemonBusy(false)
    setRuntimeEnvDirty(false) // a restart applies any pending runtime env changes
    loadDaemonStatus()
  }

  const run = async (action: 'update' | 'redownload') => {
    setBusy(action)
    setOutput('')
    const res = await window.minipit?.sbxUpdate(action).catch(() => null)
    setBusy(null)
    if (res?.ok) loadVersion()
  }

  const latest = releases[0]?.version
  const curBase = baseSemver(version)
  const latestBase = baseSemver(latest)
  const updateAvailable = curBase && latestBase ? cmpSemver(curBase, latestBase) < 0 : false

  return (
    <div className="page-body" style={{ padding: '8px 28px 28px' }}>
      <AccordionSection id="runtime-runtime" title="Runtime" defaultOpen>
        <div className="ss-row">
          <div>
            <div className="ss-lbl">Installed version</div>
            <div className="ss-sub" style={{ fontFamily: "'SF Mono','Menlo',monospace" }}>
              {versionErr ? <span style={{ color: 'var(--destruct)' }}>{versionErr}</span> : version ?? 'Checking…'}
              {rt?.source === 'managed' && <span style={{ fontFamily: 'inherit' }}> · managed by den</span>}
            </div>
          </div>
          {/* With a managed runtime the pin is the truth, not GitHub's latest —
              offering a package-manager update here would be telling the user to
              break the version den is built for. */}
          {rt?.source === 'managed'
            ? version && rt.adopted && version.includes(rt.pinned)
              ? <span className="rt-badge rt-badge-ok">Pinned to {rt.pinned}</span>
              : null
            : updateAvailable
              ? <span className="rt-badge rt-badge-update">Update available → {latest}</span>
              : version && latest
                ? <span className="rt-badge rt-badge-ok">Up to date</span>
                : null}
        </div>
        <div className="ss-row">
          <div>
            <div className="ss-lbl">Authentication</div>
            <div className="ss-sub">
              {account === null
                ? 'Checking…'
                : account.loggedIn
                  ? account.username ? <>Signed in as <strong className="ss-user">{account.username}</strong></> : 'Signed in'
                  : 'Not signed in — authenticate the runtime with sbx login.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <button className="btn btn-default btn-sm" onClick={handleSignIn} disabled={signingIn || signingOut}>
              {signingIn ? 'Signing in…' : account?.loggedIn ? 'Re-authenticate' : 'Sign in'}
            </button>
            {account?.loggedIn && (
              <button className="btn btn-ghost btn-sm" onClick={handleSignOut} disabled={signingIn || signingOut}>
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            )}
          </div>
        </div>
        {authNetErr && (
          <div className="ss-row" style={{ paddingTop: 0 }}>
            <div className="ss-sub" style={{ color: 'var(--destruct)' }}>{authNetErr}</div>
          </div>
        )}
        {loginOut && (
          <div className="ss-row" style={{ paddingTop: 0 }}>
            <div className="rt-output" ref={loginRef}>
              <pre className="logs-pre">{loginOut}</pre>
            </div>
          </div>
        )}
        {/* Which sbx den runs. Managed = a pinned copy den downloaded and owns;
            system = whatever is installed. The pin is what makes den's UI match
            the runtime, so it's stated on screen rather than left in the code. */}
        <div className="ss-row">
          <div>
            <div className="ss-lbl">Runtime source</div>
            <div className="ss-sub">
              {rt && <>den is built for <strong>sbx {rt.minor}.x</strong>. </>}
              {rt?.supported === false
                ? <> {rt.unsupportedReason}</>
                : <> A managed runtime is downloaded from Docker’s releases and kept inside den —
                    your own install is left untouched.</>}
            </div>
          </div>
          <div className="seg" role="group">
            <button
              className={`seg-opt${(rtPending ?? rt?.source) === 'managed' ? ' on' : ''}`}
              disabled={rtBusy || rt?.supported === false}
              title={rt?.supported === false ? rt.unsupportedReason : `Use sbx ${rt?.pinned ?? ''} managed by den`}
              onClick={() => void setRuntimeSource('managed')}
            >
              Managed by den
            </button>
            <button
              className={`seg-opt${(rtPending ?? rt?.source) === 'system' ? ' on' : ''}`}
              disabled={rtBusy}
              onClick={() => void setRuntimeSource('system')}
            >
              My own install
            </button>
          </div>
        </div>

        {((rtPending ?? rt?.source) === 'managed') && (
          <div className="ss-row" style={{ paddingTop: 0 }}>
            <div>
              <div className="ss-lbl">Managed runtime</div>
              <div className="ss-sub">
                {rt?.adopted
                  ? <>Running <code>sbx {rt.adopted}</code> from den’s own folder.
                      {rt.adopted !== rt.pinned && <> This build pins {rt.pinned}.</>}</>
                  : <>Not downloaded yet — about 127 MB, roughly 330 MB once unpacked.</>}
              </div>
            </div>
            <button className="btn btn-default btn-sm" disabled={rtBusy} onClick={() => void installManaged()}>
              {rtBusy ? 'Working…' : rt?.adopted === rt?.pinned ? 'Reinstall' : `Install ${rt?.pinned ?? ''}`}
            </button>
          </div>
        )}

        {/* One line and a bar, not a console. The only number worth showing
            during a 127 MB download is how much of it is left. */}
        {rtProg && rtProg.phase !== 'done' && (
          <div className="ss-row" style={{ paddingTop: 0 }}>
            <div style={{ width: '100%' }}>
              <div className="ss-sub" style={{ marginBottom: 6 }}>
                {rtProg.phase === 'download'
                  ? rtProg.total
                    ? `Downloading — ${mb(rtProg.got)} of ${mb(rtProg.total)} MB`
                    : 'Downloading…'
                  : rtProg.phase === 'extract' ? 'Verified. Unpacking…'
                  : rtProg.phase === 'verify'  ? 'Checking the binary runs…'
                  : rtProg.phase === 'failed'  ? 'Failed.'
                  : 'Working…'}
              </div>
              <div className="rt-progress">
                <div
                  className={`rt-progress-fill${rtProg.phase === 'download' && rtProg.total ? '' : ' indet'}`}
                  style={rtProg.phase === 'download' && rtProg.total
                    ? { width: `${Math.round((rtProg.got / rtProg.total) * 100)}%` }
                    : undefined}
                />
              </div>
            </div>
          </div>
        )}

        {rtMsg && (
          <div className="ss-row" style={{ paddingTop: 0 }}>
            <div className={`np-banner ${rtMsg.ok ? 'ok' : 'err'}`} style={{ width: '100%' }}>
              <span className="np-banner-txt" style={{ whiteSpace: 'pre-wrap' }}>{rtMsg.text}</span>
            </div>
          </div>
        )}

        {/* Say what this runtime can't do. den hides those affordances, which
            keeps the UI honest but leaves someone who read about a feature
            hunting for it — so disclose it once, here, instead of putting a nag
            on five screens. */}
        {caps.known && !caps.hasEnvFiles && (
          <div className="ss-row">
            <div>
              <div className="ss-lbl">Not available on this runtime</div>
              <div className="ss-sub">
                You’re on <code>{caps.version}</code>. These need <strong>sbx 0.39</strong> and are
                hidden until then — everything else works as normal.
                <ul className="rt-gated">
                  {V039_FEATURES.map((f) => (
                    <li key={f.name}>{f.name} <span className="rt-gated-where">· {f.where}</span></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Everything below belongs to a user-managed install: a binary path to
            point at, and the package manager's own update flow. With the managed
            runtime selected none of it applies, and showing both was the mess. */}
        {(rtPending ?? rt?.source) !== 'managed' && <>
        <div className="ss-row">
          <div>
            <div className="ss-lbl">sbx binary path</div>
            <div className="ss-sub">
              {rt?.source === 'managed'
                ? <>Only used when the source is <em>My own install</em>. </>
                : install ? `Installed via ${MANAGER_LABEL[install.manager]}. ` : ''}
              {install?.updateCmd && rt?.source !== 'managed'
                ? <>Update with <code>{install.updateCmd}</code>. </>
                : ''}
              Click Save to persist.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <input
              className="s-input"
              value={sbxPath}
              onChange={(e) => onChangePath(e.target.value)}
              style={{ width: 192 }}
            />
            <button className="btn btn-default btn-sm" onClick={handleVerify} disabled={verify === 'checking'}>
              {verify === 'checking' ? '…' : verify === 'ok' ? '✓ OK' : verify === 'fail' ? '✗ Failed' : 'Verify'}
            </button>
          </div>
        </div>
        <div className="ss-row">
          <div>
            <div className="ss-lbl">Latest release</div>
            <div className="ss-sub">
              {loading ? 'Checking GitHub…' : latest ? (
                <>
                  {/* The version name is the link to its notes — one affordance,
                      instead of a collapsible changelog that cost a whole row of
                      vertical space while nobody opened it. */}
                  <a className="rt-relink" onClick={() => releases[0] && window.minipit?.openPath(releases[0].url)}>{latest}</a>
                  {' · '}{fmtDate(releases[0]?.date)}
                  {updateAvailable && <> · <a className="rt-relink" onClick={() => releases[0] && window.minipit?.openPath(releases[0].url)}>What’s new</a></>}
                </>
              ) : 'Unavailable'}
            </div>
          </div>
          {install && !install.canAutoUpdate ? (
            <button className="btn btn-default btn-sm" onClick={() => window.minipit?.openPath(install.releasesUrl)}>
              <ExternalLink size={13} /> Download
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 7 }}>
              <button
                className={`btn btn-sm ${updateAvailable ? 'btn-primary' : 'btn-default'}`}
                onClick={() => run('update')}
                disabled={busy !== null}
              >
                {busy === 'update' ? 'Updating…' : 'Update'}
              </button>
              <button className="btn btn-default btn-sm" onClick={() => run('redownload')} disabled={busy !== null}>
                {busy === 'redownload' ? 'Reinstalling…' : 'Redownload'}
              </button>
            </div>
          )}
        </div>
        {install && !install.canAutoUpdate && (
          <div className="ss-row" style={{ paddingTop: 0 }}>
            <div className="rt-cmdhint">
              {install.manager === 'apt'
                ? <>Update with: <code>{install.updateCmd}</code></>
                : <>This sbx wasn’t installed by a package manager den can drive. Update by downloading the latest build above (or re-run your installer).</>}
            </div>
          </div>
        )}
        {output && (
          <div className="ss-row" style={{ paddingTop: 0 }}>
            <div className="rt-output" ref={outRef}>
              <pre className="logs-pre">{output}</pre>
            </div>
          </div>
        )}
        </>}

        {/* Daemon lifecycle belongs with the runtime it runs, not under
            Diagnostics — restarting it is routine, not an investigation. */}
        <div className="ss-row">
          <div>
            <div className="ss-lbl">
              Daemon status
              {daemonStatus && (
                <span
                  className={`rt-badge ${daemonStatus.running ? 'rt-badge-ok' : 'rt-badge-update'}`}
                  style={{ marginLeft: 8 }}
                  title={daemonStatus.raw || ''}
                >
                  {daemonStatus.running ? 'Running' : 'Stopped'}
                </span>
              )}
              {daemonCheckedAt && !daemonChecking && (
                <span className="rt-checked">checked {new Date(daemonCheckedAt).toLocaleTimeString()}</span>
              )}
            </div>
            <div className="ss-sub">
              Restart the sbx daemon (<code>sbx daemon restart</code>) — try this if you hit connection errors
              (<code>ECONNREFUSED</code>/<code>ECONNRESET</code>).
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={loadDaemonStatus}
              disabled={daemonBusy || daemonChecking}
              title="Re-run `sbx daemon status`"
            >
              <RotateCw size={13} className={daemonChecking ? 'spin' : undefined} />
              {daemonChecking ? 'Checking…' : 'Check status'}
            </button>
            <button
              className="btn btn-default btn-sm"
              onClick={restartDaemon}
              disabled={diagBusy !== null || daemonBusy}
            >
              <RotateCw size={13} /> {daemonBusy ? 'Restarting…' : 'Restart daemon'}
            </button>
          </div>
        </div>
        {daemonOut && (
          <div className="ss-row" style={{ paddingTop: 0 }}>
            <div className="rt-output" ref={daemonRef}>
              <pre className="logs-pre">{terminalNodes(daemonOut)}</pre>
            </div>
          </div>
        )}
      </AccordionSection>

      <AccordionSection id="runtime-settings" title="Runtime settings" defaultOpen>
        <div className="ss-row">
          <div>
            <div className="ss-lbl">Paste images into agents</div>
            <div className="ss-sub">
              Enables <code>clipboard.imagePaste</code>. Relaxes isolation by allowing clipboard access.
            </div>
          </div>
          <button
            className={`s-toggle${imagePaste ? ' on' : ''}`}
            onClick={toggleImagePaste}
            disabled={settingBusy}
          />
        </div>
        {caps.hasEnvFiles && (
        <div className="ss-row">
          <div>
            <div className="ss-lbl">Claude remote control</div>
            <div className="ss-sub">
              Lets Claude Code’s <code>/remote-control</code> work inside a sandbox
              (<code>claude.remoteControl</code>). Off unless you need it.
              {!remoteKnown && <> This sbx didn’t report its current value — the switch shows
              what den will set, not what’s in force.</>}
            </div>
          </div>
          <button
            className={`s-toggle${remoteControl ? ' on' : ''}`}
            onClick={toggleRemoteControl}
            disabled={remoteBusy}
          />
        </div>
        )}
        {caps.hasEnvFiles && (
        <div className="ss-row">
          <div>
            <div className="ss-lbl">Registry mirror</div>
            <div className="ss-sub">
              Resolve template and kit images through your organisation’s mirror instead of
              Docker Hub (<code>platform.images.registryMirror</code>). Leave empty for Hub.
              {!mirrorKnown && !mirrorTouched && <> This sbx didn’t report a current value, so the
              box may look empty even if a mirror is set.</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <input
              className="s-input"
              value={mirror}
              placeholder="mirror.example.com"
              onChange={(e) => { setMirror(e.target.value); setMirrorTouched(true) }}
              style={{ width: 192 }}
            />
            <button className="btn btn-default btn-sm" onClick={saveMirror} disabled={mirrorBusy}>
              {mirrorBusy ? '…' : mirrorSaved === 'ok' ? '✓ Saved' : mirrorSaved === 'fail' ? '✗ Failed' : 'Save'}
            </button>
          </div>
        </div>
        )}
        <div className="ss-row">
          <div>
            <div className="ss-lbl">Filesystem cache (virtiofs)</div>
            <div className="ss-sub">
              Faster filesystem performance (<code>DOCKER_SANDBOXES_ENABLE_VIRTIOFS_CACHE</code>). On by default in
              sbx v0.35.
            </div>
          </div>
          <button
            className={`s-toggle${virtiofsCache ? ' on' : ''}`}
            onClick={toggleVirtiofsCache}
          />
        </div>
        {/* SSH access (sbx v0.37+). Writing ~/.ssh/config is a host-level change,
            so it's an explicit button — never something den does on its own. */}
        <div className="ss-row">
          <div>
            <div className="ss-lbl">SSH access</div>
            <div className="ss-sub">
              Reach sandboxes as <code>&lt;name&gt;.sbx</code> over SSH, and open them in remote-development tools
              like VS Code and Cursor. Writes a managed block to <code>~/.ssh/config</code> — no key needed, but you
              must be signed in to Docker. Which editor “Connect with…” uses is a den preference, under
              General ▸ Files &amp; editors.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            {ssh?.configured && <span className="rt-badge">Configured</span>}
            <button className="btn btn-default btn-sm" onClick={runSshSetup} disabled={sshBusy}>
              {sshBusy ? 'Writing…' : ssh?.configured ? 'Re-run setup' : 'Set up SSH'}
            </button>
          </div>
        </div>
        {ssh && ssh.duplicates > 0 && (
          <div className="ss-row" style={{ paddingTop: 0 }}>
            <div className="rt-cmdhint">
              <strong>{ssh.duplicates + 1} <code>Host *.sbx</code> blocks</strong> found in <code>{ssh.path}</code>.
              ssh uses the first value it finds for each setting, so an older block silently overrides the current
              one — which can drop settings the new block needs (for example <code>IdentityAgent none</code>, without
              which an external SSH agent intercepts the connection). Remove the stale block by hand, then re-run
              setup.
            </div>
          </div>
        )}
        {sshMsg && (
          <div className="ss-row" style={{ paddingTop: 0 }}>
            <div className={`np-banner ${sshMsg.ok ? 'ok' : 'err'}`} style={{ marginTop: 0 }}>
              <span className="np-banner-txt">{sshMsg.text}</span>
            </div>
          </div>
        )}
        <div className="ss-row">
          <div>
            <div className="ss-lbl">Upstream egress proxy</div>
            <div className="ss-sub">
              Chain sandbox egress through an upstream proxy (<code>DOCKER_SANDBOXES_PROXY</code>). Supports{' '}
              <code>http://</code>, <code>https://</code> and <code>socks5://</code> / <code>socks5h://</code>, or{' '}
              <code>system</code> to follow this Mac's own proxy settings — including a PAC auto-config URL
              (sbx v0.37+).
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            {/* One-tap for the common case. Writes the literal `system` into the
                same field rather than a separate setting, so there's one source
                of truth and a custom URL still just overwrites it. */}
            <button
              className={`btn btn-sm ${runtimeProxy.trim() === 'system' ? 'btn-primary' : 'btn-default'}`}
              onClick={() => {
                const next = runtimeProxy.trim() === 'system' ? '' : 'system'
                setRuntimeProxy(next)
                saveRuntimeEnv('runtimeProxy', next)
              }}
              title="Follow the host operating system's proxy configuration"
            >
              System
            </button>
            <input
              className="s-input"
              value={runtimeProxy}
              placeholder="socks5://host:1080"
              onChange={(e) => setRuntimeProxy(e.target.value)}
              onBlur={() => saveRuntimeEnv('runtimeProxy', runtimeProxy.trim())}
              style={{ width: 220 }}
            />
          </div>
        </div>
        <div className="ss-row">
          <div>
            <div className="ss-lbl">Proxy bypass list</div>
            <div className="ss-sub">
              Destinations to exclude from the upstream proxy (<code>DOCKER_SANDBOXES_NO_PROXY</code>), standard
              <code>NO_PROXY</code> matching.
            </div>
          </div>
          <input
            className="s-input"
            value={runtimeNoProxy}
            placeholder="localhost,*.internal"
            onChange={(e) => setRuntimeNoProxy(e.target.value)}
            onBlur={() => saveRuntimeEnv('runtimeNoProxy', runtimeNoProxy.trim())}
            style={{ width: 220 }}
          />
        </div>
        {runtimeEnvDirty && (
          <div className="ss-row" style={{ paddingTop: 0 }}>
            <div className="rt-cmdhint">
              Runtime environment changed. <strong>Restart the daemon</strong> (Diagnostics below) for it to take
              effect.
            </div>
          </div>
        )}
      </AccordionSection>

      <AccordionSection id="runtime-diagnostics" title="Diagnostics" defaultOpen>
        <div className="ss-row">
          <div>
            <div className="ss-lbl">Run diagnostics</div>
            <div className="ss-sub">
              Probe the daemon, VMs and network via <code>sbx diagnose</code> — the first step when
              something isn’t working.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-default btn-sm"
              onClick={() => runDiag('text')}
              disabled={diagBusy !== null || daemonBusy}
            >
              <Stethoscope size={13} /> {diagBusy === 'text' ? 'Running…' : 'Run'}
            </button>
            {diagRan && (
              <>
                <button
                  className="btn btn-default btn-sm"
                  onClick={() => copyDiag('github-issue')}
                  disabled={diagBusy !== null || daemonBusy}
                  title="Copy a pre-formatted report to paste into a bug report"
                >
                  {diagCopied === 'github-issue'
                    ? <><Check size={13} /> Copied</>
                    : <><Bug size={13} /> {diagBusy === 'github-issue' ? 'Preparing…' : 'For bug report'}</>}
                </button>
                <button
                  className="btn btn-default btn-sm"
                  onClick={() => runDiag('upload')}
                  disabled={diagBusy !== null || daemonBusy}
                  title="Uploads a diagnostics bundle to Docker and prints a shareable id"
                >
                  <UploadCloud size={13} /> {diagBusy === 'upload' ? 'Uploading…' : 'Upload'}
                </button>
              </>
            )}
          </div>
        </div>
        {diagOut && (
          <div className="ss-row" style={{ paddingTop: 0 }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <div className="diag-toolbar">
                <button
                  onClick={() => copyDiag('json')}
                  disabled={diagBusy !== null || daemonBusy}
                  title="Copy diagnostics as JSON"
                >
                  {diagCopied === 'json' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <div className="rt-output" ref={diagRef}>
                <pre className="logs-pre">{terminalNodes(diagOut)}</pre>
              </div>
            </div>
          </div>
        )}
        <div className="ss-row">
          <div>
            <div className="ss-lbl">
              API failure traces
              {!!traces?.count && <span className="rt-badge rt-badge-update" style={{ marginLeft: 8 }}>{traces.count}</span>}
            </div>
            <div className="ss-sub">
              {traces?.count
                ? 'Recorded automatically when an agent reports a dropped API connection.'
                : 'None recorded. '}
              den can’t see the connection itself — it’s inside the container — so each trace notes how
              long the request had been running and whether this Mac had just woken or changed network.
              That’s what tells a connection-lifetime cap apart from a whole-path reset.
            </div>
            {traceErr && <div className="ss-sub" style={{ color: 'var(--destruct)' }}>{traceErr}</div>}
          </div>
          <button
            className="btn btn-default btn-sm"
            onClick={async () => {
              const r = await window.minipit?.revealApiTraces?.().catch(() => null)
              // Don't fail silently: if the folder can't be opened, say why.
              setTraceErr(r && !r.ok ? (r.error || 'Could not open the traces folder.') : null)
            }}
            title={traces?.path}
          >
            <Bug size={13} /> {traces?.count ? 'Reveal' : 'Show folder'}
          </button>
        </div>
        <div className="ss-row">
          <div>
            <div className="ss-lbl">Daemon log level</div>
            <div className="ss-sub">
              Verbosity of the daemon log (<code>sbx daemon log-level</code>). Raise to <code>debug</code> when
              gathering diagnostics.
            </div>
          </div>
          <select
            className="s-input"
            style={{ width: 130 }}
            value={logLevel || ''}
            onChange={(e) => changeLogLevel(e.target.value)}
            disabled={logLevelBusy}
          >
            {!logLevel && <option value="">—</option>}
            {['trace', 'debug', 'info', 'warn', 'error'].map((lv) => (
              <option key={lv} value={lv}>{lv}</option>
            ))}
          </select>
        </div>
      </AccordionSection>

      <div className="ss ss-danger">
        <div className="ss-hdr" style={{ color: 'var(--destruct)' }}>Danger zone</div>
        <div className="ss-row">
          <div>
            <div className="ss-lbl">Reset sbx</div>
            <div className="ss-sub">
              Stops all VMs and deletes every sandbox and its contents. This cannot be undone.
            </div>
          </div>
          <label className="ss-sub" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={preserveSecrets} onChange={(e) => setPreserveSecrets(e.target.checked)} />
            Preserve secrets
          </label>
        </div>
        <div className="ss-row" style={{ paddingTop: 0 }}>
          <div>
            <div className="ss-sub">Type <strong>reset</strong> to confirm.</div>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <input
              className="s-input"
              value={resetConfirm}
              placeholder="reset"
              onChange={(e) => setResetConfirm(e.target.value)}
              style={{ width: 110 }}
            />
            <button
              className={`btn btn-sm ${canReset ? '' : 'btn-default'}`}
              onClick={handleReset}
              disabled={resetBusy || !canReset}
              style={canReset ? { background: 'var(--destruct)', color: '#fff', borderColor: 'var(--destruct)' } : undefined}
            >
              {resetBusy ? 'Resetting…' : 'Reset everything'}
            </button>
          </div>
        </div>
        {resetMsg && (
          <div className="ss-row" style={{ paddingTop: 0 }}>
            <div className="ss-sub" style={{ color: resetMsg.ok ? 'var(--ok, inherit)' : 'var(--destruct)' }}>
              {resetMsg.text}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
