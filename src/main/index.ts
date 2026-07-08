import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  shell,
  nativeImage,
  dialog,
  session,
  powerSaveBlocker
} from 'electron'
import { join } from 'path'
import http from 'http'
import { randomBytes, createHash } from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { execFile, spawn } from 'child_process'
import Store from 'electron-store'
// node-pty 1.x compiles to CJS with `__esModule: true` but no `default` export,
// so a default import resolves to `undefined` under esbuild's interop (crashing
// `pty.spawn`). Import the namespace instead.
import * as pty from 'node-pty'

// Name the app early (before whenReady) so menus, the About panel and the dock
// label read "den" instead of "Electron" in dev. Packaged builds use productName.
app.setName('den')

const store = new Store()

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let logTail: ReturnType<typeof spawn> | null = null

// Map of sandbox name → running `sbx run` PTY (agent session)
const sbxProcesses = new Map<string, ReturnType<typeof pty.spawn>>()
// Map of sandbox name → PTY (shell tab)
const ptyMap = new Map<string, ReturnType<typeof pty.spawn>>()
// Track uptime start times
const uptimeMap = new Map<string, number>()

function getSbxPath(): string {
  const stored = store.get('sbxPath') as string | undefined
  if (stored) return stored
  const candidates = ['/opt/homebrew/bin/sbx', '/usr/local/bin/sbx', '/usr/bin/sbx']
  const fs = require('fs')
  return (
    candidates.find((p) => {
      try {
        fs.accessSync(p)
        return true
      } catch {
        return false
      }
    }) ?? 'sbx'
  )
}

// GUI apps don't inherit the shell PATH, so resolve brew by its known prefixes.
function getBrewPath(): string {
  const candidates = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']
  const fs = require('fs')
  return (
    candidates.find((p) => {
      try {
        fs.accessSync(p)
        return true
      } catch {
        return false
      }
    }) ?? 'brew'
  )
}

// GUI-launched apps on macOS inherit a stripped PATH that omits the brew
// prefixes, so spawned tools (sbx, and the docker credential helpers ORAS
// execs during `kit push`) can't be found. Augment PATH for every host spawn.
function guiEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin` }
}

// Run an sbx command through a pty and stream its output via `send`. sbx (like
// most CLIs) only emits ANSI *colour* when it detects a real terminal, so
// piping via spawn() gives colourless output. A pty makes it believe it's on a
// colour terminal. Resolves with the collected output + exit code.
function ptyRun(
  args: string[],
  send: (chunk: string) => void,
  timeoutMs: number
): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const proc = pty.spawn(getSbxPath(), args, {
      name: 'xterm-256color',
      cols: 100,
      rows: 50,
      cwd: process.env.HOME ?? '/',
      env: { ...guiEnv(), TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>
    })
    let buf = ''
    const timer = setTimeout(() => {
      try { proc.kill() } catch { /* already gone */ }
      reject(new Error('sbx timed out'))
    }, timeoutMs)
    proc.onData((d) => { buf += d; send(d) })
    proc.onExit(({ exitCode }) => { clearTimeout(timer); resolve({ code: exitCode, output: buf }) })
  })
}

// Only hand web/mail URLs to the OS. Renderer- or agent-influenced links must
// never reach shell.openExternal with a file://, custom-scheme, or other URL
// that could trigger an unexpected OS handler.
const SAFE_EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'mailto:'])
function openExternalSafe(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    console.warn('openExternal: not a parseable URL, dropped:', url)
    return
  }
  if (!SAFE_EXTERNAL_SCHEMES.has(parsed.protocol)) {
    console.warn('blocked openExternal for disallowed scheme:', url)
    return
  }
  shell.openExternal(url).catch((e) => console.error('openExternal failed for', url, e))
}

// Community kit gallery source (browsed live, imported via git). sbx consumes a
// kit from here with `--kit "git+https://github.com/<repo>.git#dir=<name>"`.
const CONTRIB_REPO = 'docker/sbx-kits-contrib'
const CONTRIB_BRANCH = 'main'

// Kit artifacts live in the app's own data folder (not the user's home). On
// first use we migrate any kits authored under the legacy ~/minipit-kits path.
let kitsRootCache = ''
function kitsRoot(): string {
  if (kitsRootCache) return kitsRootCache
  const fs = require('fs')
  const root = join(app.getPath('userData'), 'kits')
  fs.mkdirSync(root, { recursive: true })
  const legacy = join(app.getPath('home'), 'minipit-kits')
  try {
    if (fs.existsSync(legacy)) {
      for (const entry of fs.readdirSync(legacy)) {
        const from = join(legacy, entry)
        const to = join(root, entry)
        if (!fs.existsSync(to)) { try { fs.renameSync(from, to) } catch { /* cross-device or busy */ } }
      }
    }
  } catch (e) { console.error('kit migration failed:', e) }
  kitsRootCache = root
  return root
}

// sbx has no "which kits are on this sandbox" query, so track it locally.
function recordKits(sandbox: string, kitDirs: string[]): void {
  if (!sandbox || !kitDirs?.length) return
  const path = require('path')
  const map = (store.get('appliedKits') as Record<string, string[]>) ?? {}
  const names = kitDirs.map((d) => path.basename(d))
  map[sandbox] = Array.from(new Set([...(map[sandbox] ?? []), ...names]))
  store.set('appliedKits', map)
}

// Record whether a sandbox isolates its working tree (`--clone`) or mounts the
// host folder directly. sbx doesn't report this back, so we track it locally to
// warn when several direct-mount sandboxes share one folder.
function recordIsolation(sandbox: string, isolated: boolean): void {
  if (!sandbox) return
  const map = (store.get('sandboxIsolation') as Record<string, boolean>) ?? {}
  map[sandbox] = isolated
  store.set('sandboxIsolation', map)
}
function forgetIsolation(sandbox: string): void {
  const map = (store.get('sandboxIsolation') as Record<string, boolean>) ?? {}
  if (sandbox in map) { delete map[sandbox]; store.set('sandboxIsolation', map) }
}

const SBX_RELEASES_URL = 'https://github.com/docker/sbx-releases/releases/latest'
type InstallManager = 'brew' | 'winget' | 'apt' | 'manual'

// Detect how the sbx binary was installed so updates use the right tool
// (instead of forcing Homebrew). Resolves symlinks to inspect the real path.
async function detectInstallManager(): Promise<{ manager: InstallManager; real: string }> {
  const fs = require('fs')
  const p = getSbxPath()
  let real = p
  try { real = fs.realpathSync(p) } catch { /* keep p */ }
  if (process.platform === 'darwin') {
    return { manager: /\/(Caskroom|Cellar)\//.test(real) ? 'brew' : 'manual', real }
  }
  if (process.platform === 'win32') {
    return { manager: /(WindowsApps|\\Packages\\|WinGet)/i.test(real) ? 'winget' : 'manual', real }
  }
  if (process.platform === 'linux') {
    const owned = await new Promise<boolean>((res) =>
      execFile('dpkg', ['-S', real], { timeout: 5000 }, (err) => res(!err)))
    return { manager: owned ? 'apt' : 'manual', real }
  }
  return { manager: 'manual', real }
}

// The package-manager command to update/redownload sbx, per manager.
function pkgCommand(manager: InstallManager, action: 'update' | 'redownload'): { bin: string; args: string[] } | null {
  switch (manager) {
    case 'brew':
      return { bin: getBrewPath(), args: action === 'redownload' ? ['reinstall', '--cask', 'docker/tap/sbx'] : ['upgrade', '--cask', 'docker/tap/sbx'] }
    case 'winget':
      return { bin: 'winget', args: action === 'redownload' ? ['install', '--id', 'Docker.sbx', '-e', '--force'] : ['upgrade', '--id', 'Docker.sbx', '-e'] }
    case 'apt':
      return { bin: 'sudo', args: action === 'redownload' ? ['apt-get', 'install', '--reinstall', '-y', 'docker-sbx'] : ['apt-get', 'install', '--only-upgrade', '-y', 'docker-sbx'] }
    default:
      return null
  }
}

// Human-readable command for display/copy (brew shown by name, not full path).
function displayCommand(manager: InstallManager, action: 'update' | 'redownload'): string {
  const c = pkgCommand(manager, action)
  if (!c) return ''
  const bin = manager === 'brew' ? 'brew' : c.bin
  return `${bin} ${c.args.join(' ')}`
}

// Parse the column-aligned `sbx policy ls` table into structured rules.
// Resources span multiple lines (continuation rows have a blank PROVENANCE).
function parsePolicyLs(out: string) {
  const lines = out.split('\n')
  let governance: string | null = null
  let sync: string | null = null
  const headerIdx = lines.findIndex((l) => l.includes('PROVENANCE') && l.includes('RESOURCES'))

  for (let i = 0; i < (headerIdx === -1 ? lines.length : headerIdx); i++) {
    const l = lines[i]
    if (l.startsWith('Governance')) governance = l.replace('Governance', '').trim()
    else if (l.startsWith('Sync')) sync = l.replace('Sync', '').trim()
  }

  const rules: Array<{
    provenance: string; appliesTo: string; rule: string; type: string; decision: string; resources: string[]
  }> = []
  if (headerIdx === -1) return { governance, sync, rules }

  const h = lines[headerIdx]
  const cProv = h.indexOf('PROVENANCE')
  const cApplies = h.indexOf('APPLIES_TO')
  const cRule = h.indexOf('POLICY/RULE')
  const cType = h.indexOf('TYPE')
  const cDec = h.indexOf('DECISION')
  const cRes = h.indexOf('RESOURCES')

  let cur: (typeof rules)[number] | null = null
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const l = lines[i]
    if (!l.trim()) continue
    const prov = l.slice(cProv, cApplies).trim()
    const res = l.slice(cRes).trim()
    if (prov) {
      cur = {
        provenance: prov,
        appliesTo: l.slice(cApplies, cRule).trim(),
        rule: l.slice(cRule, cType).trim(),
        type: l.slice(cType, cDec).trim(),
        decision: l.slice(cDec, cRes).trim(),
        resources: res ? [res] : []
      }
      rules.push(cur)
    } else if (cur && res) {
      cur.resources.push(res)
    }
  }
  return { governance, sync, rules }
}

function sbx(args: string[], opts?: { timeout?: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(getSbxPath(), args, { timeout: opts?.timeout ?? 10000, env: guiEnv() }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout.trim())
    })
  })
}

interface SbxSandbox {
  name: string
  agent: string
  status: string
  socket_path?: string
  workspaces?: string[]
  ports?: RawPort[]
}

// sbx isn't consistent about port field names across commands (`sbx ls` vs
// `sbx ports`) or types (number vs string), so coerce defensively.
type RawPort = Record<string, unknown>

function toPortNum(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return parseInt(v, 10)
  return NaN
}

// Look up a field by any of several possible key names, case-insensitively —
// `sbx ls` and `sbx ports` disagree on casing/naming across versions.
function pickField(p: RawPort, keys: string[]): unknown {
  const lower: Record<string, unknown> = {}
  for (const k of Object.keys(p)) lower[k.toLowerCase()] = p[k]
  for (const k of keys) {
    const v = lower[k.toLowerCase()]
    if (v !== undefined && v !== null) return v
  }
  return undefined
}

function normalizePorts(ports?: RawPort[]) {
  const mapped = (ports ?? [])
    .map((p) => ({
      host: toPortNum(pickField(p, ['host_port', 'host', 'hostport', 'published_port', 'public_port'])),
      container: toPortNum(pickField(p, ['sandbox_port', 'sandbox', 'container_port', 'container', 'target_port', 'port'])),
      protocol: String(pickField(p, ['protocol', 'proto']) ?? 'tcp').toUpperCase(),
      hostIp: String(pickField(p, ['host_ip', 'hostip', 'ip', 'address']) ?? ''),
      active: true
    }))
    .filter((p) => !Number.isNaN(p.host) && !Number.isNaN(p.container))
  // A single published port is reported once per host binding address (IPv4
  // 127.0.0.1 and IPv6 ::1), which we don't surface — collapse to one row per
  // host:container/protocol so the panel doesn't show every port twice.
  const seen = new Set<string>()
  return mapped.filter((p) => {
    const key = `${p.host}:${p.container}/${p.protocol}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// `sbx ports --json` may return a bare array, a `{ ports: [...] }` wrapper, or
// an object keyed by sandbox name — pull the port array out of any of them.
function extractPortArray(data: unknown, name: string): RawPort[] {
  if (Array.isArray(data)) return data as RawPort[]
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    for (const key of ['ports', 'published', 'mappings', 'portMappings']) {
      if (Array.isArray(o[key])) return o[key] as RawPort[]
    }
    const byName = o[name] as { ports?: unknown } | unknown[] | undefined
    if (Array.isArray(byName)) return byName as RawPort[]
    if (byName && typeof byName === 'object' && Array.isArray((byName as { ports?: unknown }).ports)) {
      return (byName as { ports: RawPort[] }).ports
    }
    // Last resort: the first array-of-objects value on the object.
    for (const v of Object.values(o)) {
      if (Array.isArray(v) && v.every((x) => x && typeof x === 'object')) return v as RawPort[]
    }
  }
  return []
}

function normalizeSandbox(raw: SbxSandbox) {
  const startTime = uptimeMap.get(raw.name)
  const uptimeSeconds =
    raw.status === 'running' && startTime ? Math.floor((Date.now() - startTime) / 1000) : undefined

  // If sandbox just became running and we don't have a start time, record now
  if (raw.status === 'running' && !startTime) {
    uptimeMap.set(raw.name, Date.now())
  }
  if (raw.status !== 'running') {
    uptimeMap.delete(raw.name)
  }

  return {
    id: raw.name,
    name: raw.name,
    status: raw.status,
    agent: raw.agent ?? 'claude',
    workspace: raw.workspaces?.[0] ?? '~',
    uptimeSeconds,
    ports: normalizePorts(raw.ports),
    logs: [] as unknown[]
  }
}

