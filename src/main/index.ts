import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  shell,
  nativeImage,
  dialog
} from 'electron'
import { join } from 'path'
import http from 'http'
import { randomBytes, createHash } from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { execFile, spawn } from 'child_process'
import Store from 'electron-store'
import pty from 'node-pty'

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
    execFile(getSbxPath(), args, { timeout: opts?.timeout ?? 10000 }, (err, stdout, stderr) => {
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
  ports?: Array<{ host: string; sandbox: string; protocol: string }>
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
    ports: raw.ports?.map((p) => ({
      host: parseInt(p.host),
      container: parseInt(p.sandbox),
      protocol: p.protocol?.toUpperCase() ?? 'TCP',
      active: true
    })) ?? [],
    logs: [] as unknown[]
  }
}

async function listSandboxes() {
  try {
    const out = await sbx(['ls', '--json'])
    const parsed = JSON.parse(out)
    const sandboxes: SbxSandbox[] = parsed.sandboxes ?? parsed
    return sandboxes.map(normalizeSandbox)
  } catch (err) {
    console.error('sbx ls failed:', err)
    return []
  }
}

async function getPortsForSandbox(name: string) {
  try {
    const out = await sbx(['ports', name, '--json'])
    const data = JSON.parse(out)
    return (data.ports ?? []).map((p: { host_port: number; sandbox_port: number; protocol: string }) => ({
      host: p.host_port,
      container: p.sandbox_port,
      protocol: (p.protocol ?? 'tcp').toUpperCase(),
      active: true
    }))
  } catch {
    return []
  }
}

// Like sbx() but pipes `input` to the child's stdin (for `secret set`).
function sbxWithInput(args: string[], input: string, timeout = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getSbxPath(), args, { timeout })
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
        if (rState && rState !== state) { res.writeHead(400); res.end('State mismatch'); return }
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<body style="font-family:sans-serif;padding:40px"><h2>✓ Connected. You can close this tab and return to minipit.</h2></body>')
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
      shell.openExternal(authUrl)
    })

    setTimeout(() => {
      try { server.close() } catch { /* ignore */ }
      reject(new Error('OAuth timed out (no response within 3 minutes)'))
    }, 180000)
  })
}

