import * as vscode from 'vscode'
import { execFile } from 'child_process'
import * as fs from 'fs'

// A minimal den frontend inside VSCode: list Docker Sandboxes (`sbx ls --json`)
// and act on them — Open in VSCode (Remote-SSH), Start, Stop, Open Shell. This
// intentionally mirrors a slice of den's main process over the same `sbx` CLI.

interface SbxSandbox {
  name: string
  agent?: string
  status: string
  socket_path?: string
  workspaces?: string[]
}

const SSH_FEATURE_KEY = 'feature.ssh'
const SSH_EXPERIMENTAL_KEY = 'platform.allowExperimentalFeatures'

function getSbxPath(): string {
  const configured = vscode.workspace.getConfiguration('den').get<string>('sbxPath')
  if (configured) return configured
  const candidates = ['/opt/homebrew/bin/sbx', '/usr/local/bin/sbx', '/usr/bin/sbx']
  return candidates.find((p) => { try { fs.accessSync(p); return true } catch { return false } }) ?? 'sbx'
}

function sbx(args: string[], timeout = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin` }
    execFile(getSbxPath(), args, { timeout, env }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout.trim())
    })
  })
}

async function listSandboxes(): Promise<SbxSandbox[]> {
  try {
    const data = JSON.parse(await sbx(['ls', '--json'])) as { sandboxes?: SbxSandbox[] } | SbxSandbox[]
    return Array.isArray(data) ? data : data.sandboxes ?? []
  } catch (e) {
    return []
  }
}

async function sbxSettingGet(key: string): Promise<string> {
  try { return (await sbx(['settings', 'get', key])).trim() } catch { return '' }
}

async function sshEnabled(): Promise<boolean> {
  return /true/i.test(await sbxSettingGet(SSH_FEATURE_KEY))
}

async function enableSsh(): Promise<boolean> {
  try {
    await sbx(['settings', 'set', SSH_EXPERIMENTAL_KEY, 'true'])
    await sbx(['settings', 'set', SSH_FEATURE_KEY, 'true'])
    try { await sbx(['daemon', 'stop'], 20000) } catch { /* may already be stopped */ }
    await sbx(['daemon', 'start'], 20000)
    for (let i = 0; i < 8; i++) {
      if (await sshEnabled()) return true
      await new Promise((r) => setTimeout(r, 1000))
    }
    return await sshEnabled()
  } catch {
    return false
  }
}

const DEFAULT_REMOTE_WORKSPACE = '/home/agent/workspace'

// `sbx ssh setup` writes a wildcard `Host *.sbx` block + managed key (idempotent),
// after which connecting is `ssh <name>.sbx` — the sandbox name is the hostname.
async function ensureSshSetup(): Promise<void> {
  await sbx(['ssh', 'setup'], 30000)
}

async function remoteWorkspacePath(name: string): Promise<string> {
  try {
    const out = (await sbx(['exec', name, 'sh', '-c', `cd ~/workspace 2>/dev/null && pwd || echo ${DEFAULT_REMOTE_WORKSPACE}`])).trim()
    return out || DEFAULT_REMOTE_WORKSPACE
  } catch { return DEFAULT_REMOTE_WORKSPACE }
}

async function openInVscode(raw: SbxSandbox): Promise<void> {
  if (!(await sshEnabled())) {
    const pick = await vscode.window.showInformationMessage(
      'Opening a sandbox in VSCode needs the experimental sbx SSH endpoint. Enable it now? (May briefly restart the sbx daemon.)',
      'Enable', 'Cancel'
    )
    if (pick !== 'Enable') return
    const ok = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Enabling sbx SSH endpoint…' },
      () => enableSsh()
    )
    if (!ok) { vscode.window.showErrorMessage('Could not enable the sbx SSH endpoint.'); return }
  }

  try { await ensureSshSetup() }
  catch (e) { vscode.window.showErrorMessage(`\`sbx ssh setup\` failed: ${(e as Error).message}`); return }

  // SSH auto-starts a stopped sandbox, but we start it explicitly so the
  // workspace-path probe and VSCode server install are smoother.
  const fresh = (await listSandboxes()).find((s) => s.name === raw.name) ?? raw
  if (fresh.status !== 'running') {
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Starting ${raw.name}…` },
        () => sbx(['run', '--name', raw.name], 60000)
      )
    } catch (e) {
      vscode.window.showErrorMessage(`Couldn't start ${raw.name}: ${(e as Error).message}`)
      return
    }
  }

  const remotePath = await remoteWorkspacePath(raw.name)
  const uri = vscode.Uri.parse(`vscode-remote://ssh-remote+${raw.name}.sbx${remotePath}`)
  await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true })
}

// ── Tree ─────────────────────────────────────────────────────────────────────

class SandboxItem extends vscode.TreeItem {
  constructor(public readonly raw: SbxSandbox) {
    super(raw.name, vscode.TreeItemCollapsibleState.None)
    const running = raw.status === 'running'
    this.description = `${raw.agent ?? ''}${raw.agent ? ' · ' : ''}${raw.status}`
    this.tooltip = `${raw.name}\n${raw.workspaces?.[0] ?? ''}\n${raw.status}`
    this.contextValue = running ? 'sandbox.running' : 'sandbox.stopped'
    this.iconPath = new vscode.ThemeIcon(running ? 'vm-active' : 'vm')
  }
}

class SandboxProvider implements vscode.TreeDataProvider<SandboxItem> {
  private _onDidChange = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this._onDidChange.event
  refresh(): void { this._onDidChange.fire() }
  getTreeItem(el: SandboxItem): vscode.TreeItem { return el }
  async getChildren(): Promise<SandboxItem[]> {
    const list = await listSandboxes()
    return list
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => new SandboxItem(s))
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SandboxProvider()
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('den.sandboxes', provider),
    vscode.commands.registerCommand('den.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('den.openInVscode', (item?: SandboxItem) => {
      if (item?.raw) return openInVscode(item.raw)
    }),
    vscode.commands.registerCommand('den.start', async (item?: SandboxItem) => {
      if (!item?.raw) return
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Starting ${item.raw.name}…` },
          () => sbx(['run', '--name', item.raw.name], 60000)
        )
      } catch (e) { vscode.window.showErrorMessage((e as Error).message) }
      provider.refresh()
    }),
    vscode.commands.registerCommand('den.stop', async (item?: SandboxItem) => {
      if (!item?.raw) return
      try { await sbx(['stop', item.raw.name], 30000) }
      catch (e) { vscode.window.showErrorMessage((e as Error).message) }
      provider.refresh()
    }),
    vscode.commands.registerCommand('den.openShell', (item?: SandboxItem) => {
      if (!item?.raw) return
      const term = vscode.window.createTerminal({ name: `den · ${item.raw.name}` })
      term.sendText(`${getSbxPath()} exec -it ${item.raw.name} bash`)
      term.show()
    })
  )

  // Light auto-refresh so lifecycle changes made elsewhere show up.
  const timer = setInterval(() => provider.refresh(), 15000)
  context.subscriptions.push({ dispose: () => clearInterval(timer) })
}

export function deactivate(): void { /* nothing to clean up */ }