// Keep the machine awake while any sandbox is running (opt-in via the
// `keepAwake` setting, default on) so long agent runs aren't interrupted by
// system sleep. Re-evaluated whenever the sandbox list is refreshed.
let powerBlockerId = -1
let lastRunningCount = 0
function updatePowerBlocker(runningCount: number): void {
  lastRunningCount = runningCount
  const enabled = (store.get('keepAwake') as boolean | undefined) ?? true
  const shouldBlock = enabled && runningCount > 0
  const active = powerBlockerId !== -1 && powerSaveBlocker.isStarted(powerBlockerId)
  try {
    if (shouldBlock && !active) {
      powerBlockerId = powerSaveBlocker.start('prevent-app-suspension')
    } else if (!shouldBlock && active) {
      powerSaveBlocker.stop(powerBlockerId)
      powerBlockerId = -1
    }
  } catch (e) { console.error('powerSaveBlocker:', e) }
}

// Last successful sandbox list. `sbx ls` can fail transiently (Docker daemon
// momentarily busy, a cold-start timeout), and since we poll every 5s a single
// failed tick must not wipe every sandbox from the UI/tray and reset the power
// blocker. On error we return the last good list; the next successful poll
// reconciles. Stays null until the first success so a genuine cold start
// (nothing yet fetched) still reports empty rather than fabricating entries.
let lastGoodSandboxes: ReturnType<typeof normalizeSandbox>[] | null = null

async function listSandboxes() {
  try {
    const out = await sbx(['ls', '--json'])
    const parsed = JSON.parse(out)
    const sandboxes: SbxSandbox[] = parsed.sandboxes ?? parsed
    const list = sandboxes.map(normalizeSandbox)
    updatePowerBlocker(list.filter((s) => s.status === 'running').length)
    lastGoodSandboxes = list
    return list
  } catch (err) {
    console.error('sbx ls failed:', err)
    return lastGoodSandboxes ?? []
  }
}

async function getPortsForSandbox(name: string) {
  try {
    const out = await sbx(['ports', name, '--json'])
    const trimmed = out.trim()
    const ports = normalizePorts(extractPortArray(JSON.parse(trimmed), name))
    // If sbx returned data but we parsed nothing, the shape/field names have
    // drifted again — log the raw output so it's diagnosable.
    if (ports.length === 0 && trimmed && trimmed !== '[]' && trimmed !== '{}') {
      console.error('get-ports: parsed 0 ports from non-empty sbx output:', trimmed.slice(0, 500))
    }
    return ports
  } catch (err) {
    console.error('get-ports failed:', err)
    return []
  }
}

// Like sbx() but pipes `input` to the child's stdin (for `secret set`).
function sbxWithInput(args: string[], input: string, timeout = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getSbxPath(), args, { timeout, env: guiEnv() })
    let out = ''
    let err = ''
    proc.stdout?.on('data', (d) => (out += d))
    proc.stderr?.on('data', (d) => (err += d))
    proc.on('error', reject)
    proc.on('close', (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || out.trim() || `exit ${code}`))
    )
    proc.stdin?.write(input)
    proc.stdin?.end()
  })
}

// The 1Password CLI (`op`). Used to resolve `op://…` secret references so the
// real value never has to be pasted into den.
function getOpPath(): string {
  const fs = require('fs')
  const candidates = ['/opt/homebrew/bin/op', '/usr/local/bin/op', '/usr/bin/op']
  return candidates.find((p) => { try { return fs.existsSync(p) } catch { return false } }) ?? 'op'
}
function opAvailable(): boolean {
  const fs = require('fs')
  return ['/opt/homebrew/bin/op', '/usr/local/bin/op', '/usr/bin/op'].some((p) => {
    try { return fs.existsSync(p) } catch { return false }
  })
}
// Resolve a single `op://Vault/Item/field` reference to its value via `op read`.
function opRead(ref: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(getOpPath(), ['read', ref], { timeout: 30000, env: guiEnv() }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim() || 'op read failed'))
      else resolve(stdout.replace(/\r?\n+$/, ''))
    })
  })
}

interface StoredSecret {
  scope: string
  type: string
  name: string
  masked: string
}

// ── Anthropic OAuth ──────────────────────────────────────────────────────────
// ⚠️ UNOFFICIAL: these are the publicly-known Claude Code OAuth parameters.
// They are not documented by Anthropic, may change without notice, and using
// them outside Claude Code may violate Anthropic's terms. Adjust here if wrong.
const ANTHROPIC_OAUTH = {
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  authorizeUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
  scopes: 'org:create_api_key user:profile user:inference',
  redirectPort: 54545,
  redirectPath: '/callback'
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

// Runs the full OAuth dance: open browser → capture code on a loopback server →
// exchange for a token → store it as the global `anthropic` sbx secret.
function anthropicOAuth(): Promise<{ ok: true }> {
  return new Promise((resolve, reject) => {
    const { verifier, challenge } = pkce()
    const state = randomBytes(16).toString('hex')
    const redirectUri = `http://localhost:${ANTHROPIC_OAUTH.redirectPort}${ANTHROPIC_OAUTH.redirectPath}`

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', redirectUri)
        const code = url.searchParams.get('code')
        const rState = url.searchParams.get('state')
        if (!code) { res.writeHead(400); res.end('Missing authorization code'); return }
        // Require the state param to be present *and* match — a missing state
        // must not pass (CSRF guard); PKCE still protects the code exchange.
        if (rState !== state) { res.writeHead(400); res.end('State mismatch'); return }
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<body style="font-family:sans-serif;padding:40px"><h2>✓ Connected. You can close this tab and return to den.</h2></body>')
        server.close()

        const resp = await fetch(ANTHROPIC_OAUTH.tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            code, state,
            client_id: ANTHROPIC_OAUTH.clientId,
            redirect_uri: redirectUri,
            code_verifier: verifier
          })
        })
        if (!resp.ok) throw new Error(`token exchange failed: ${resp.status} ${await resp.text()}`)
        const data = (await resp.json()) as { access_token?: string }
        if (!data.access_token) throw new Error('no access_token in token response')
        // Store via stdin so the token never appears in argv / shell history.
        await sbxWithInput(['secret', 'set', '-g', 'anthropic'], data.access_token + '\n')
        resolve({ ok: true })
      } catch (err) {
        reject(err)
      }
    })

    server.on('error', reject)
    server.listen(ANTHROPIC_OAUTH.redirectPort, '127.0.0.1', () => {
      const authUrl = `${ANTHROPIC_OAUTH.authorizeUrl}?` + new URLSearchParams({
        response_type: 'code',
        client_id: ANTHROPIC_OAUTH.clientId,
        redirect_uri: redirectUri,
        scope: ANTHROPIC_OAUTH.scopes,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state
      }).toString()
      openExternalSafe(authUrl)
    })

    setTimeout(() => {
      try { server.close() } catch { /* ignore */ }
      reject(new Error('OAuth timed out (no response within 3 minutes)'))
    }, 180000)
  })
}

// Translate a scope value from the renderer into `sbx secret set/rm` args:
// global → ['-g']; anything else is a sandbox name passed positionally.
function secretScopeArgs(scope?: string): string[] {
  return !scope || scope === '(global)' ? ['-g'] : [scope]
}

// Parse the `sbx secret ls` table (columns separated by 2+ spaces). No `-g`, so
// this lists every scope — global plus per-sandbox secrets.
async function listSecrets(): Promise<StoredSecret[]> {
  try {
    const out = await sbx(['secret', 'ls'])
    const lines = out.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim())
    if (!lines.length || /no secrets/i.test(lines[0])) return []
    // Drop the header row (SCOPE TYPE NAME SECRET).
    return lines
      .slice(1)
      .map((line) => {
        const [scope, type, name, masked] = line.split(/\s{2,}/)
        return { scope, type, name, masked: masked ?? '' }
      })
      .filter((r) => r.name)
  } catch {
    return []
  }
}

async function listTemplates() {
  try {
    const out = await sbx(['template', 'ls', '--json'])
    const data = JSON.parse(out)
    return (data.images ?? []).map(
      (img: { id: string; repository: string; tag: string; flavor: string; created_at: string }) => ({
        id: img.id,
        repository: img.repository,
        tag: img.tag,
        flavor: img.flavor,
        createdAt: img.created_at
      })
    )
  } catch (err) {
    console.error('sbx template ls failed:', err)
    return []
  }
}

// Authored kits under <userData>/kits/<name>/ (spec.yaml). `kind` distinguishes
// mixin kits from sandbox kits. Shared by the list-kits IPC and the app menu.
function listKits(): { name: string; kind: string; dir: string; hasZip: boolean }[] {
  const fs = require('fs')
  const base = kitsRoot()
  try {
    return (fs.readdirSync(base, { withFileTypes: true }) as { name: string; isDirectory: () => boolean }[])
      .filter((d) => d.isDirectory())
      .map((d) => {
        const dir = join(base, d.name)
        let kind = 'mixin'
        try {
          const spec = fs.readFileSync(join(dir, 'spec.yaml'), 'utf8') as string
          const m = spec.match(/kind:\s*(\w+)/)
          // sbx spells full-agent kits `agent`; den's library splits kits into
          // `mixin` vs `sandbox`, so treat `agent` as a sandbox kit for display.
          if (m) kind = m[1] === 'agent' ? 'sandbox' : m[1]
        } catch {
          return null
        }
        return { name: d.name, kind, dir, hasZip: fs.existsSync(join(base, `${d.name}.zip`)) }
      })
      .filter(Boolean) as { name: string; kind: string; dir: string; hasZip: boolean }[]
  } catch {
    return []
  }
}

// Parse a human-readable size like "1.2 GB", "512MB", "1.5GiB", "900 kB" into
// bytes. Returns null if it doesn't look like a size.
function parseHumanSize(s: string): number | null {
  const m = s.trim().match(/^([\d.]+)\s*([kKmMgGtT]?)i?[bB]?$/)
  if (!m) return null
  const n = parseFloat(m[1])
  if (!isFinite(n)) return null
  const mult: Record<string, number> = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3, t: 1024 ** 4 }
  return Math.round(n * (mult[m[2].toLowerCase()] ?? 1))
}

// Pull a byte count out of an sbx JSON object, tolerating both numeric-byte and
// human-readable size fields (sbx's exact key isn't guaranteed across versions).
function pickBytes(o: Record<string, unknown>): number | null {
  for (const k of ['size_bytes', 'sizeBytes', 'disk_usage', 'diskUsage', 'disk_bytes', 'size', 'disk']) {
    const v = o?.[k]
    if (typeof v === 'number' && isFinite(v)) return v
    if (typeof v === 'string') { const n = parseHumanSize(v); if (n != null) return n }
  }
  return null
}

interface StorageSection { count: number; bytes: number | null }

// sbx is Docker-backed, so query Docker's own accounting for real byte counts —
// `sbx ls`/`template ls` JSON don't carry sizes. Maps Docker's categories onto
// our two buckets: images → templates, containers + local volumes → sandboxes.
function dockerDf(): Promise<{ images: number | null; containers: number | null }> {
  return new Promise((resolve) => {
    execFile(
      'docker', ['system', 'df', '--format', '{{json .}}'],
      { timeout: 15000, env: guiEnv() },
      (err, stdout) => {
        if (err) return resolve({ images: null, containers: null })
        let images: number | null = null
        let containers: number | null = null
        for (const line of stdout.trim().split('\n')) {
          try {
            const row = JSON.parse(line) as { Type?: string; Size?: string }
            const bytes = row.Size ? parseHumanSize(row.Size) : null
            if (bytes == null) continue
            if (row.Type === 'Images') images = (images ?? 0) + bytes
            else if (row.Type === 'Containers' || row.Type === 'Local Volumes') containers = (containers ?? 0) + bytes
          } catch { /* skip the occasional non-JSON line */ }
        }
        resolve({ images, containers })
      }
    )
  })
}

// Aggregate disk usage for sandboxes and templates. Counts come from sbx; byte
// sizes come from sbx when it reports them, else from Docker (the backing store).
// `bytes` stays null only when neither source has a number, so the UI never
// invents one.
async function storageUsage(): Promise<{ ok: boolean; sandboxes: StorageSection; templates: StorageSection; error?: string }> {
  const sumSection = (list: Array<Record<string, unknown>>): StorageSection => {
    let bytes = 0, known = false
    for (const o of list) { const b = pickBytes(o); if (b != null) { bytes += b; known = true } }
    return { count: list.length, bytes: known ? bytes : null }
  }
  try {
    let sandboxes: StorageSection = { count: 0, bytes: null }
    let templates: StorageSection = { count: 0, bytes: null }
    try {
      const data = JSON.parse(await sbx(['ls', '--json'], { timeout: 12000 }))
      sandboxes = sumSection(data.sandboxes ?? data ?? [])
    } catch (e) { console.error('storage: sbx ls failed:', e) }
    try {
      const data = JSON.parse(await sbx(['template', 'ls', '--json'], { timeout: 12000 }))
      templates = sumSection(data.images ?? [])
    } catch (e) { console.error('storage: sbx template ls failed:', e) }
    // Fill any missing sizes from Docker's disk accounting.
    if (sandboxes.bytes == null || templates.bytes == null) {
      const df = await dockerDf()
      if (sandboxes.bytes == null) sandboxes.bytes = df.containers
      if (templates.bytes == null) templates.bytes = df.images
    }
    return { ok: true, sandboxes, templates }
  } catch (err) {
    return { ok: false, sandboxes: { count: 0, bytes: null }, templates: { count: 0, bytes: null }, error: (err instanceof Error ? err.message : String(err)).trim() }
  }
}

// ── Network-policy block events ──────────────────────────────────────────────
// A single "an agent's request was denied" event, surfaced so the user can
// allow the host in one click. Detected two ways: polling `sbx policy log`
// (canonical) and scanning agent output for the proxy's 403 marker (instant).
interface PolicyBlock {
  sandbox: string
  host: string
  rule?: string
  reason?: string
  at: number          // epoch ms when observed
  source: 'log' | 'output'
}