// Parse the `sbx secret ls` table (columns separated by 2+ spaces).
async function listSecrets(): Promise<StoredSecret[]> {
  try {
    const out = await sbx(['secret', 'ls', '-g'])
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
  const cmd =
    "find \"$1\" -maxdepth 1 -mindepth 1 -printf '%y\\t%s\\t%f\\n' 2>/dev/null"
  const out = await sbx(['exec', name, 'sh', '-c', cmd, 'sh', dir || '.'])

  const entries: FileEntry[] = []
  for (const line of out.split('\n')) {
    if (!line) continue
    const [type, sizeStr, ...rest] = line.split('\t')
    const fname = rest.join('\t')
    if (!fname) continue
    const isDir = type === 'd'
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
function spawnSandboxProcess(name: string, cols = 80, rows = 24) {
  const existing = sbxProcesses.get(name)
  if (existing) {
    existing.kill()
    sbxProcesses.delete(name)
  }

  const proc = pty.spawn(getSbxPath(), ['run', name], {
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

  proc.onData((data) => {
    mainWindow?.webContents.send('minipit:agent-output', name, data)
  })

  proc.onExit(() => {
    sbxProcesses.delete(name)
    uptimeMap.delete(name)
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
  const logoPath = join(__dirname, '../../resources/logo.png')
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
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  const logoPath = join(__dirname, '../../resources/logo.png')
  const img = nativeImage.createFromPath(logoPath).resize({ width: 16, height: 16 })
  img.setTemplateImage(true)
  tray = new Tray(img)
  tray.setToolTip('minipit')
  tray.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) mainWindow.focus()
    else {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function setAppMenu(): void {
  const send = (channel: string, ...args: unknown[]) =>
    mainWindow?.webContents.send(channel, ...args)

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'minipit',
      submenu: [
        { label: 'About minipit', role: 'about' },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'Cmd+,', click: () => send('minipit:navigate', 'settings') },
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
        { label: 'New Sandbox…', accelerator: 'Cmd+N', click: () => send('minipit:open-modal', 'new-sandbox') },
        { type: 'separator' },
        { label: 'Close Window', accelerator: 'Cmd+W', role: 'close' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Terminal', accelerator: 'Cmd+1', click: () => send('minipit:set-tab', 'terminal') },
        { label: 'Info', accelerator: 'Cmd+2', click: () => send('minipit:set-tab', 'info') },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'Cmd+R', role: 'reload' },
        { label: 'Toggle DevTools', role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Sandbox',
      submenu: [
        { label: 'New Sandbox…', accelerator: 'Cmd+N', click: () => send('minipit:open-modal', 'new-sandbox') },
        { type: 'separator' },
        { label: 'Stop Sandbox', accelerator: 'Cmd+.', click: () => send('minipit:stop-active') },
        { type: 'separator' },
        { label: 'Open in Finder', accelerator: 'Shift+Cmd+F', click: () => send('minipit:open-in-finder') }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
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
    await sbx(['stop', name])
    uptimeMap.delete(name)
  })

  ipcMain.handle('minipit:delete-sandbox', async (_, name: string) => {
    const proc = sbxProcesses.get(name)
    if (proc) {
      proc.kill()
      sbxProcesses.delete(name)
    }
    await sbx(['rm', '--force', name])
    uptimeMap.delete(name)
  })

  ipcMain.handle('minipit:create-sandbox', async (_, config: {
    agent: string
    workspace: string
    memory?: string
    branch?: boolean
    name?: string
    template?: string
  }) => {
    const args = ['create']
    if (config.name) args.push('--name', config.name)
    if (config.memory) args.push('-m', config.memory)
    if (config.branch) args.push('--clone')
    if (config.template) args.push('-t', config.template)
    args.push(config.agent, config.workspace)
    const out = await sbx(args, { timeout: 120000 })
    // `sbx create` prints e.g. "✓ Created sandbox 'claude-foo'" plus extra lines,
    // so parse the quoted name rather than using the whole message.
    const match = out.match(/sandbox ['"]([^'"]+)['"]/i)
    const sandboxName =
      config.name ?? match?.[1] ?? `${config.agent}-${config.workspace.split('/').pop()}`
    // The agent session is started by the Agent terminal (agent-ensure) at the
    // terminal's real size — avoids a default-size session that renders garbled.
    return sandboxName
  })

  ipcMain.handle('minipit:get-ports', async (_, name: string) => {
    return getPortsForSandbox(name)
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

  // ── Kits ───────────────────────────────────────────────────────────────
  // Kit artifacts authored under ~/minipit-kits/<name>/ (spec.yaml + files/).
  ipcMain.handle('minipit:create-kit', async (_, name: string, specYaml: string) => {
    const fs = require('fs')
    const base = join(app.getPath('home'), 'minipit-kits', name)
    fs.mkdirSync(join(base, 'files'), { recursive: true })
    fs.writeFileSync(join(base, 'spec.yaml'), specYaml)
    const zip = join(app.getPath('home'), 'minipit-kits', `${name}.zip`)
    // pack validates the spec and produces the ZIP artifact.
    const output = await sbx(['kit', 'pack', base, '-o', zip], { timeout: 30000 })
    return { dir: base, zip, output }
  })

  ipcMain.handle('minipit:list-kits', () => {
    const fs = require('fs')
    const base = join(app.getPath('home'), 'minipit-kits')
    try {
      return (fs.readdirSync(base, { withFileTypes: true }) as { name: string; isDirectory: () => boolean }[])
        .filter((d) => d.isDirectory())
        .map((d) => {
          const dir = join(base, d.name)
          let kind = 'mixin'
          try {
            const spec = fs.readFileSync(join(dir, 'spec.yaml'), 'utf8') as string
            const m = spec.match(/kind:\s*(\w+)/)
            if (m) kind = m[1]
          } catch {
            return null
          }
          return { name: d.name, kind, dir, hasZip: fs.existsSync(join(base, `${d.name}.zip`)) }
        })
        .filter(Boolean)
    } catch {
      return []
    }
  })

  ipcMain.handle('minipit:remove-kit', (_, dir: string) => {
    const fs = require('fs')
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch (err) { console.error(err) }
  })

  ipcMain.handle('minipit:git-status', (_, name: string, workspace: string) => gitStatus(name, workspace))

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
    if (/^https?:\/\//i.test(path)) return shell.openExternal(path)
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

  ipcMain.handle('minipit:list-secrets', () => listSecrets())

  ipcMain.handle('minipit:set-secret', async (_, service: string, value: string) => {
    await sbxWithInput(['secret', 'set', '-g', service], value.endsWith('\n') ? value : value + '\n')
  })

  ipcMain.handle('minipit:remove-secret', async (_, service: string) => {
    await sbx(['secret', 'rm', '-g', service, '-f'])
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
    const expanded = path.replace(/^~/, app.getPath('home'))
    shell.showItemInFolder(expanded)
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

  ipcMain.handle('minipit:get-settings', () => ({
    sbxPath: getSbxPath(),
    pollFocused: (store.get('pollFocused') as string) ?? '5s',
    pollBackground: (store.get('pollBackground') as string) ?? '30s',
    launchAtLogin: (store.get('launchAtLogin') as boolean) ?? true,
    menuBarOnly: (store.get('menuBarOnly') as boolean) ?? true,
    notifyOnExit: (store.get('notifyOnExit') as boolean) ?? true,
    notifyOnError: (store.get('notifyOnError') as boolean) ?? true
  }))

  ipcMain.handle('minipit:save-settings', (_, settings: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(settings)) store.set(k, v)
    if (typeof settings.launchAtLogin === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin })
    }
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
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'minipit' }
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

  ipcMain.handle('minipit:sbx-brew', (_, action: 'update' | 'redownload') =>
    new Promise((resolve) => {
      const brew = getBrewPath()
      const args =
        action === 'redownload'
          ? ['reinstall', '--cask', 'docker/tap/sbx']
          : ['upgrade', '--cask', 'docker/tap/sbx']
      const send = (chunk: string) => mainWindow?.webContents.send('minipit:runtime-output', chunk)
      send(`$ brew ${args.join(' ')}\n\n`)
      const proc = spawn(brew, args, { env: { ...process.env } })
      proc.stdout.on('data', (d) => send(d.toString()))
      proc.stderr.on('data', (d) => send(d.toString()))
      proc.on('error', (e) => {
        send(`\n[error] ${e.message}\n`)
        resolve({ ok: false, code: -1 })
      })
      proc.on('close', (code) => {
        send(`\n[exit ${code}]\n`)
        resolve({ ok: code === 0, code: code ?? -1 })
      })
    })
  )

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

  ipcMain.handle('minipit:default-workspace', () => {
    // Shared default workspace folder for new sandboxes, created on first use.
    const dir = join(app.getPath('home'), 'minipit')
    try {
      require('fs').mkdirSync(dir, { recursive: true })
    } catch (err) {
      console.error('could not create default workspace:', err)
    }
    return dir
  })

  ipcMain.handle('minipit:show-open-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
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

  ipcMain.handle('minipit:agent-resize', (_, name: string, cols: number, rows: number) => {
    sbxProcesses.get(name)?.resize(cols, rows)
  })

  // Ensure an agent session is attached (used when opening an already-running
  // sandbox that has no live session in this app instance).
  ipcMain.handle('minipit:agent-ensure', (_, name: string, cols: number, rows: number) => {
    const proc = sbxProcesses.get(name)
    if (!proc) {
      // No live session yet — start one at the terminal's real size.
      spawnSandboxProcess(name, cols, rows)
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
    } catch { /* silent */ }
  }
  poll()
  pollTimer = setInterval(poll, 5000)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.minipit.app')
  app.on('browser-window-created', (_, window) => { optimizer.watchWindowShortcuts(window) })

  setAppMenu()
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