// Keys we've already pushed to the renderer, so polling doesn't re-emit the
// same entry every tick. A re-block updates last-seen → new key → re-emitted.
const emittedBlocks = new Set<string>()
const blockKey = (b: PolicyBlock): string => `${b.sandbox}|${b.host}|${b.at}`

function emitBlock(b: PolicyBlock): void {
  const k = blockKey(b)
  if (emittedBlocks.has(k)) return
  emittedBlocks.add(k)
  if (emittedBlocks.size > 500) emittedBlocks.delete(emittedBlocks.values().next().value as string)
  mainWindow?.webContents.send('minipit:policy-block', b)
}

// Best-effort parse of `sbx policy log --json`. The exact schema isn't pinned
// across sbx versions, so tolerate several field names and both array/object
// envelopes. Returns only denials.
function parsePolicyLogJson(raw: string, fallbackSandbox?: string): PolicyBlock[] {
  let data: unknown
  try { data = JSON.parse(raw) } catch { return [] }
  const env = data as { entries?: unknown; log?: unknown; events?: unknown }
  const rows = (Array.isArray(data) ? data : env?.entries ?? env?.log ?? env?.events ?? []) as Array<Record<string, unknown>>
  const pick = (o: Record<string, unknown>, keys: string[]): string | undefined => {
    for (const k of keys) { const v = o[k]; if (typeof v === 'string' && v.trim()) return v.trim() }
    return undefined
  }
  const out: PolicyBlock[] = []
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue
    const decision = pick(r, ['decision', 'action', 'verdict'])?.toLowerCase()
    if (decision && !/deny|denied|block/.test(decision)) continue   // skip allows
    const host = pick(r, ['host', 'domain', 'hostname', 'target'])
    if (!host) continue
    const tsStr = pick(r, ['last_seen', 'lastSeen', 'timestamp', 'time', 'at', 'seen_at'])
    const ts = tsStr ? Date.parse(tsStr) : NaN
    out.push({
      sandbox: pick(r, ['sandbox', 'sandbox_name', 'sandboxName']) ?? fallbackSandbox ?? '',
      host,
      rule: pick(r, ['rule', 'rule_name', 'ruleName']),
      reason: pick(r, ['reason', 'detail', 'message']),
      at: isFinite(ts) ? ts : Date.now(),
      source: 'log'
    })
  }
  return out
}

function fetchPolicyLog(name?: string): Promise<PolicyBlock[]> {
  const args = ['policy', 'log', '--json']
  if (name) args.push('--sandbox', name)
  return sbx(args, { timeout: 12000 })
    .then((out) => parsePolicyLogJson(out, name))
    .catch(() => [])
}

// Rolling tail of agent output per sandbox, so a block marker split across PTY
// chunks still matches. The proxy prints: "Blocked by network policy: domain <host>".
const blockScanBuf = new Map<string, string>()
const BLOCK_RE = /Blocked by network policy:\s*domain\s+([^\s,]+)/gi

function scanOutputForBlocks(name: string, data: string): void {
  const stripped = data.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')   // drop ANSI
  const buf = (blockScanBuf.get(name) ?? '') + stripped
  let m: RegExpExecArray | null
  BLOCK_RE.lastIndex = 0
  while ((m = BLOCK_RE.exec(buf)) !== null) {
    emitBlock({ sandbox: name, host: m[1], at: Date.now(), source: 'output' })
  }
  // Keep only the tail so the buffer can't grow unbounded.
  blockScanBuf.set(name, buf.slice(-2048))
}

// ── Agent activity & file changes (Claude Code hooks) ────────────────────────
// Rather than guess turn boundaries from the PTY stream, we install Claude Code
// hooks inside the sandbox that append each event as JSON to ~/.den/events.jsonl,
// then tail that file. `Stop` = finished (waiting); `UserPromptSubmit`/`PreToolUse`
// = working; `PostToolUse` on a file tool = the workspace changed → refresh.
// `SessionStart` (startup/resume/clear) = a session (re)started idle at the
// prompt, so reset any stale `working` — `Stop` doesn't fire when a turn is
// interrupted or the CLI is relaunched (the "Welcome back!" screen), which
// otherwise leaves the sidebar stuck on "Working…".
type AgentState = 'working' | 'waiting'
const agentState = new Map<string, AgentState>()
const eventTails = new Map<string, ReturnType<typeof spawn>>()

const DEN_HOOKS = {
  hooks: {
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'cat >> ~/.den/events.jsonl' }] }],
    PreToolUse: [{ hooks: [{ type: 'command', command: 'cat >> ~/.den/events.jsonl' }] }],
    PostToolUse: [{ hooks: [{ type: 'command', command: 'cat >> ~/.den/events.jsonl' }] }],
    // Notification fires when the agent needs the user — a permission prompt, an
    // asked question, or the idle "waiting for input" reminder. Distinct from
    // Stop (turn finished) so we can play a different cue.
    Notification: [{ hooks: [{ type: 'command', command: 'cat >> ~/.den/events.jsonl' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'cat >> ~/.den/events.jsonl' }] }],
    SessionStart: [{ hooks: [{ type: 'command', command: 'cat >> ~/.den/events.jsonl' }] }]
  }
}
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

function setAgentState(name: string, state: AgentState): void {
  if (agentState.get(name) === state) return
  agentState.set(name, state)
  hookLog(`${name} state → ${state}`)
  mainWindow?.webContents.send('minipit:agent-activity', name, state)
}

// Dev-only trace for verifying the Claude Code hook pipeline. Logs to the den
// console (the terminal running `npm run dev`); silent in packaged builds.
function hookLog(...args: unknown[]): void {
  if (!app.isPackaged) console.log('[den:hooks]', ...args)
}

// Install the hook config and prime the event file inside the (den-managed)
// sandbox. Merges into ~/.claude/settings.json via the user's jq if present,
// else writes our config directly.
// Retries for sbx-exec calls made right after `sbx run`: the sandbox needs a
// moment before `exec` works, so the first attempts can fail with a transient
// error. Back off and retry rather than silently giving up on the session.
const EXEC_RETRIES = 5
const EXEC_RETRY_MS = 1000

function injectClaudeHooks(name: string, attempt = 0): void {
  const cfg = JSON.stringify(DEN_HOOKS)
  // Write den_hooks to a real file and merge two plain files with jq. Process
  // substitution (`<(…)`) is bash-only and the sandbox's /bin/sh is dash, so
  // `sh -c` would fail with "Syntax error: ( unexpected" and never install the hooks.
  const script =
    'mkdir -p ~/.claude ~/.den && touch ~/.den/events.jsonl && ' +
    `den_hooks='${cfg.replace(/'/g, `'\\''`)}' && ` +
    'printf %s "$den_hooks" > ~/.den/hooks.json && ' +
    'if command -v jq >/dev/null 2>&1 && [ -s ~/.claude/settings.json ]; then ' +
    '  jq -s ".[0] * .[1]" ~/.claude/settings.json ~/.den/hooks.json > ~/.claude/settings.json.tmp ' +
    '  && mv ~/.claude/settings.json.tmp ~/.claude/settings.json && echo merged; ' +
    'else cp ~/.den/hooks.json ~/.claude/settings.json && echo wrote; fi'
  execFile(getSbxPath(), ['exec', name, 'sh', '-c', script], { timeout: 8000 }, (err, stdout) => {
    if (err) {
      if (attempt < EXEC_RETRIES) {
        hookLog(`inject retry ${attempt + 1}/${EXEC_RETRIES} for ${name}: ${err.message}`)
        setTimeout(() => injectClaudeHooks(name, attempt + 1), EXEC_RETRY_MS)
        return
      }
      hookLog(`inject FAILED for ${name}:`, err.message); console.error(`hook inject failed for ${name}:`, err.message)
    }
    else hookLog(`injected into ${name} (${stdout.trim() || 'ok'}) → ~/.claude/settings.json`)
  })
}

// Tail the in-container event file and route hook events to the renderer.
function startEventTail(name: string, attempt = 0): void {
  eventTails.get(name)?.kill()
  const proc = spawn(getSbxPath(), ['exec', name, 'sh', '-c', 'touch ~/.den/events.jsonl; exec tail -n0 -F ~/.den/events.jsonl'])
  eventTails.set(name, proc)
  hookLog(`tailing events for ${name}`)
  let buf = ''
  proc.stdout?.on('data', (d) => {
    buf += d.toString()
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      let ev: { hook_event_name?: string; tool_name?: string; source?: string }
      try { ev = JSON.parse(line) } catch { hookLog(`${name} unparsable line:`, line.slice(0, 120)); continue }
      hookLog(`${name} ▸`, ev.hook_event_name, ev.tool_name ?? '')
      switch (ev.hook_event_name) {
        case 'Notification':
          // The agent is blocked waiting for the user (question/permission/idle).
          // Send the attention cue *before* flipping state so the renderer can
          // play the "needs input" sound instead of the finish sound for this
          // transition.
          mainWindow?.webContents.send('minipit:agent-attention', name)
          setAgentState(name, 'waiting')
          break
        case 'Stop':
          setAgentState(name, 'waiting')
          break
        case 'SessionStart':
          // A session started, resumed, or was cleared → the agent is idle at
          // the prompt, so clear any stale `working` left by a turn that never
          // emitted `Stop` (interrupt, crash, CLI relaunch). Skip `compact`,
          // which fires *mid-turn* right after context compaction.
          if (ev.source !== 'compact') setAgentState(name, 'waiting')
          break
        case 'UserPromptSubmit':
        case 'PreToolUse':
          setAgentState(name, 'working')
          break
        case 'PostToolUse':
          setAgentState(name, 'working')
          if (ev.tool_name && FILE_TOOLS.has(ev.tool_name)) {
            hookLog(`${name} → files-changed (${ev.tool_name})`)
            mainWindow?.webContents.send('minipit:files-changed', name)
            scheduleAutoSync(name)
          }
          break
      }
    }
  })
  proc.stderr?.on('data', (d) => hookLog(`${name} tail stderr:`, d.toString().trim()))
  proc.on('exit', (code) => {
    hookLog(`tail for ${name} exited (${code})`)
    // A non-zero early exit means `sbx exec` failed before the sandbox was
    // ready. Retry, but only while we still intend to tail this sandbox
    // (clearAgentActivity/stop removes it from the map) and we didn't kill it
    // ourselves (kill exits with a signal and code === null).
    if (code && eventTails.get(name) === proc && attempt < EXEC_RETRIES) {
      setTimeout(() => startEventTail(name, attempt + 1), EXEC_RETRY_MS)
    }
  })
}

function clearAgentActivity(name: string): void {
  eventTails.get(name)?.kill()
  eventTails.delete(name)
  agentState.delete(name)
  mainWindow?.webContents.send('minipit:agent-activity', name, null)
}

interface FileEntry {
  name: string
  type: 'file' | 'dir'
  ext?: string
  size?: string
}

interface FileChange {
  path: string
  status: 'new' | 'modified' | 'deleted' | 'renamed'
}

// What the agent has created/changed, via `git status` run inside the sandbox
// (works for both direct-mount and clone workspaces).
async function gitStatus(name: string, workspace: string): Promise<{ isRepo: boolean; changes: FileChange[] }> {
  try {
    const out = await sbx(
      ['exec', name, 'git', '-C', workspace, 'status', '--porcelain=v1', '--untracked-files=all'],
      { timeout: 10000 }
    )
    const changes: FileChange[] = []
    for (const line of out.split('\n')) {
      if (!line.trim()) continue
      const code = line.slice(0, 2)
      let path = line.slice(3)
      if (path.includes(' -> ')) path = path.split(' -> ')[1] // renamed: show new name
      let status: FileChange['status'] = 'modified'
      if (code.includes('?') || code.includes('A')) status = 'new'
      else if (code.includes('D')) status = 'deleted'
      else if (code.includes('R')) status = 'renamed'
      changes.push({ path, status })
    }
    return { isRepo: true, changes }
  } catch {
    // Non-zero exit usually means "not a git repository".
    return { isRepo: false, changes: [] }
  }
}

// Fetch a --clone sandbox's work into the local review branch `sandbox/<name>`
// without touching the working tree — never an auto-merge. Shared by the manual
// fetch-back IPC handler and the optional auto-sync-on-change path below.
async function fetchSandboxWork(name: string, repoDir: string): Promise<
  { ok: true; branch: string; hasRemote: boolean } | { ok: false; error: string }
> {
  const remote = `sandbox-${name}`
  const git = (args: string[]) => new Promise<{ code: number; out: string; err: string }>((resolve) => {
    execFile('git', args, { cwd: repoDir, timeout: 120000, env: guiEnv() },
      (e, so, se) => resolve({ code: e ? ((e as { code?: number }).code ?? 1) : 0, out: (so || '').trim(), err: (se || '').trim() }))
  })
  try {
    const remotes = await git(['remote'])
    if (!remotes.out.split('\n').includes(remote)) {
      return { ok: false, error: `No "${remote}" remote — clone-mode fetch-back needs the sandbox running (its git daemon runs only while active).` }
    }
    const fetched = await git(['fetch', remote])
    if (fetched.code !== 0) return { ok: false, error: fetched.err || `git fetch ${remote} failed — is the sandbox running?` }
    const srcBranch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).out || 'HEAD'
    const review = `sandbox/${name}`
    const made = await git(['branch', '-f', review, `${remote}/${srcBranch}`])
    if (made.code !== 0) return { ok: false, error: made.err || `Couldn't create review branch ${review}.` }
    const hasRemote = (await git(['remote', 'get-url', 'origin'])).code === 0
    return { ok: true, branch: review, hasRemote }
  } catch (err) {
    return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
  }
}

// ── Auto-sync (clone mode) ──────────────────────────────────────────────────
// Optional per-sandbox toggle: on each workspace change, quietly fetch the
// sandbox's clone into its `sandbox/<name>` review branch so the host always has
// an up-to-date branch to diff/PR — never a merge into the working tree, so it's
// safe to run unattended. Persisted in the store, keyed by sandbox name.
const AUTO_SYNC_DEBOUNCE_MS = 4000
const autoSyncTimers = new Map<string, ReturnType<typeof setTimeout>>()

function getAutoSyncMap(): Record<string, boolean> {
  return (store.get('sandboxAutoSync') as Record<string, boolean>) ?? {}
}
function setAutoSyncFlag(name: string, on: boolean): void {
  const map = getAutoSyncMap()
  if (on) map[name] = true
  else delete map[name]
  store.set('sandboxAutoSync', map)
}

// Debounced fetch after a burst of writes coalesces into one `git fetch`.
async function runAutoSync(name: string): Promise<void> {
  const repoDir = (lastGoodSandboxes ?? []).find((s) => s.name === name)?.workspace
  if (!repoDir) return
  const res = await fetchSandboxWork(name, repoDir)
  if (res.ok) {
    hookLog(`${name} → auto-synced to ${res.branch}`)
    mainWindow?.webContents.send('minipit:auto-synced', name, res.branch)
  } else {
    // Fetch fails silently (e.g. sandbox stopping) — we retry on the next change.
    hookLog(`${name} → auto-sync fetch skipped: ${res.error}`)
  }
}
function scheduleAutoSync(name: string): void {
  if (!getAutoSyncMap()[name]) return
  const existing = autoSyncTimers.get(name)
  if (existing) clearTimeout(existing)
  autoSyncTimers.set(name, setTimeout(() => {
    autoSyncTimers.delete(name)
    runAutoSync(name).catch(() => {})
  }, AUTO_SYNC_DEBOUNCE_MS))
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// List one directory level inside the sandbox. `dir` is an absolute path inside
// the container — the workspace is bind-mounted at its host path (not ~/workspace).
async function listFiles(name: string, dir: string): Promise<FileEntry[]> {
  // The target path is passed as a positional arg ($1) so filenames containing
  // quotes/spaces can't break out of the command.
  //
  // We list via `find … -exec stat` rather than `find -printf`, because `-printf`
  // is a GNU extension: BusyBox `find` (shipped by Alpine-based sandbox images)
  // doesn't support it and exits non-zero, which would surface as a handler error.
  // `stat -c` and its %F/%s/%n specifiers are supported by both BusyBox and GNU.
  // The format uses real tab separators (\t here is a literal tab in the string).
  const cmd =
    'find "$1" -maxdepth 1 -mindepth 1 -exec stat -c "%F\t%s\t%n" {} + 2>/dev/null'

  let out: string
  try {
    out = await sbx(['exec', name, 'sh', '-c', cmd, 'sh', dir || '.'])
  } catch (err) {
    // Rethrow so the caller can tell a real listing failure (sandbox not ready
    // yet on reconnect, exec transport error, path gone) apart from a genuinely
    // empty directory — the latter returns exit 0 with no output and is handled
    // below. If we swallowed this and returned [], the renderer would cache it as
    // "empty" and a transient reconnect-window failure would stick until a manual
    // refresh. The IPC layer forwards the rejection to the renderer, which catches
    // it (shows a retryable error, skips caching), so it isn't an unhandled error.
    throw err instanceof Error ? err : new Error(String(err))
  }

  const entries: FileEntry[] = []
  for (const line of out.split('\n')) {
    if (!line) continue
    // stat: "%F" is a human-readable type ("directory", "regular file", …),
    // "%s" the size, "%n" the full path we passed in.
    const [type, sizeStr, ...rest] = line.split('\t')
    const fullPath = rest.join('\t')
    if (!fullPath) continue
    const fname = fullPath.slice(fullPath.lastIndexOf('/') + 1)
    if (!fname) continue
    const isDir = type === 'directory'
    const dot = fname.lastIndexOf('.')
    entries.push({
      name: fname,
      type: isDir ? 'dir' : 'file',
      ext: !isDir && dot > 0 ? fname.slice(dot + 1) : undefined,
      size: isDir ? undefined : formatSize(parseInt(sizeStr) || 0)
    })
  }

  // Directories first, then case-insensitive by name.
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  return entries
}

// Attach to a sandbox's agent via `sbx run NAME` in a PTY. Agents like Claude
// Code are full-screen TUIs that need a real TTY, and their raw ANSI output is
// streamed straight to the renderer's xterm (no line reformatting).
function spawnSandboxProcess(name: string, cols = 80, rows = 24, opts?: { continueSession?: boolean }) {
  const existing = sbxProcesses.get(name)
  if (existing) {
    existing.kill()
    sbxProcesses.delete(name)
  }

  // Reconnecting to an already-running sandbox: resume the agent's prior
  // conversation rather than starting fresh. `--continue` is a claude agent
  // flag (gated by the caller), passed through after the `--` separator.
  const args = ['run', '--name', name]
  if (opts?.continueSession) args.push('--', '--continue')

  const proc = pty.spawn(getSbxPath(), args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.HOME ?? '/',
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    } as Record<string, string>
  })

  uptimeMap.set(name, Date.now())
  sbxProcesses.set(name, proc)

  setAgentState(name, 'working')
  // Claude Code hooks drive activity + file-change events (see startEventTail).
  injectClaudeHooks(name)
  startEventTail(name)
  proc.onData((data) => {
    mainWindow?.webContents.send('minipit:agent-output', name, data)
    scanOutputForBlocks(name, data)
  })

  proc.onExit(() => {
    sbxProcesses.delete(name)
    uptimeMap.delete(name)
    clearAgentActivity(name)
    mainWindow?.webContents.send('minipit:agent-exit', name)
    // Trigger a sandbox list refresh
    setTimeout(async () => {
      const sandboxes = await listSandboxes()
      mainWindow?.webContents.send('minipit:sandboxes-updated', sandboxes)
    }, 500)
  })

  return proc
}

function createWindow(): void {
  const logoPath = join(__dirname, '../../resources/icon/dock.png')
  const logoImg = nativeImage.createFromPath(logoPath)

  mainWindow = new BrowserWindow({
    width: 1160,
    height: 716,
    minWidth: 860,
    minHeight: 560,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 18 },
    icon: logoImg,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      // The finalize chime fires on an IPC event, not a click, so Chromium's
      // gesture-gated autoplay policy would otherwise keep the AudioContext
      // suspended and swallow it.
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  // Menu-bar app: closing the window doesn't quit. Drop the destroyed reference
  // so the tray can recreate it instead of touching a dead object.
  mainWindow.on('closed', () => { mainWindow = null })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) { createWindow(); return }
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
}

// Show the window (recreating it if it was closed) and deliver a tray-driven
// navigation event once the renderer has finished loading.
function navigateFromTray(channel: string, payload: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    mainWindow?.webContents.once('did-finish-load', () =>
      mainWindow?.webContents.send(channel, payload))
  } else {
    showMainWindow()
    mainWindow.webContents.send(channel, payload)
  }
}

function createTray(): void {
  // Dedicated menu-bar glyph; template image auto-adapts to light/dark menubar.
  const iconPath = join(__dirname, '../../resources/icon/icon-dark.png')
  const img = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  img.setTemplateImage(true)
  tray = new Tray(img)
  tray.setToolTip('den')
  updateTrayMenu([])
}

// Build the menu-bar dropdown: quick access to running sandboxes and projects.
function updateTrayMenu(sandboxes: Array<{ name: string; status: string; workspace: string }>): void {
  if (!tray) return
  const running = sandboxes.filter((s) => s.status === 'running')

  const projects: { workspace: string; count: number }[] = []
  for (const s of sandboxes) {
    let p = projects.find((x) => x.workspace === s.workspace)
    if (!p) { p = { workspace: s.workspace, count: 0 }; projects.push(p) }
    p.count++
  }

  const items: Electron.MenuItemConstructorOptions[] = [
    { label: 'Open den', click: showMainWindow },
    { type: 'separator' },
    { label: running.length ? 'Running sandboxes' : 'No running sandboxes', enabled: false },
    ...running.map((s) => ({
      label: s.name,
      click: () => navigateFromTray('minipit:open-sandbox', s.name)
    })),
    { type: 'separator' },
    { label: 'New Sandbox…', click: () => navigateFromTray('minipit:open-modal', 'new-sandbox') },
    { type: 'separator' },
    { label: 'Quit den', role: 'quit' }
  ]
  tray.setContextMenu(Menu.buildFromTemplate(items))
}

// The application menu mirrors the sidebar navigation and lists live data
// (sandboxes, projects, templates, kits) so it can be interacted with directly
// from the menu bar. Rebuilt when that data changes; the signature guard below
// avoids needless rebuilds (which would close a menu the user has open).
const MENU_LIST_LIMIT = 12
let lastMenuSig = ''
let lastMenuSandboxSig = ''

async function setAppMenu(prefetchedSandboxes?: Awaited<ReturnType<typeof listSandboxes>>): Promise<void> {
  // Route clicks through navigateFromTray so they work even when the window is
  // hidden (menu-bar-only mode): it shows/recreates the window, then delivers.
  const go = (channel: string, payload = '') => navigateFromTray(channel, payload)

  const [sandboxes, templates] = await Promise.all([
    prefetchedSandboxes ? Promise.resolve(prefetchedSandboxes) : listSandboxes().catch(() => []),
    listTemplates().catch(() => [])
  ])
  const kits = listKits()
  const mixinKits = kits.filter((k) => k.kind === 'mixin')
  const sandboxKits = kits.filter((k) => k.kind === 'sandbox')

  // Skip the rebuild when nothing menu-relevant changed.
  const sig = JSON.stringify({
    s: sandboxes.map((s) => [s.name, s.status]),
    t: templates.map((t) => `${t.repository}:${t.tag}`),
    m: kits.map((k) => [k.name, k.kind])
  })
  if (sig === lastMenuSig && Menu.getApplicationMenu()) return
  lastMenuSig = sig

  // Cap a list and append a disabled "N more…" tail so nothing is silently hidden.
  const capped = <T,>(
    all: T[], render: (x: T) => Electron.MenuItemConstructorOptions, noun: string
  ): Electron.MenuItemConstructorOptions[] => {
    const shown = all.slice(0, MENU_LIST_LIMIT).map(render)
    if (all.length > MENU_LIST_LIMIT) shown.push({ label: `${all.length - MENU_LIST_LIMIT} more ${noun}…`, enabled: false })
    return shown
  }

  const sandboxItems: Electron.MenuItemConstructorOptions[] = sandboxes.length
    ? capped(sandboxes, (s) => ({
        label: `${s.status === 'running' ? '●' : '○'}  ${s.name}`,
        click: () => go('minipit:open-sandbox', s.name)
      }), 'sandboxes')
    : [{ label: 'No sandboxes yet', enabled: false }]

  // A Library submenu: "Show all" + the list (each opens the management page,
  // which is where individual items are edited/run).
  const libSubmenu = (
    names: string[], page: string, showLabel: string, noun: string
  ): Electron.MenuItemConstructorOptions[] => [
    { label: showLabel, click: () => go('minipit:navigate', page) },
    { type: 'separator' },
    ...(names.length
      ? capped(names, (n) => ({ label: n, click: () => go('minipit:navigate', page) }), noun)
      : [{ label: `No ${noun} yet`, enabled: false }])
  ]

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'den',
      submenu: [
        { label: 'About den', role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: () => go('minipit:navigate', 'settings') },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Sandbox…', accelerator: 'Cmd+N', click: () => go('minipit:open-modal', 'new-sandbox') },
        { type: 'separator' },
        { label: 'Close Window', accelerator: 'Cmd+W', role: 'close' }
      ]
    },
    {
      // Without this, the standard clipboard accelerators (copy/paste/cut/
      // select-all) are never registered, so you can't copy from or paste into
      // the sandbox terminal.
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Terminal', accelerator: 'Cmd+1', click: () => go('minipit:set-tab', 'terminal') },
        { label: 'Info', accelerator: 'Cmd+2', click: () => go('minipit:set-tab', 'info') },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'Cmd+R', role: 'reload' },
        { label: 'Toggle DevTools', role: 'toggleDevTools' }
      ]
    },
    // Top-level menus that mirror the app's navigation (sidebar sections) and
    // list live data you can jump straight into.
    {
      label: 'Sandboxes',
      submenu: [
        { label: 'Show All Sandboxes', accelerator: 'Shift+Cmd+S', click: () => go('minipit:navigate', 'sandboxes') },
        { label: 'New Sandbox…', accelerator: 'Cmd+N', click: () => go('minipit:open-modal', 'new-sandbox') },
        { label: 'Stop Sandbox', accelerator: 'Cmd+.', click: () => go('minipit:stop-active') },
        { label: 'Open in Finder', accelerator: 'Shift+Cmd+F', click: () => go('minipit:open-in-finder') },
        { label: 'Logs', accelerator: 'Cmd+L', click: () => go('minipit:navigate', 'logs') },
        { type: 'separator' },
        ...sandboxItems
      ]
    },
    {
      label: 'Library',
      submenu: [
        { label: 'Templates', submenu: libSubmenu(templates.map((t) => `${t.repository}:${t.tag}`), 'templates', 'Show All Templates', 'templates') },
        { label: 'Mixin Kits', submenu: libSubmenu(mixinKits.map((k) => k.name), 'mixins', 'Show All Mixin Kits', 'mixin kits') },
        { label: 'Sandbox Kits', submenu: libSubmenu(sandboxKits.map((k) => k.name), 'kits', 'Show All Sandbox Kits', 'sandbox kits') }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
    },
    {
      role: 'help',
      submenu: [
        { label: 'den Website', click: () => shell.openExternal('https://den.studio') }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function setupIPC(): void {
  ipcMain.handle('minipit:list-sandboxes', () => listSandboxes())

  ipcMain.handle('minipit:run-sandbox', async (_, name: string) => {
    spawnSandboxProcess(name)
    return null
  })

  ipcMain.handle('minipit:stop-sandbox', async (_, name: string) => {
    // Kill the attached process first
    const proc = sbxProcesses.get(name)
    if (proc) {
      proc.kill()
      sbxProcesses.delete(name)
    }
    // Clear activity now rather than waiting on the PTY's onExit (which can race
    // or never fire if there's no attached process), so "Working…" doesn't stick.
    clearAgentActivity(name)
    await sbx(['stop', name])
    uptimeMap.delete(name)
  })

  ipcMain.handle('minipit:delete-sandbox', async (_, name: string) => {
    const proc = sbxProcesses.get(name)
    if (proc) {
      proc.kill()
      sbxProcesses.delete(name)
    }
    clearAgentActivity(name)
    await sbx(['rm', '--force', name])
    uptimeMap.delete(name)
    forgetIsolation(name)
    setAutoSyncFlag(name, false)
    const t = autoSyncTimers.get(name); if (t) { clearTimeout(t); autoSyncTimers.delete(name) }
  })

  ipcMain.handle('minipit:create-sandbox', async (_, config: {
    agent: string
    workspace: string
    memory?: string
    branch?: boolean
    name?: string
    template?: string
    kits?: string[]
  }) => {
    // Ensure the target workspace folder exists — defaults like ~/den/<name>
    // won't have been created yet (no-op for existing project/clone folders).
    try { require('fs').mkdirSync(config.workspace, { recursive: true }) }
    catch (err) { console.error('could not create workspace folder:', err) }
    const args = ['create']
    if (config.name) args.push('--name', config.name)
    if (config.memory) args.push('-m', config.memory)
    if (config.branch) args.push('--clone')
    if (config.template) args.push('-t', config.template)
    // --kit can only be passed at creation; stack one flag per kit directory.
    for (const dir of config.kits ?? []) args.push('--kit', dir)
    args.push(config.agent, config.workspace)
    // Stream output so the New Sandbox modal can show live progress (image pull,
    // kit injection, startup) instead of a silent "Creating…" spinner.
    const send = (chunk: string) => mainWindow?.webContents.send('minipit:create-output', chunk)
    send(`$ sbx ${args.join(' ')}\n`)
    const out = await new Promise<string>((resolve, reject) => {
      const proc = spawn(getSbxPath(), args, { env: guiEnv() })
      let buf = ''
      let err = ''
      proc.stdout?.on('data', (d) => { const s = d.toString(); buf += s; send(s) })
      proc.stderr?.on('data', (d) => { const s = d.toString(); err += s; send(s) })
      proc.on('error', (e) => reject(e))
      const timer = setTimeout(() => { proc.kill(); reject(new Error('sbx create timed out')) }, 120000)
      proc.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve(buf.trim())
        else reject(new Error(err.trim() || buf.trim() || `sbx create exited ${code}`))
      })
    })
    // `sbx create` prints e.g. "✓ Created sandbox 'claude-foo'" plus extra lines,
    // so parse the quoted name rather than using the whole message.
    const match = out.match(/sandbox ['"]([^'"]+)['"]/i)
    const sandboxName =
      config.name ?? match?.[1] ?? `${config.agent}-${config.workspace.split('/').pop()}`
    recordKits(sandboxName, config.kits ?? [])
    recordIsolation(sandboxName, !!config.branch)
    // The agent session is started by the Agent terminal (agent-ensure) at the
    // terminal's real size — avoids a default-size session that renders garbled.
    return sandboxName
  })

  ipcMain.handle('minipit:get-ports', async (_, name: string) => {
    return getPortsForSandbox(name)
  })

  // Publish a port from the sandbox to the host. `spec` is the sbx port form
  // [[HOST_IP:]HOST_PORT:]SANDBOX_PORT[/PROTOCOL], e.g. "8080:8080/tcp".
  // Requires the sandbox to be running; mappings don't persist across stops.
  ipcMain.handle('minipit:port-publish', async (_, name: string, spec: string) => {
    try {
      const output = await sbx(['ports', name, '--publish', spec], { timeout: 15000 })
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Remove a published port. sbx wants the explicit host:sandbox[/proto] form.
  ipcMain.handle('minipit:port-unpublish', async (_, name: string, spec: string) => {
    try {
      const output = await sbx(['ports', name, '--unpublish', spec], { timeout: 15000 })
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  ipcMain.handle('minipit:list-files', async (_, name: string, relPath: string) => {
    return listFiles(name, relPath ?? '')
  })

  ipcMain.handle('minipit:generate-palette', async (_, hex: string, size = 9) => {
    try {
      // rampa-sdk is ESM-only and uses Node built-ins, so it runs here (main),
      // not in the renderer. Dynamic import works from the CJS main bundle.
      const { rampa } = await import('@basiclines/rampa-sdk')
      return rampa(hex).size(size).palette as string[]
    } catch (err) {
      console.error('generate-palette failed:', err)
      return []
    }
  })

  ipcMain.handle('minipit:sign-out', async () => {
    // `sbx logout` stops all running sandboxes and signs out of Docker.
    await sbx(['logout'], { timeout: 30000 })
  })

  ipcMain.handle('minipit:list-templates', () => listTemplates())

  ipcMain.handle('minipit:remove-template', async (_, ref: string) => {
    await sbx(['template', 'rm', ref], { timeout: 30000 })
  })

  ipcMain.handle('minipit:storage-usage', () => storageUsage())

  // ── Kits ───────────────────────────────────────────────────────────────
  // Kit artifacts authored under <userData>/kits/<name>/ (spec.yaml + files/).
  ipcMain.handle('minipit:create-kit', async (_, name: string, specYaml: string, files?: string[]) => {
    const fs = require('fs')
    const path = require('path')
    const base = join(kitsRoot(), name)
    fs.mkdirSync(join(base, 'files'), { recursive: true })
    fs.writeFileSync(join(base, 'spec.yaml'), specYaml)
    // Bundle attached reference files into the kit (injected into the workspace).
    if (files?.length) {
      const dest = join(base, 'files', 'workspace')
      fs.mkdirSync(dest, { recursive: true })
      for (const fp of files) {
        try { fs.copyFileSync(fp, join(dest, path.basename(fp))) } catch (e) { console.error('copy kit file failed:', e) }
      }
    }
    const zip = join(kitsRoot(), `${name}.zip`)
    // pack validates the spec and produces the ZIP artifact.
    const output = await sbx(['kit', 'pack', base, '-o', zip], { timeout: 30000 })
    setAppMenu().catch(() => {})
    return { dir: base, zip, output }
  })

  ipcMain.handle('minipit:pick-files', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Docs', extensions: ['pdf', 'txt', 'md', 'markdown', 'json', 'yaml', 'yml', 'csv'] }]
    })
    return r.canceled ? [] : r.filePaths
  })

  ipcMain.handle('minipit:applied-kits', (_, sandbox: string) => {
    const fromStore = ((store.get('appliedKits') as Record<string, string[]>) ?? {})[sandbox] ?? []
    // Also derive from the sandbox's durable-startup dirs (host-side), which sbx
    // names `NNN-startup-<kit>` — so kits show even if applied outside the app.
    // The first entry is the agent's own built-in startup, so exclude it.
    const derived: string[] = []
    try {
      const fs = require('fs')
      const dir = join(app.getPath('home'),
        'Library/Application Support/com.docker.sandboxes/sandboxes/sandboxd/runtimes/durable-startup', sandbox)
      let agent = ''
      try {
        const rt = JSON.parse(fs.readFileSync(join(app.getPath('home'),
          'Library/Application Support/com.docker.sandboxes/sandboxes/sandboxd/runtimes', `${sandbox}.json`), 'utf8'))
        agent = rt?.AgentName ?? rt?.agent ?? ''
      } catch { /* no runtime json */ }
      for (const name of fs.readdirSync(dir) as string[]) {
        const m = name.match(/^\d+-startup-(.+)$/)
        if (m && m[1] !== agent) derived.push(m[1])
      }
    } catch { /* not running / no durable-startup */ }
    return Array.from(new Set([...fromStore, ...derived]))
  })

  ipcMain.handle('minipit:read-kit', (_, dir: string) => {
    try { return require('fs').readFileSync(join(dir, 'spec.yaml'), 'utf8') as string }
    catch { return '' }
  })

  // Rewrite a kit's spec.yaml, bundle any newly-attached files, and re-pack it.
  ipcMain.handle('minipit:update-kit', async (_, dir: string, spec: string, files?: string[]) => {
    try {
      const fs = require('fs')
      const path = require('path')
      fs.writeFileSync(join(dir, 'spec.yaml'), spec)
      // Copy in any new reference files (existing bundled files are left as-is).
      if (files?.length) {
        const dest = join(dir, 'files', 'workspace')
        fs.mkdirSync(dest, { recursive: true })
        for (const fp of files) {
          try { fs.copyFileSync(fp, join(dest, path.basename(fp))) } catch (e) { console.error('copy kit file failed:', e) }
        }
      }
      const output = await sbx(['kit', 'pack', dir, '-o', `${dir}.zip`], { timeout: 30000 })
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Apply a kit to a RUNNING sandbox (re-runs install commands, re-copies files).
  ipcMain.handle('minipit:kit-add', async (_, sandbox: string, kitDir: string) => {
    try {
      const output = await sbx(['kit', 'add', sandbox, kitDir], { timeout: 120000 })
      recordKits(sandbox, [kitDir])
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  ipcMain.handle('minipit:list-kits', () => listKits())

  ipcMain.handle('minipit:remove-kit', (_, dir: string) => {
    const fs = require('fs')
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch (err) { console.error(err) }
    setAppMenu().catch(() => {})
  })

  // The logged-in Docker Hub account, read from the Docker credential helper
  // (config.json `credsStore` → `docker-credential-<store> list`). Used to
  // prefill the push reference with the user's namespace.
  ipcMain.handle('minipit:docker-account', async () => {
    try {
      const fs = require('fs')
      const cfg = JSON.parse(fs.readFileSync(join(app.getPath('home'), '.docker/config.json'), 'utf8'))
      const store = cfg.credsStore || cfg.credStore
      if (!store) return { loggedIn: false }
      const out = await new Promise<string>((resolve, reject) => {
        const proc = spawn(`docker-credential-${store}`, ['list'], { env: guiEnv() })
        let buf = ''
        proc.stdout?.on('data', (d) => { buf += d.toString() })
        proc.on('error', reject)
        proc.on('close', () => resolve(buf))
      })
      const map = JSON.parse(out || '{}') as Record<string, string>
      const registry = 'https://index.docker.io/v1/'
      const username = map[registry] || Object.values(map)[0]
      if (!username) return { loggedIn: false }
      // Best-effort email for a Gravatar: the legacy `email` field is the only
      // place the Docker config carries one (creds stores hold usernames only).
      const email: string | undefined = cfg.auths?.[registry]?.email || cfg.auths?.[username]?.email
      const gravatar = email
        ? require('crypto').createHash('md5').update(email.trim().toLowerCase()).digest('hex')
        : undefined
      return { loggedIn: true, username, email, gravatar }
    } catch {
      return { loggedIn: false }
    }
  })

  // Sign in to Docker via `sbx login`. It's an interactive browser/device flow,
  // so stream its output to the renderer and allow a long timeout while the user
  // completes auth in the browser.
  ipcMain.handle('minipit:docker-login', async () => {
    const send = (chunk: string) => mainWindow?.webContents.send('minipit:login-output', chunk)
    try {
      const output = await new Promise<string>((resolve, reject) => {
        const proc = spawn(getSbxPath(), ['login'], { env: guiEnv() })
        let buf = ''
        let err = ''
        proc.stdout?.on('data', (d) => { const s = d.toString(); buf += s; send(s) })
        proc.stderr?.on('data', (d) => { const s = d.toString(); err += s; send(s) })
        proc.on('error', (e) => reject(e))
        const timer = setTimeout(() => { proc.kill(); reject(new Error('sbx login timed out')) }, 300000)
        proc.on('close', (code) => {
          clearTimeout(timer)
          if (code === 0) resolve(buf.trim())
          else reject(new Error(err.trim() || buf.trim() || `sbx login exited ${code}`))
        })
      })
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Run `sbx diagnose` for support/troubleshooting. The plain and github-issue
  // variants can take a while (they probe the daemon, VMs and network), and
  // `--upload` sends a bundle to Docker — so stream output and use a long
  // timeout, mirroring the login flow.
  //   text         → `sbx diagnose`               (human-readable report)
  //   json         → `sbx diagnose --output json`  (machine-readable)
  //   github-issue → `sbx diagnose --output github-issue` (pre-formatted bug)
  //   upload       → `sbx diagnose --upload`        (uploads a bundle, prints id)
  ipcMain.handle(
    'minipit:diagnose',
    async (_, mode: 'text' | 'json' | 'github-issue' | 'upload' = 'text') => {
      const send = (chunk: string) =>
        mainWindow?.webContents.send('minipit:diagnose-output', chunk)

      // Human-readable report → run through a pty so sbx emits its full colour
      // checklist (piping strips colour). The renderer resolves the ANSI/cursor
      // stream into a coloured, final-frame view.
      if (mode === 'text') {
        try {
          const { code, output } = await ptyRun(['diagnose'], send, 300000)
          if (code !== 0) return { ok: false, error: (output.trim() || `sbx diagnose exited ${code}`) }
          return { ok: true, output }
        } catch (err) {
          return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
        }
      }

      // json / github-issue / upload → plain pipe. These are machine-readable
      // or shareable artifacts, so their output must stay free of colour codes.
      const args = mode === 'upload' ? ['diagnose', '--upload'] : ['diagnose', '--output', mode]
      try {
        const output = await new Promise<string>((resolve, reject) => {
          const proc = spawn(getSbxPath(), args, { env: guiEnv() })
          let buf = ''
          let err = ''
          proc.stdout?.on('data', (d) => { const s = d.toString(); buf += s; send(s) })
          proc.stderr?.on('data', (d) => { const s = d.toString(); err += s; send(s) })
          proc.on('error', (e) => reject(e))
          const timer = setTimeout(() => { proc.kill(); reject(new Error('sbx diagnose timed out')) }, 300000)
          proc.on('close', (code) => {
            clearTimeout(timer)
            if (code === 0) resolve(buf.trim())
            else reject(new Error(err.trim() || buf.trim() || `sbx diagnose exited ${code}`))
          })
        })
        return { ok: true, output }
      } catch (err) {
        return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
      }
    }
  )

  // Restart the sbx daemon: `sbx daemon stop` then `sbx daemon start -d`. Runs
  // the two steps in sequence and streams to its OWN channel so the output can
  // render under the Restart daemon button, separate from the diagnostics box.
  // The first step is best-effort — if the daemon is already down, `stop` may
  // exit non-zero, which shouldn't block the restart.
  ipcMain.handle('minipit:daemon-restart', async () => {
    const send = (chunk: string) =>
      mainWindow?.webContents.send('minipit:daemon-output', chunk)
    const step = async (args: string[]) => {
      send(`$ sbx ${args.join(' ')}\r\n`)
      const { code } = await ptyRun(args, send, 60000)
      return code
    }
    try {
      await step(['daemon', 'stop'])          // best-effort — ignore its exit code
      const code = await step(['daemon', 'start', '-d'])
      if (code !== 0) return { ok: false, error: `sbx daemon start exited ${code}` }
      send('\nDaemon restarted.\n')
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Publish a kit as an OCI artifact to a registry (Docker Hub, ghcr, …).
  // Auth uses the Docker credential store (the user must `docker login` first).
  ipcMain.handle('minipit:kit-push', async (_, dir: string, ref: string) => {
    try {
      const output = await sbx(['kit', 'push', dir, ref], { timeout: 180000 })
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Validate a kit spec without saving/packing it — surfaces spec errors in the
  // editor. `sbx kit validate` exits non-zero on invalid specs, so a rejected
  // promise carries the validation message.
  ipcMain.handle('minipit:kit-validate', async (_, dir: string) => {
    try {
      const output = await sbx(['kit', 'validate', dir], { timeout: 20000 })
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Pack a kit into a distributable zip at a user-chosen location (complements
  // push — for sharing a file rather than an OCI reference).
  ipcMain.handle('minipit:kit-pack', async (_, dir: string, name: string) => {
    const res = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: `${name}.zip`,
      filters: [{ name: 'Zip archive', extensions: ['zip'] }]
    })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }
    try {
      const output = await sbx(['kit', 'pack', dir, '-o', res.filePath], { timeout: 30000 })
      return { ok: true, path: res.filePath, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Save a sandbox's current state as a reusable template (image) under a tag.
  // `sbx template save` interactively asks to stop the sandbox first (there is no
  // flag to skip it), so feed "y" to its stdin to auto-confirm.
  ipcMain.handle('minipit:save-snapshot', async (_, name: string, tag: string) => {
    try {
      const output = await sbxWithInput(['template', 'save', name, tag], 'y\n', 180000)
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Publish a template (image) to a registry. Auth uses the Docker credential
  // store, so the user must `docker login` first (same as kit push).
  ipcMain.handle('minipit:template-push', async (_, ref: string) => {
    try {
      const output = await sbx(['template', 'push', ref], { timeout: 300000 })
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Import a remote kit by OCI reference: pull the artifact, then extract it
  // into the local kit library so it shows up like any locally-authored kit.
  ipcMain.handle('minipit:kit-import', async (_, ref: string) => {
    const fs = require('fs')
    const r = ref.trim()
    if (!r) return { ok: false, error: 'Reference is required.' }
    // Derive a kit name from the reference (last path segment, sans tag/digest).
    const last = r.split('@')[0].split('/').pop() ?? r
    const name = (last.split(':')[0] || 'kit').replace(/[^A-Za-z0-9._-]/g, '-')
    const root = kitsRoot()
    const zip = join(root, `${name}.zip`)
    const dir = join(root, name)
    const run = (bin: string, args: string[]) => new Promise<number>((resolve, reject) => {
      const p = spawn(bin, args, { env: guiEnv() })
      let err = ''
      p.stderr?.on('data', (d) => { err += d.toString() })
      p.on('error', reject)
      p.on('close', (code) => (code === 0 ? resolve(0) : reject(new Error(err.trim() || `${bin} exited ${code}`))))
    })
    try {
      await sbx(['kit', 'pull', r, '-o', zip], { timeout: 120000 })
      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(dir, { recursive: true })
      // schemaVersion 1 → zip; schemaVersion 2 → tar.gz. Try zip, fall back to tar.
      try { await run('unzip', ['-o', zip, '-d', dir]) }
      catch { await run('tar', ['xzf', zip, '-C', dir]) }
      // Some artifacts wrap contents in a single top-level folder — flatten it.
      if (!fs.existsSync(join(dir, 'spec.yaml'))) {
        const entries = fs.readdirSync(dir)
        if (entries.length === 1 && fs.statSync(join(dir, entries[0])).isDirectory()) {
          const inner = join(dir, entries[0])
          for (const f of fs.readdirSync(inner)) fs.renameSync(join(inner, f), join(dir, f))
          fs.rmdirSync(inner)
        }
      }
      if (!fs.existsSync(join(dir, 'spec.yaml'))) {
        fs.rmSync(dir, { recursive: true, force: true })
        return { ok: false, error: 'Pulled artifact has no spec.yaml — not a valid kit.' }
      }
      return { ok: true, name }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // ── Community kit gallery (github.com/docker/sbx-kits-contrib) ────────────
  // Browse the community kit repo. Each top-level directory with a spec.yaml is
  // a kit; sbx consumes it via `--kit "git+<repo>#dir=<name>"`. We list the kits
  // live from GitHub (one tree call + raw spec fetches — raw.githubusercontent
  // isn't API-rate-limited) and return the raw specs for the renderer to parse.
  ipcMain.handle('minipit:list-contrib-kits', async () => {
    try {
      const treeRes = await fetch(
        `https://api.github.com/repos/${CONTRIB_REPO}/git/trees/${CONTRIB_BRANCH}?recursive=1`,
        { headers: { 'User-Agent': 'den-app', Accept: 'application/vnd.github+json' } }
      )
      if (!treeRes.ok) {
        const detail = treeRes.status === 403 ? ' (GitHub rate limit — try again in a bit)' : ''
        return { ok: false, error: `GitHub returned ${treeRes.status}${detail}.` }
      }
      const tree = (await treeRes.json()) as { tree?: { path: string; type: string }[] }
      // Top-level "<dir>/spec.yaml" blobs mark each kit (skip nested spec files).
      const dirs = (tree.tree ?? [])
        .filter((n) => n.type === 'blob' && /^[^/]+\/spec\.yaml$/.test(n.path))
        .map((n) => n.path.split('/')[0])
      const kits = await Promise.all(
        dirs.map(async (dir) => {
          try {
            const r = await fetch(`https://raw.githubusercontent.com/${CONTRIB_REPO}/${CONTRIB_BRANCH}/${dir}/spec.yaml`,
              { headers: { 'User-Agent': 'den-app' } })
            if (!r.ok) return null
            return { dir, spec: await r.text() }
          } catch { return null }
        })
      )
      return { ok: true, kits: kits.filter(Boolean) as { dir: string; spec: string }[] }
    } catch (err) {
      console.error('list-contrib-kits failed:', err)
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() || 'Could not reach GitHub.' }
    }
  })

  // Import a community kit into the local library: shallow-clone the repo, copy
  // the kit's subdirectory into <userData>/kits/<dir>/, and pack it so it shows
  // up (and can be edited/re-added) like any locally-authored kit.
  ipcMain.handle('minipit:import-contrib-kit', async (_, dir: string) => {
    const fs = require('fs')
    const os = require('os')
    const name = (dir || '').replace(/[^A-Za-z0-9._-]/g, '-')
    if (!name) return { ok: false, error: 'Kit name is required.' }
    const dest = join(kitsRoot(), name)
    const tmp = fs.mkdtempSync(join(os.tmpdir(), 'den-kit-'))
    const run = (bin: string, args: string[], timeout = 60000) => new Promise<void>((resolve, reject) => {
      const p = spawn(bin, args, { env: guiEnv() })
      let err = ''
      p.stderr?.on('data', (d) => { err += d.toString() })
      p.on('error', reject)
      const timer = setTimeout(() => { p.kill(); reject(new Error(`${bin} timed out`)) }, timeout)
      p.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(err.trim() || `${bin} exited ${code}`)) })
    })
    try {
      // Sparse shallow clone — fetch only this kit's subtree, not the whole repo.
      await run('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse',
        '--branch', CONTRIB_BRANCH, `https://github.com/${CONTRIB_REPO}.git`, tmp])
      await run('git', ['-C', tmp, 'sparse-checkout', 'set', name])
      const src = join(tmp, name)
      if (!fs.existsSync(join(src, 'spec.yaml'))) {
        return { ok: false, error: `"${name}" has no spec.yaml in the repo.` }
      }
      fs.rmSync(dest, { recursive: true, force: true })
      fs.cpSync(src, dest, { recursive: true })
      fs.rmSync(join(dest, '.git'), { recursive: true, force: true })
      await sbx(['kit', 'pack', dest, '-o', `${dest}.zip`], { timeout: 30000 })
      setAppMenu().catch(() => {})
      return { ok: true, name }
    } catch (err) {
      fs.rmSync(dest, { recursive: true, force: true })
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  ipcMain.handle('minipit:git-status', (_, name: string, workspace: string) => gitStatus(name, workspace))

  // Host-side check: is this workspace folder a Git repo? `--clone` sandboxes
  // clone the host repo, so this gates the "initialize a repo" offer.
  ipcMain.handle('minipit:is-git-repo', (_, dir: string) => new Promise<boolean>((resolve) => {
    if (!dir) return resolve(false)
    execFile('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], { timeout: 5000, env: guiEnv() },
      (err, stdout) => resolve(!err && stdout.trim() === 'true'))
  }))

  // Host-side repo summary for a workspace folder: branch + origin remote.
  // Powers the project Git badge, "Open on GitHub", and "Copy remote".
  ipcMain.handle('minipit:git-info', (_, dir: string) => new Promise<{
    isRepo: boolean; branch?: string; remote?: string; remoteUrl?: string
  }>((resolve) => {
    if (!dir) return resolve({ isRepo: false })
    const run = (args: string[]) => new Promise<string | null>((res) =>
      execFile('git', ['-C', dir, ...args], { timeout: 5000, env: guiEnv() },
        (err, stdout) => res(err ? null : stdout.trim())))
    run(['rev-parse', '--is-inside-work-tree']).then(async (inside) => {
      if (inside !== 'true') return resolve({ isRepo: false })
      const branch = (await run(['branch', '--show-current'])) || undefined
      const remote = (await run(['remote', 'get-url', 'origin'])) || undefined
      // Normalise git@github.com:org/repo(.git) and ssh/https forms to a browsable URL.
      let remoteUrl: string | undefined
      if (remote) {
        const m = remote.match(/^(?:git@|https?:\/\/)([^/:]+)[/:](.+?)(?:\.git)?$/)
        if (m) remoteUrl = `https://${m[1]}/${m[2]}`
      }
      resolve({ isRepo: true, branch, remote, remoteUrl })
    })
  }))

  // ── Clone-mode "feature" fetch-back ───────────────────────────────────────
  // A --clone sandbox exposes its private clone as a `sandbox-<name>` git remote
  // on the host (git daemon, live only while the sandbox runs). Agent output is
  // untrusted, so we never auto-merge onto the working branch: we fetch the work
  // into a local review branch, then the user explicitly opens a PR or merges.
  const gitIn = (repoDir: string) => (args: string[]) => new Promise<{ code: number; out: string; err: string }>((resolve) => {
    execFile('git', args, { cwd: repoDir, timeout: 120000, env: guiEnv() },
      (e, so, se) => resolve({ code: e ? ((e as { code?: number }).code ?? 1) : 0, out: (so || '').trim(), err: (se || '').trim() }))
  })

  // Fetch the sandbox's work into a local review branch `sandbox/<name>`.
  ipcMain.handle('minipit:sandbox-fetch-work', (_, name: string, repoDir: string) => fetchSandboxWork(name, repoDir))

  // Per-sandbox "auto-sync to review branch" toggle (clone mode). Enabling runs
  // an immediate fetch so the branch is current right away; subsequent workspace
  // changes are picked up by scheduleAutoSync (debounced).
  ipcMain.handle('minipit:auto-sync-get', () => getAutoSyncMap())
  ipcMain.handle('minipit:auto-sync-set', (_, name: string, on: boolean) => {
    setAutoSyncFlag(name, on)
    if (on) runAutoSync(name).catch(() => {})
    else { const t = autoSyncTimers.get(name); if (t) { clearTimeout(t); autoSyncTimers.delete(name) } }
    return true
  })

  // Push the review branch and open a PR (via gh, falling back to a compare URL).
  ipcMain.handle('minipit:sandbox-open-pr', async (_, repoDir: string, branch: string) => {
    const git = gitIn(repoDir)
    try {
      const pushed = await git(['push', '-u', 'origin', branch])
      if (pushed.code !== 0) return { ok: false, error: pushed.err || 'git push failed.' }
      const gh = await new Promise<{ code: number; out: string }>((resolve) => {
        execFile('gh', ['pr', 'create', '--head', branch, '--fill'], { cwd: repoDir, timeout: 60000, env: guiEnv() },
          (e, so) => resolve({ code: e ? 1 : 0, out: (so || '').trim() }))
      })
      if (gh.code === 0) return { ok: true, url: (gh.out.match(/https?:\/\/\S+/) || [])[0] }
      // gh unavailable/failed — hand back a compare URL derived from origin.
      const originUrl = (await git(['remote', 'get-url', 'origin'])).out
      const m = originUrl.match(/^(?:git@|https?:\/\/)([^/:]+)[/:](.+?)(?:\.git)?$/)
      const url = m ? `https://${m[1]}/${m[2]}/compare/${encodeURIComponent(branch)}?expand=1` : undefined
      return { ok: true, url, pushedOnly: true }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Merge a review branch into the current branch, aborting cleanly on conflict.
  ipcMain.handle('minipit:sandbox-merge-branch', async (_, repoDir: string, branch: string) => {
    const git = gitIn(repoDir)
    try {
      const base = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).out || 'HEAD'
      const merged = await git(['merge', '--no-edit', branch])
      if (merged.code !== 0) {
        await git(['merge', '--abort'])
        return { ok: false, conflict: true, error: `Merge of ${branch} into ${base} hit conflicts and was aborted. Resolve manually:\n  git merge ${branch}` }
      }
      return { ok: true, base, output: merged.out || `Merged ${branch} into ${base}.` }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Initialize a Git repo in a host folder and commit its current contents, so a
  // `--clone` sandbox has a repo (with the folder's files) to clone.
  ipcMain.handle('minipit:git-init', async (_, dir: string) => {
    const runGit = (args: string[]) => new Promise<string>((resolve, reject) => {
      execFile('git', args, { cwd: dir, timeout: 60000, env: guiEnv() },
        (err, stdout, stderr) => (err ? reject(new Error((stderr || err.message).trim())) : resolve(stdout.trim())))
    })
    try {
      require('fs').mkdirSync(dir, { recursive: true })
      await runGit(['init'])
      await runGit(['add', '-A'])
      // Commit so the clone isn't empty; tolerate an empty folder (nothing to commit).
      // -c keeps this working even if the user has no global git identity set.
      try {
        await runGit(['-c', 'user.name=den', '-c', 'user.email=den@localhost', 'commit', '-m', 'Initial commit'])
      } catch { /* nothing to commit — an empty repo is still valid */ }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Read a file's contents (untrimmed, up to 10 MB) via `sbx exec cat`.
  ipcMain.handle('minipit:read-file', (_, name: string, path: string) => new Promise<string>((resolve, reject) => {
    execFile(getSbxPath(), ['exec', name, 'cat', path], { timeout: 15000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout)
    })
  }))

  // Write contents back to a file (content piped to `cat > FILE`).
  ipcMain.handle('minipit:write-file', async (_, name: string, path: string, content: string) => {
    await sbxWithInput(['exec', name, 'sh', '-c', 'cat > "$1"', 'sh', path], content)
  })

  // Open a host path (the workspace is bind-mounted) in the OS default app,
  // or an http(s) URL in the default browser.
  ipcMain.handle('minipit:open-path', (_, path: string) => {
    if (/^https?:\/\//i.test(path)) return openExternalSafe(path)
    const expanded = path.replace(/^~/, app.getPath('home'))
    return shell.openPath(expanded)
  })

  // Open the built-in file editor in its own window.
  ipcMain.handle('minipit:open-file-window', (_, name: string, path: string, fileName: string) => {
    const win = new BrowserWindow({
      width: 820,
      height: 640,
      title: fileName,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true
      }
    })
    const params = `sandbox=${encodeURIComponent(name)}&path=${encodeURIComponent(path)}&name=${encodeURIComponent(fileName)}`
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/editor?${params}`)
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/editor?${params}` })
    }
  })

  // Delete a file or directory inside the sandbox workspace.
  ipcMain.handle('minipit:delete-path', async (_, name: string, path: string) => {
    await sbx(['exec', name, 'rm', '-rf', path])
  })

  // Write dropped files' bytes into a directory inside the sandbox. Mirrors the
  // agent file-drop (reads bytes in the renderer via arrayBuffer, streams them
  // in over stdin), so it needs no host path and works for any container
  // directory regardless of how the workspace is mounted. Returns a per-file
  // result so the renderer can report partial failures (e.g. permission denied).
  ipcMain.handle('minipit:copy-into', async (_, name: string, destDir: string, files: { name: string; bytes: Uint8Array }[]) => {
    const results: { name: string; ok: boolean; error?: string }[] = []
    for (const f of files) {
      const safe = ((f.name.split(/[\\/]/).pop() || 'file').replace(/[^A-Za-z0-9._ -]/g, '_').slice(-160)) || 'file'
      if (!f.bytes?.byteLength || f.bytes.byteLength > 500 * 1024 * 1024) {
        results.push({ name: safe, ok: false, error: 'file is empty or too large (500 MB max)' })
        continue
      }
      const r = await new Promise<{ name: string; ok: boolean; error?: string }>((resolve) => {
        // Positional args ($1 dir, $2 name) keep paths with spaces/quotes safe.
        const proc = spawn(getSbxPath(), ['exec', name, 'sh', '-c', 'cat > "$1/$2"', 'sh', destDir, safe])
        let err = ''
        proc.stderr.on('data', (d) => { err += d.toString() })
        proc.on('error', (e) => resolve({ name: safe, ok: false, error: String(e) }))
        proc.on('close', (code) => resolve(code === 0 ? { name: safe, ok: true } : { name: safe, ok: false, error: err.trim() || `exit ${code}` }))
        proc.stdin.write(Buffer.from(f.bytes))
        proc.stdin.end()
      })
      results.push(r)
    }
    return results
  })

  // Download a file from the sandbox to the host via a save dialog, then
  // `sbx cp sandbox:src → host`. Works for any container path, so it's the way
  // to get files that live outside the (host-mounted) workspace onto the host.
  ipcMain.handle('minipit:download-from', async (_, name: string, srcPath: string) => {
    const base = srcPath.split('/').pop() || 'file'
    const res = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: join(app.getPath('downloads'), base),
      buttonLabel: 'Download'
    })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }
    try {
      await sbx(['cp', `${name}:${srcPath}`, res.filePath], { timeout: 120000 })
      return { ok: true, path: res.filePath }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('minipit:list-secrets', () => listSecrets())

  ipcMain.handle('minipit:set-secret', async (_, service: string, value: string, scope?: string) => {
    await sbxWithInput(['secret', 'set', ...secretScopeArgs(scope), service], value.endsWith('\n') ? value : value + '\n')
  })

  // Is the 1Password CLI installed? Gates the "Load from 1Password" option.
  ipcMain.handle('minipit:op-available', () => opAvailable())

  // Resolve a 1Password reference with `op read` and store the result — mirrors
  // `op read "op://…" | sbx secret set <scope> <service>`. The real value stays
  // on the host and is never pasted into den.
  ipcMain.handle('minipit:set-secret-op', async (_, service: string, ref: string, scope?: string) => {
    const value = await opRead(ref)
    if (!value) throw new Error('1Password returned an empty value for that reference.')
    await sbxWithInput(['secret', 'set', ...secretScopeArgs(scope), service], value.endsWith('\n') ? value : value + '\n')
  })

  ipcMain.handle('minipit:remove-secret', async (_, service: string, scope?: string) => {
    await sbx(['secret', 'rm', ...secretScopeArgs(scope), service, '-f'])
  })

  ipcMain.handle('minipit:anthropic-oauth', () => anthropicOAuth())

  // sbx has a built-in OAuth flow for OpenAI (opens the browser, stores tokens).
  ipcMain.handle('minipit:oauth-secret', (_, service: string) => new Promise((resolve, reject) => {
    const proc = spawn(getSbxPath(), ['secret', 'set', '-g', service, '--oauth'])
    let err = ''
    proc.stderr?.on('data', (d) => (err += d))
    proc.on('error', reject)
    proc.on('close', (code) => (code === 0 ? resolve({ ok: true }) : reject(new Error(err.trim() || `exit ${code}`))))
    setTimeout(() => { try { proc.kill() } catch { /* ignore */ }; reject(new Error('OAuth timed out')) }, 180000)
  }))

  ipcMain.handle('minipit:open-in-finder', (_, path: string) => {
    const fs = require('fs')
    // Expand a leading `~` (only when it's the home marker, not part of a name)
    // and strip trailing slashes — macOS `showItemInFolder` no-ops on both.
    const expanded = (path.replace(/^~(?=$|\/)/, app.getPath('home')).replace(/\/+$/, '') || '/')
    if (!fs.existsSync(expanded)) {
      // The item isn't on the host (e.g. lives only inside the sandbox), so
      // showItemInFolder would silently do nothing. Fall back to the parent.
      console.error('open-in-finder: path not found on host:', expanded)
      const parent = require('path').dirname(expanded)
      if (fs.existsSync(parent)) return shell.openPath(parent)
      return undefined
    }
    shell.showItemInFolder(expanded)
    return undefined
  })

  ipcMain.handle('minipit:exec', async (_, name: string, command: string) => {
    return sbx(['exec', name, 'sh', '-c', command], { timeout: 10000 })
  })

  // ── sbx daemon logs ──────────────────────────────────────────────────────
  ipcMain.handle('minipit:list-logs', () => {
    const base = join(app.getPath('home'), 'Library/Application Support/com.docker.sandboxes/sandboxes/sandboxd')
    try {
      const fs = require('fs')
      return (fs.readdirSync(base) as string[])
        .filter((f) => f.endsWith('.log'))
        .sort()
        .map((f) => ({ name: f, path: join(base, f) }))
    } catch {
      return []
    }
  })

  ipcMain.handle('minipit:start-log-tail', (_, path: string) => {
    if (logTail) { logTail.kill(); logTail = null }
    const proc = spawn('tail', ['-n', '500', '-f', path])
    logTail = proc
    proc.stdout?.on('data', (d) => mainWindow?.webContents.send('minipit:log-tail', d.toString()))
    proc.stderr?.on('data', (d) => mainWindow?.webContents.send('minipit:log-tail', d.toString()))
  })

  ipcMain.handle('minipit:stop-log-tail', () => {
    if (logTail) { logTail.kill(); logTail = null }
  })

  // Kit/startup logs live INSIDE the sandbox (the durable-startup dispatcher
  // writes every startup command's output here). Not host-tailable, so read it
  // on demand via exec; callers poll for "follow".
  ipcMain.handle('minipit:sandbox-log', async (_, name: string, which: 'kit' | 'sandbox') => {
    const path = which === 'sandbox' ? '/var/log/dockerd.log' : '/var/log/sbx-kit-startup.log'
    try {
      const text = await sbx(['exec', name, 'sh', '-c', `cat ${path} 2>/dev/null`], { timeout: 10000 })
      return { ok: true, text }
    } catch (e) {
      return { ok: false, text: '', error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('minipit:get-settings', () => ({
    sbxPath: getSbxPath(),
    pollFocused: (store.get('pollFocused') as string) ?? '5s',
    pollBackground: (store.get('pollBackground') as string) ?? '30s',
    launchAtLogin: (store.get('launchAtLogin') as boolean) ?? true,
    menuBarOnly: (store.get('menuBarOnly') as boolean) ?? true,
    notifyOnExit: (store.get('notifyOnExit') as boolean) ?? true,
    notifyOnError: (store.get('notifyOnError') as boolean) ?? true,
    keepAwake: (store.get('keepAwake') as boolean) ?? true,
    imagePaste: (store.get('imagePaste') as boolean) ?? false
  }))

  // Write a runtime setting via `sbx settings set <key> <value>` (e.g.
  // clipboard.imagePaste). Distinct from den's own app settings above.
  ipcMain.handle('minipit:sbx-setting-set', async (_, key: string, value: string) => {
    try {
      const output = await sbx(['settings', 'set', key, value], { timeout: 15000 })
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Destructive: `sbx reset` stops all VMs and deletes sandbox data. It prompts
  // for confirmation, so feed "y". `--preserve-secrets` keeps stored creds.
  ipcMain.handle('minipit:sbx-reset', async (_, preserveSecrets: boolean) => {
    try {
      const args = ['reset']
      if (preserveSecrets) args.push('--preserve-secrets')
      const output = await sbxWithInput(args, 'y\n', 120000)
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  ipcMain.handle('minipit:save-settings', (_, settings: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(settings)) store.set(k, v)
    if (typeof settings.launchAtLogin === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin })
    }
    // Re-evaluate the sleep blocker if the keepAwake setting was toggled.
    if (typeof settings.keepAwake === 'boolean') updatePowerBlocker(lastRunningCount)
  })

  // ── sbx runtime (version / update / release notes) ──────────────────────────

  ipcMain.handle('minipit:sbx-version', (_, path?: string) =>
    new Promise((resolve) => {
      const bin = path || getSbxPath()
      execFile(bin, ['version'], { timeout: 10000 }, (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, error: (stderr || err.message).trim() })
        } else {
          const raw = stdout.trim()
          const m = raw.match(/v?\d+\.\d+\.\d+[^\s]*/)
          resolve({ ok: true, raw, version: m ? m[0] : raw })
        }
      })
    })
  )

  ipcMain.handle('minipit:sbx-releases', async () => {
    try {
      const res = await fetch('https://api.github.com/repos/docker/sbx-releases/releases?per_page=8', {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'den' }
      })
      if (!res.ok) throw new Error(`GitHub ${res.status}`)
      const data = (await res.json()) as Array<Record<string, unknown>>
      return data.map((r) => ({
        version: (r.tag_name as string) ?? '',
        name: (r.name as string) || (r.tag_name as string) || '',
        body: (r.body as string) ?? '',
        url: (r.html_url as string) ?? '',
        date: (r.published_at as string) ?? '',
        prerelease: Boolean(r.prerelease)
      }))
    } catch (err) {
      console.error('sbx-releases failed:', err)
      return []
    }
  })

  ipcMain.handle('minipit:sbx-install-info', async () => {
    const { manager, real } = await detectInstallManager()
    return {
      manager,
      real,
      canAutoUpdate: manager === 'brew' || manager === 'winget',
      releasesUrl: SBX_RELEASES_URL,
      updateCmd: displayCommand(manager, 'update'),
      redownloadCmd: displayCommand(manager, 'redownload')
    }
  })

  ipcMain.handle('minipit:sbx-update', async (_, action: 'update' | 'redownload') => {
    const { manager } = await detectInstallManager()
    const send = (chunk: string) => mainWindow?.webContents.send('minipit:runtime-output', chunk)
    const cmd = pkgCommand(manager, action)
    // Only brew/winget can run non-interactively from the GUI (apt needs sudo).
    if (!cmd || !(manager === 'brew' || manager === 'winget')) {
      send(`Auto-${action} isn't available for a "${manager}" install.\n`)
      send(manager === 'apt'
        ? `Run in a terminal:\n  ${displayCommand(manager, action)}\n`
        : `Download the latest build from:\n  ${SBX_RELEASES_URL}\n`)
      return { ok: false, code: -1 }
    }
    return await new Promise((resolve) => {
      const display = manager === 'brew' ? 'brew' : cmd.bin
      send(`$ ${display} ${cmd.args.join(' ')}\n\n`)
      const proc = spawn(cmd.bin, cmd.args, { env: guiEnv() })
      proc.stdout.on('data', (d) => send(d.toString()))
      proc.stderr.on('data', (d) => send(d.toString()))
      proc.on('error', (e) => { send(`\n[error] ${e.message}\n`); resolve({ ok: false, code: -1 }) })
      proc.on('close', (code) => { send(`\n[exit ${code}]\n`); resolve({ ok: code === 0, code: code ?? -1 }) })
    })
  })

  ipcMain.handle('minipit:network-policy', async (_, name?: string) => {
    try {
      const args = ['policy', 'ls']
      if (name) args.push(name)
      args.push('--type', 'network')
      const out = await sbx(args, { timeout: 12000 })
      return { ok: true, ...parsePolicyLs(out), raw: out }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  ipcMain.handle('minipit:policy-log', (_, name?: string) => fetchPolicyLog(name))

  ipcMain.handle('minipit:policy-allow', async (_, name: string, resources: string) => {
    try {
      const args = ['policy', 'allow', 'network']
      if (name) args.push('--sandbox', name)
      args.push(resources)
      const output = await sbx(args, { timeout: 15000 })
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Add a deny rule (block a host). Mirror of policy-allow. Comma-separated
  // resources and an optional per-sandbox scope are both supported by the CLI.
  ipcMain.handle('minipit:policy-deny', async (_, name: string, resources: string) => {
    try {
      const args = ['policy', 'deny', 'network']
      if (name) args.push('--sandbox', name)
      args.push(resources)
      const output = await sbx(args, { timeout: 15000 })
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Remove a local network rule by resource (the value shown as a chip). Only
  // effective when org governance is inactive — the renderer hides the control
  // otherwise.
  ipcMain.handle('minipit:policy-rm', async (_, name: string, resource: string) => {
    try {
      const args = ['policy', 'rm', 'network']
      if (name) args.push('--sandbox', name)
      args.push('--resource', resource)
      const output = await sbx(args, { timeout: 15000 })
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Set the default network preset non-interactively (open | balanced |
  // locked-down). Unlike `policy reset`, this doesn't prompt.
  ipcMain.handle('minipit:policy-set-default', async (_, preset: string) => {
    try {
      const output = await sbx(['policy', 'set-default', preset], { timeout: 15000 })
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  // Reset all custom network rules. `sbx policy reset` prompts for a new default
  // preset, so feed the chosen preset to stdin (timeout-guarded so it can never
  // hang the app if the prompt shape changes).
  ipcMain.handle('minipit:policy-reset', async (_, preset: string) => {
    try {
      const output = await sbxWithInput(['policy', 'reset'], `${preset}\n`, 20000)
      return { ok: true, output }
    } catch (err) {
      return { ok: false, error: (err instanceof Error ? err.message : String(err)).trim() }
    }
  })

  ipcMain.handle('minipit:default-workspace', () => {
    // Base folder for new sandboxes; each one gets its own ~/den/<name> subfolder.
    const dir = join(app.getPath('home'), 'den')
    try {
      require('fs').mkdirSync(dir, { recursive: true })
    } catch (err) {
      console.error('could not create default workspace base:', err)
    }
    return dir
  })

  ipcMain.handle('minipit:show-open-dialog', async () => {
    // createDirectory lets the user make a new workspace folder from the picker
    // (shown by default on macOS; gated by this flag on Windows/Linux).
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  // ── Per-sandbox appearance (color / icon) + group membership ──────────────
  // Persisted in the file-based electron-store (not the renderer's localStorage,
  // which is scoped to the dev-server origin and lost when the port shifts).
  // `sandboxIcons` (keyed by sandbox name) rides along on the same durable store
  // as the project appearance maps.
  // sandboxColors (name → hex) and sandboxGroups (name → group id) are per-sandbox
  // maps that ride the same durable store as the (legacy) project appearance maps.
  type ProjectConfig = { sandboxIcons: Record<string, string>; sandboxColors: Record<string, string>; sandboxGroups: Record<string, string> }
  const CFG_KEYS = { sandboxIcons: 'sandboxIcons', sandboxColors: 'sandboxColors', sandboxGroups: 'sandboxGroups' } as const
  const readProjectConfig = (): ProjectConfig => ({
    sandboxIcons: (store.get(CFG_KEYS.sandboxIcons) as Record<string, string>) ?? {},
    sandboxColors: (store.get(CFG_KEYS.sandboxColors) as Record<string, string>) ?? {},
    sandboxGroups: (store.get(CFG_KEYS.sandboxGroups) as Record<string, string>) ?? {}
  })

  // Named sandbox groups (id + name only). Stored as a JSON array.
  ipcMain.handle('minipit:groups-get', () => (store.get('groups') as { id: string; name: string }[]) ?? [])
  ipcMain.handle('minipit:groups-set', (_, groups: { id: string; name: string }[]) => { store.set('groups', groups ?? []) })

  // One-time-per-origin sync from the renderer: merge any localStorage-cached
  // config into the store (the store wins on conflict — it's the source of
  // truth), then return the authoritative merged config to hydrate the UI.
  ipcMain.handle('minipit:project-config-sync', (_, local: Partial<ProjectConfig>) => {
    for (const [field, key] of Object.entries(CFG_KEYS) as [keyof ProjectConfig, string][]) {
      const incoming = local?.[field] ?? {}
      const existing = (store.get(key) as Record<string, string>) ?? {}
      store.set(key, { ...incoming, ...existing })
    }
    return readProjectConfig()
  })

  // Per-sandbox working-tree isolation (name → true if created with --clone).
  ipcMain.handle('minipit:sandbox-isolation', () => (store.get('sandboxIsolation') as Record<string, boolean>) ?? {})

  ipcMain.handle('minipit:project-config-set', (_, field: keyof ProjectConfig, workspace: string, value: string | null) => {
    const key = CFG_KEYS[field]
    if (!key || !workspace) return
    const map = (store.get(key) as Record<string, string>) ?? {}
    if (value) map[workspace] = value
    else delete map[workspace]
    store.set(key, map)
  })

  // ── Shell PTY ──────────────────────────────────────────────────────────────

  ipcMain.handle('minipit:pty-start', (_, name: string, cols: number, rows: number) => {
    // Kill existing PTY for this sandbox
    const existing = ptyMap.get(name)
    if (existing) { existing.kill(); ptyMap.delete(name) }

    const proc = pty.spawn(getSbxPath(), ['exec', '-it', name, 'bash'], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME ?? '/',
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      } as Record<string, string>
    })

    ptyMap.set(name, proc)

    proc.onData((data: string) => {
      mainWindow?.webContents.send('minipit:pty-output', name, data)
    })

    proc.onExit(() => {
      ptyMap.delete(name)
      mainWindow?.webContents.send('minipit:pty-exit', name)
    })

    return null
  })

  ipcMain.handle('minipit:pty-write', (_, name: string, data: string) => {
    ptyMap.get(name)?.write(data)
  })

  ipcMain.handle('minipit:pty-resize', (_, name: string, cols: number, rows: number) => {
    ptyMap.get(name)?.resize(cols, rows)
  })

  ipcMain.handle('minipit:agent-write', (_, name: string, data: string) => {
    sbxProcesses.get(name)?.write(data)
  })

  // Copy a dropped file's bytes into the sandbox (under /tmp/den-dropped) and
  // return its absolute in-sandbox path. The agent is a terminal TUI that takes
  // a file path, not raw bytes, so the renderer types this path into the PTY.
  ipcMain.handle('minipit:agent-drop-file', async (_, name: string, fileName: string, bytes: Uint8Array): Promise<string | null> => {
    if (!sbxProcesses.get(name)) return null
    if (!bytes?.byteLength || bytes.byteLength > 100 * 1024 * 1024) return null // cap at 100 MB (docs/PDFs/decks)
    // Strip path components and shell-hostile chars; keep it short.
    const safe = ((fileName.split(/[\\/]/).pop() || 'file').replace(/[^A-Za-z0-9._-]/g, '_').slice(-120)) || 'file'
    return new Promise((resolve) => {
      const proc = spawn(getSbxPath(), [
        'exec', name, 'sh', '-c',
        'd=/tmp/den-dropped; mkdir -p "$d" && cat > "$d/$1" && printf %s "$d/$1"',
        'sh', safe
      ])
      let out = '', err = ''
      proc.stdout.on('data', (d) => { out += d.toString() })
      proc.stderr.on('data', (d) => { err += d.toString() })
      proc.on('error', () => resolve(null))
      proc.on('close', (code) => {
        if (code === 0 && out.trim()) resolve(out.trim())
        else { console.error('agent-drop-file failed:', err.trim() || `exit ${code}`); resolve(null) }
      })
      proc.stdin.write(Buffer.from(bytes))
      proc.stdin.end()
    })
  })

  ipcMain.handle('minipit:agent-resize', (_, name: string, cols: number, rows: number) => {
    sbxProcesses.get(name)?.resize(cols, rows)
  })

  // Ensure an agent session is attached (used when opening an already-running
  // sandbox that has no live session in this app instance).
  ipcMain.handle('minipit:agent-ensure', (_, name: string, cols: number, rows: number) => {
    const proc = sbxProcesses.get(name)
    if (!proc) {
      // No live session in this app instance. If the container is already
      // running, this is a reconnect — resume the claude agent's prior
      // conversation with --continue. (A stopped sandbox started here is a
      // fresh run; other agents don't take the claude --continue flag.)
      const sb = (lastGoodSandboxes ?? []).find((s) => s.name === name)
      const continueSession = sb?.status === 'running' && (sb.agent ?? '').startsWith('claude')
      spawnSandboxProcess(name, cols, rows, { continueSession })
    } else {
      // Session exists — nudge the size so the TUI repaints cleanly at this size.
      try { proc.resize(Math.max(2, cols - 1), rows) } catch { /* ignore */ }
      try { proc.resize(cols, rows) } catch { /* ignore */ }
    }
  })

  ipcMain.handle('minipit:pty-stop', (_, name: string) => {
    const proc = ptyMap.get(name)
    if (proc) { proc.kill(); ptyMap.delete(name) }
  })
}

function startPolling(): void {
  const poll = async () => {
    try {
      const sandboxes = await listSandboxes()
      mainWindow?.webContents.send('minipit:sandboxes-updated', sandboxes)
      updateTrayMenu(sandboxes)
      // Refresh the app menu's sandbox/project lists only when the sandbox set
      // changes — this avoids running `sbx template ls` on every poll tick.
      const sbxSig = JSON.stringify(sandboxes.map((s) => [s.name, s.status, s.workspace]))
      if (sbxSig !== lastMenuSandboxSig) { lastMenuSandboxSig = sbxSig; setAppMenu(sandboxes).catch(() => {}) }
    } catch { /* silent */ }
    // Canonical block detection: diff `sbx policy log` and push new denials.
    try { for (const b of await fetchPolicyLog()) emitBlock(b) } catch { /* silent */ }
  }
  poll()
  pollTimer = setInterval(poll, 5000)
}

// The finalize chime resumes an AudioContext with no user gesture. The
// per-window `autoplayPolicy` webPreference doesn't reliably ungate Web Audio
// in Chromium, so set the global switch too. Must run before app is ready.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

app.whenReady().then(() => {
  electronApp.setAppUserModelId('studio.den.app')
  app.on('browser-window-created', (_, window) => { optimizer.watchWindowShortcuts(window) })

  // Brand the running app: dock icon (dev shows the default Electron icon
  // otherwise) and the native "About den" panel (which pulls its icon/name from
  // the running app, so it'd be blank/Electron without this).
  // Use the tightly-cropped dock icon (logo.png has large transparent margins
  // that make the dock/About icon render small next to other apps).
  const dockIconPath = join(__dirname, '../../resources/icon/dock.png')
  const brandLogo = nativeImage.createFromPath(dockIconPath)
  if (process.platform === 'darwin' && !brandLogo.isEmpty()) app.dock?.setIcon(brandLogo)
  app.setAboutPanelOptions({
    applicationName: 'den',
    applicationVersion: `Version ${app.getVersion()}`,
    version: '',
    copyright: '© Docker · den.studio',
    iconPath: dockIconPath
  })

  // Content-Security-Policy for the renderer. Production loads only bundled
  // local assets (script-src 'self'); the sole remote resource is the Gravatar
  // avatar image, and all real network calls happen in the main process. Dev
  // additionally allows Vite's HMR (inline/eval scripts + its ws/http server).
  // 'unsafe-inline' in style-src is required for React inline style attributes.
  const CSP = [
    "default-src 'self'",
    is.dev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://www.gravatar.com",
    "font-src 'self' data:",
    "media-src 'self' data:",
    is.dev
      ? "connect-src 'self' ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:*"
      : "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'"
  ].join('; ')
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] } })
  })

  setAppMenu().catch(() => {})
  createWindow()
  createTray()
  setupIPC()
  startPolling()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else { mainWindow?.show(); mainWindow?.focus() }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (pollTimer) clearInterval(pollTimer)
  if (logTail) logTail.kill()
  for (const proc of sbxProcesses.values()) proc.kill()
  for (const proc of ptyMap.values()) proc.kill()
})
