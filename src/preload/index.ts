import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// A static file bundled into a kit: copied to <kit>/files/<target>/<dest>.
interface KitFile { src: string; target: 'home' | 'workspace'; dest: string }

const api = {
  // UI density = a browser zoom factor applied to the whole window (scales every
  // element uniformly). Renderer-side webFrame call, so no IPC round-trip.
  setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
  listSandboxes: ()                     => ipcRenderer.invoke('den:list-sandboxes'),
  createSandbox: (config: unknown)      => ipcRenderer.invoke('den:create-sandbox', config),
  runSandbox:    (name: string)         => ipcRenderer.invoke('den:run-sandbox', name),
  stopSandbox:   (name: string)         => ipcRenderer.invoke('den:stop-sandbox', name),
  deleteSandbox: (name: string)         => ipcRenderer.invoke('den:delete-sandbox', name),
  getPorts:      (name: string)         => ipcRenderer.invoke('den:get-ports', name),
  portPublish:   (name: string, spec: string) => ipcRenderer.invoke('den:port-publish', name, spec),
  portUnpublish: (name: string, spec: string) => ipcRenderer.invoke('den:port-unpublish', name, spec),
  listFiles:     (name: string, relPath: string) => ipcRenderer.invoke('den:list-files', name, relPath),
  workspaceRoot: (name: string, hint: string) => ipcRenderer.invoke('den:workspace-root', name, hint),
  gitStatus:     (name: string, workspace: string) => ipcRenderer.invoke('den:git-status', name, workspace),
  isGitRepo:     (dir: string)          => ipcRenderer.invoke('den:is-git-repo', dir),
  gitInfo:       (dir: string)          => ipcRenderer.invoke('den:git-info', dir),
  gitInit:       (dir: string)          => ipcRenderer.invoke('den:git-init', dir),
  readFile:      (name: string, path: string) => ipcRenderer.invoke('den:read-file', name, path),
  readFileBytes: (name: string, path: string) => ipcRenderer.invoke('den:read-file-bytes', name, path),
  gitDiffFile:   (name: string, path: string) => ipcRenderer.invoke('den:git-diff-file', name, path),
  reviewSummary: (name: string, repoDir: string) => ipcRenderer.invoke('den:review-summary', name, repoDir),
  reviewFileDiff: (name: string, repoDir: string, branch: string | null, path: string) => ipcRenderer.invoke('den:review-file-diff', name, repoDir, branch, path),
  listBranches:  (repoDir: string) => ipcRenderer.invoke('den:list-branches', repoDir),
  prDefaults:    (repoDir: string, branch: string, base: string) => ipcRenderer.invoke('den:pr-defaults', repoDir, branch, base),
  sandboxCommit: (repoDir: string, message: string, paths?: string[]) => ipcRenderer.invoke('den:sandbox-commit', repoDir, message, paths),
  gitIgnoreAdd:  (name: string, repoDir: string, patterns: string[]) => ipcRenderer.invoke('den:git-ignore-add', name, repoDir, patterns),
  writeFile:     (name: string, path: string, content: string) => ipcRenderer.invoke('den:write-file', name, path, content),
  openPath:      (path: string)         => ipcRenderer.invoke('den:open-path', path),
  openFileWindow:(name: string, path: string, fileName: string, diff?: boolean, reviewBranch?: string | null) => ipcRenderer.invoke('den:open-file-window', name, path, fileName, diff, reviewBranch),
  deletePath:    (name: string, path: string) => ipcRenderer.invoke('den:delete-path', name, path),
  copyInto:      (name: string, destDir: string, files: { name: string; bytes: Uint8Array }[]) => ipcRenderer.invoke('den:copy-into', name, destDir, files),
  downloadFrom:  (name: string, path: string) => ipcRenderer.invoke('den:download-from', name, path),
  signOut:       ()                     => ipcRenderer.invoke('den:sign-out'),
  generatePalette: (hex: string, size?: number) => ipcRenderer.invoke('den:generate-palette', hex, size),
  listTemplates: ()                     => ipcRenderer.invoke('den:list-templates'),
  removeTemplate:(ref: string)          => ipcRenderer.invoke('den:remove-template', ref),
  templatePush:  (ref: string)          => ipcRenderer.invoke('den:template-push', ref),
  storageUsage: ()                      => ipcRenderer.invoke('den:storage-usage'),
  createKit:     (name: string, spec: string, files?: KitFile[]) => ipcRenderer.invoke('den:create-kit', name, spec, files),
  pickFiles:     ()                     => ipcRenderer.invoke('den:pick-files'),
  listKits:      ()                     => ipcRenderer.invoke('den:list-kits'),
  kitAdd:        (sandbox: string, dir: string) => ipcRenderer.invoke('den:kit-add', sandbox, dir),
  appliedKits:   (sandbox: string)      => ipcRenderer.invoke('den:applied-kits', sandbox),
  readKit:       (dir: string)          => ipcRenderer.invoke('den:read-kit', dir),
  updateKit:     (dir: string, spec: string, files?: KitFile[]) => ipcRenderer.invoke('den:update-kit', dir, spec, files),
  listKitFiles:  (dir: string)          => ipcRenderer.invoke('den:list-kit-files', dir),
  removeKitFile: (dir: string, target: string, dest: string) => ipcRenderer.invoke('den:remove-kit-file', dir, target, dest),
  removeKit:     (dir: string)          => ipcRenderer.invoke('den:remove-kit', dir),
  kitPush:       (dir: string, ref: string) => ipcRenderer.invoke('den:kit-push', dir, ref),
  kitValidate:   (dir: string)          => ipcRenderer.invoke('den:kit-validate', dir),
  kitPack:       (dir: string, name: string) => ipcRenderer.invoke('den:kit-pack', dir, name),
  saveSnapshot:  (name: string, tag: string) => ipcRenderer.invoke('den:save-snapshot', name, tag),
  kitImport:     (ref: string)          => ipcRenderer.invoke('den:kit-import', ref),
  kitImportZip:  ()                     => ipcRenderer.invoke('den:kit-import-zip'),
  kitImportFolder: ()                   => ipcRenderer.invoke('den:kit-import-folder'),
  kitImportGit:  (url: string, pickDir?: string) => ipcRenderer.invoke('den:kit-import-git', url, pickDir),
  listHubKits:   ()                     => ipcRenderer.invoke('den:list-hub-kits'),
  dockerAccount: ()                     => ipcRenderer.invoke('den:docker-account'),
  dockerLogin:   ()                     => ipcRenderer.invoke('den:docker-login'),
  dockerLogout:  ()                     => ipcRenderer.invoke('den:docker-logout'),
  listSecrets:   ()                     => ipcRenderer.invoke('den:list-secrets'),
  secretImport:  ()                     => ipcRenderer.invoke('den:secret-import'),
  setSecret:     (service: string, value: string, scope?: string) => ipcRenderer.invoke('den:set-secret', service, value, scope),
  setSecretOp:   (service: string, ref: string, scope?: string)   => ipcRenderer.invoke('den:set-secret-op', service, ref, scope),
  opAvailable:   ()                     => ipcRenderer.invoke('den:op-available'),
  removeSecret:  (service: string, scope?: string) => ipcRenderer.invoke('den:remove-secret', service, scope),
  anthropicOAuth:()                     => ipcRenderer.invoke('den:anthropic-oauth'),
  oauthSecret:   (service: string)      => ipcRenderer.invoke('den:oauth-secret', service),
  openInFinder:  (path: string)         => ipcRenderer.invoke('den:open-in-finder', path),
  exec:          (name: string, cmd: string) => ipcRenderer.invoke('den:exec', name, cmd),
  listLogs:      ()                     => ipcRenderer.invoke('den:list-logs'),
  startLogTail:  (path: string)         => ipcRenderer.invoke('den:start-log-tail', path),
  stopLogTail:   ()                     => ipcRenderer.invoke('den:stop-log-tail'),
  sandboxLog:    (name: string, which: 'kit' | 'sandbox') => ipcRenderer.invoke('den:sandbox-log', name, which),
  onLogTail: (cb: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
    ipcRenderer.on('den:log-tail', handler)
    return () => ipcRenderer.removeListener('den:log-tail', handler)
  },
  getSettings:   ()                     => ipcRenderer.invoke('den:get-settings'),
  saveSettings:  (s: unknown)           => ipcRenderer.invoke('den:save-settings', s),
  sbxVersion:    (path?: string)        => ipcRenderer.invoke('den:sbx-version', path),
  sbxReleases:   ()                     => ipcRenderer.invoke('den:sbx-releases'),
  sbxInstallInfo: ()                    => ipcRenderer.invoke('den:sbx-install-info'),
  sbxUpdate:     (action: string)       => ipcRenderer.invoke('den:sbx-update', action),
  sbxSettingSet: (key: string, value: string) => ipcRenderer.invoke('den:sbx-setting-set', key, value),
  sbxSettingGet: (key: string) => ipcRenderer.invoke('den:sbx-setting-get', key),
  sbxReset:      (preserveSecrets: boolean) => ipcRenderer.invoke('den:sbx-reset', preserveSecrets),
  diagnose:      (mode?: 'text' | 'json' | 'github-issue' | 'upload') => ipcRenderer.invoke('den:diagnose', mode),
  daemonRestart: ()                     => ipcRenderer.invoke('den:daemon-restart'),
  daemonStatus:  ()                     => ipcRenderer.invoke('den:daemon-status'),
  daemonLogLevel:(level?: string)       => ipcRenderer.invoke('den:daemon-log-level', level),
  sbxInspect:    (name: string)         => ipcRenderer.invoke('den:sbx-inspect', name),
  claudeAccount: (name: string)         => ipcRenderer.invoke('den:claude-account', name),
  setRuntimeEnv: (key: string, value: string | boolean | null) => ipcRenderer.invoke('den:set-runtime-env', key, value),
  onDiagnoseOutput: (cb: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
    ipcRenderer.on('den:diagnose-output', handler)
    return () => ipcRenderer.removeListener('den:diagnose-output', handler)
  },
  onDaemonOutput: (cb: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
    ipcRenderer.on('den:daemon-output', handler)
    return () => ipcRenderer.removeListener('den:daemon-output', handler)
  },
  skillsImport:  (opts?: { dryRun?: boolean }) => ipcRenderer.invoke('den:skills-import', opts),
  setTerminalApp: (id: string)          => ipcRenderer.invoke('den:terminal-app', id),
  openSshTerminal: (name: string)       => ipcRenderer.invoke('den:open-ssh-terminal', name),
  sshStatus:     ()                     => ipcRenderer.invoke('den:ssh-status'),
  sshSetup:      ()                     => ipcRenderer.invoke('den:ssh-setup'),
  openRemoteEditor: (name: string, workspace: string, editor?: string) =>
    ipcRenderer.invoke('den:open-remote-editor', name, workspace, editor),
  openRemoteApp: (name: string, app: string, agent?: string) =>
    ipcRenderer.invoke('den:open-remote-app', name, app, agent),
  networkPolicy: (name?: string)        => ipcRenderer.invoke('den:network-policy', name),
  policyLog:     (name?: string)        => ipcRenderer.invoke('den:policy-log', name),
  policyCheck:   (resource: string, name?: string) => ipcRenderer.invoke('den:policy-check', resource, name),
  policyAllow:   (name: string, resources: string) => ipcRenderer.invoke('den:policy-allow', name, resources),
  policyDeny:    (name: string, resources: string) => ipcRenderer.invoke('den:policy-deny', name, resources),
  policyRm:      (name: string, resource: string) => ipcRenderer.invoke('den:policy-rm', name, resource),
  policySetDefault: (preset: string)    => ipcRenderer.invoke('den:policy-set-default', preset),
  policyReset:   (preset: string)       => ipcRenderer.invoke('den:policy-reset', preset),
  onRuntimeOutput: (cb: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
    ipcRenderer.on('den:runtime-output', handler)
    return () => ipcRenderer.removeListener('den:runtime-output', handler)
  },
  onCreateOutput: (cb: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
    ipcRenderer.on('den:create-output', handler)
    return () => ipcRenderer.removeListener('den:create-output', handler)
  },
  onLoginOutput: (cb: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
    ipcRenderer.on('den:login-output', handler)
    return () => ipcRenderer.removeListener('den:login-output', handler)
  },
  showOpenDialog:()                     => ipcRenderer.invoke('den:show-open-dialog'),
  defaultWorkspace: ()                  => ipcRenderer.invoke('den:default-workspace'),
  projectConfigSync: (local: unknown)   => ipcRenderer.invoke('den:project-config-sync', local),
  projectConfigSet: (field: string, workspace: string, value: string | null) => ipcRenderer.invoke('den:project-config-set', field, workspace, value),
  sandboxIsolation: ()                  => ipcRenderer.invoke('den:sandbox-isolation'),
  groupsGet: ()                         => ipcRenderer.invoke('den:groups-get'),
  groupsSet: (groups: unknown)          => ipcRenderer.invoke('den:groups-set', groups),
  sandboxFetchWork: (name: string, repoDir: string) => ipcRenderer.invoke('den:sandbox-fetch-work', name, repoDir),
  sandboxOpenPr: (repoDir: string, branch: string, opts?: { base?: string; title?: string; body?: string }) => ipcRenderer.invoke('den:sandbox-open-pr', repoDir, branch, opts),
  sandboxMergeBranch: (repoDir: string, branch: string) => ipcRenderer.invoke('den:sandbox-merge-branch', repoDir, branch),
  autoSyncGet: ()                       => ipcRenderer.invoke('den:auto-sync-get'),
  autoSyncSet: (name: string, on: boolean) => ipcRenderer.invoke('den:auto-sync-set', name, on),
  mountsGet:   (name: string)           => ipcRenderer.invoke('den:mounts-get', name),
  sbxMount:    (name: string, host: string, target: string, ro: boolean) => ipcRenderer.invoke('den:sbx-mount', name, host, target, ro),
  sbxUmount:   (name: string, host: string, target: string) => ipcRenderer.invoke('den:sbx-umount', name, host, target),

  onSandboxesUpdated: (cb: (sandboxes: unknown[]) => void) => {
    const handler = (_: Electron.IpcRendererEvent, s: unknown[]) => cb(s)
    ipcRenderer.on('den:sandboxes-updated', handler)
    return () => ipcRenderer.removeListener('den:sandboxes-updated', handler)
  },
  onLogLine: (cb: (name: string, line: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string, line: unknown) => cb(name, line)
    ipcRenderer.on('den:log-line', handler)
    return () => ipcRenderer.removeListener('den:log-line', handler)
  },
  onPolicyBlock: (cb: (block: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, block: unknown) => cb(block)
    ipcRenderer.on('den:policy-block', handler)
    return () => ipcRenderer.removeListener('den:policy-block', handler)
  },
  // An agent's API connection failed (closed mid-response, ECONNRESET, …), with
  // the host-side circumstances captured at that moment.
  onApiError: (cb: (trace: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, trace: unknown) => cb(trace)
    ipcRenderer.on('den:api-error', handler)
    return () => ipcRenderer.removeListener('den:api-error', handler)
  },
  // Is the installed sbx new enough for the CLI dialect den speaks?
  mainBuildId: ()      => ipcRenderer.invoke('den:build-id'),
  sbxVersionCheck: ()  => ipcRenderer.invoke('den:sbx-version-check'),
  // den-managed sbx runtime: den downloads and runs a pinned copy instead of
  // whatever is installed. See docs/managed-runtime-plan.md.
  runtimeSetupState: ()                     => ipcRenderer.invoke('den:runtime-setup-state'),
  pickSbxBinary: ()                         => ipcRenderer.invoke('den:pick-sbx-binary'),
  runtimeStatus:  ()                        => ipcRenderer.invoke('den:runtime-status'),
  runtimeSetSource: (source: 'managed' | 'system') => ipcRenderer.invoke('den:runtime-source', source),
  runtimeInstall: ()                        => ipcRenderer.invoke('den:runtime-install'),
  runtimeRevert:  ()                        => ipcRenderer.invoke('den:runtime-revert'),
  onRuntimeProgress: (cb: (p: { phase: string; got: number; total: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, p: { phase: string; got: number; total: number }) => cb(p)
    ipcRenderer.on('den:runtime-progress', handler)
    return () => ipcRenderer.removeListener('den:runtime-progress', handler)
  },
  // Arrived in sbx v0.39; den 0.11.0 requires v0.42+ outright (MIN_SBX_VERSION
  // in main), which covers it unconditionally.
  pruneSandboxes: (olderThan?: string) => ipcRenderer.invoke('den:prune-sandboxes', olderThan),
  setSecretDynamic: (opts: unknown)    => ipcRenderer.invoke('den:set-secret-dynamic', opts),
  kitSign:   (ref: string)             => ipcRenderer.invoke('den:kit-sign', ref),
  kitVerify: (ref: string)             => ipcRenderer.invoke('den:kit-verify', ref),
  onKitSignOutput: (cb: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
    ipcRenderer.on('den:kit-sign-output', handler)
    return () => ipcRenderer.removeListener('den:kit-sign-output', handler)
  },
  envDiscover: ()                            => ipcRenderer.invoke('den:env-discover'),
  envProvisioned: ()                         => ipcRenderer.invoke('den:env-provisioned'),
  envRead:   (path: string)                  => ipcRenderer.invoke('den:env-read', path),
  envPick:   ()                              => ipcRenderer.invoke('den:env-pick'),
  envCreate: (paths: string[], name?: string) => ipcRenderer.invoke('den:env-create', paths, name),
  envRemove: (name: string)                  => ipcRenderer.invoke('den:env-rm', name),
  onEnvOutput: (cb: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
    ipcRenderer.on('den:env-output', handler)
    return () => ipcRenderer.removeListener('den:env-output', handler)
  },
  // MCP gateway (sbx v0.38): servers registered once on the host, reused by
  // sandboxes. OAuth stays host-side, so den only drives the CLI.
  mcpList:    ()                    => ipcRenderer.invoke('den:mcp-list'),
  mcpAdd:     (cfg: unknown)        => ipcRenderer.invoke('den:mcp-add', cfg),
  mcpRemove:  (name: string)        => ipcRenderer.invoke('den:mcp-remove', name),
  mcpLoad:    (name: string, sandbox: string) => ipcRenderer.invoke('den:mcp-load', name, sandbox),
  mcpInspect: (name: string)        => ipcRenderer.invoke('den:mcp-inspect', name),
  mcpAuth:    (name: string)        => ipcRenderer.invoke('den:mcp-auth', name),
  onMcpAuthOutput: (cb: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
    ipcRenderer.on('den:mcp-auth-output', handler)
    return () => ipcRenderer.removeListener('den:mcp-auth-output', handler)
  },
  apiTraces:       ()  => ipcRenderer.invoke('den:api-traces'),
  revealApiTraces: ()  => ipcRenderer.invoke('den:reveal-api-traces'),
  // A launch that `sbx run` refused (bad workspace, runtime error) — the message
  // it printed before exiting, so the UI can show it instead of losing it.
  onSandboxError: (cb: (err: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, err: unknown) => cb(err)
    ipcRenderer.on('den:sandbox-error', handler)
    return () => ipcRenderer.removeListener('den:sandbox-error', handler)
  },
  onAgentActivity: (cb: (name: string, state: 'working' | 'waiting' | null) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string, state: 'working' | 'waiting' | null) => cb(name, state)
    ipcRenderer.on('den:agent-activity', handler)
    return () => ipcRenderer.removeListener('den:agent-activity', handler)
  },
  onAgentAttention: (cb: (name: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string) => cb(name)
    ipcRenderer.on('den:agent-attention', handler)
    return () => ipcRenderer.removeListener('den:agent-attention', handler)
  },
  onFilesChanged: (cb: (name: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string) => cb(name)
    ipcRenderer.on('den:files-changed', handler)
    return () => ipcRenderer.removeListener('den:files-changed', handler)
  },
  // A Claude Code statusline payload arrived for a sandbox (context usage,
  // cost, rate limits, …) — see AgentStatusLine in main/index.ts.
  onAgentStatus: (cb: (name: string, status: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string, status: unknown) => cb(name, status)
    ipcRenderer.on('den:agent-status', handler)
    return () => ipcRenderer.removeListener('den:agent-status', handler)
  },
  onNavigate: (cb: (page: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, page: string) => cb(page)
    ipcRenderer.on('den:navigate', handler)
    return () => ipcRenderer.removeListener('den:navigate', handler)
  },
  onOpenSandbox: (cb: (name: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string) => cb(name)
    ipcRenderer.on('den:open-sandbox', handler)
    return () => ipcRenderer.removeListener('den:open-sandbox', handler)
  },
  onOpenModal: (cb: (modal: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, modal: string) => cb(modal)
    ipcRenderer.on('den:open-modal', handler)
    return () => ipcRenderer.removeListener('den:open-modal', handler)
  },
  onSetTab: (cb: (tab: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, tab: string) => cb(tab)
    ipcRenderer.on('den:set-tab', handler)
    return () => ipcRenderer.removeListener('den:set-tab', handler)
  },
  onStopActive: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('den:stop-active', handler)
    return () => ipcRenderer.removeListener('den:stop-active', handler)
  },
  // Which sandbox is open, mirrored to main so the Sandboxes menu can mark it and
  // hang the keyboard accelerators off that sandbox's own items.
  setActiveSandbox: (name: string | null) => ipcRenderer.invoke('den:active-sandbox', name),
  // A menu action aimed at a NAMED sandbox (not whichever is active). The
  // renderer runs these because it owns the optimistic status updates.
  onSandboxAction: (cb: (name: string, action: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string, action: string) => cb(name, action)
    ipcRenderer.on('den:sandbox-action', handler)
    return () => ipcRenderer.removeListener('den:sandbox-action', handler)
  },

  agentWrite: (name: string, data: string) => ipcRenderer.invoke('den:agent-write', name, data),
  agentDropFile: (name: string, fileName: string, bytes: Uint8Array): Promise<string | null> =>
    ipcRenderer.invoke('den:agent-drop-file', name, fileName, bytes),
  agentResize: (name: string, cols: number, rows: number) => ipcRenderer.invoke('den:agent-resize', name, cols, rows),
  agentEnsure: (name: string, cols: number, rows: number) => ipcRenderer.invoke('den:agent-ensure', name, cols, rows),
  setTermMode: (mode: 'light' | 'dark') => ipcRenderer.invoke('den:term-mode', mode),
  onAgentOutput: (cb: (name: string, data: string, replay?: boolean) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string, data: string, replay?: boolean) => cb(name, data, replay)
    ipcRenderer.on('den:agent-output', handler)
    return () => ipcRenderer.removeListener('den:agent-output', handler)
  },
  onAgentExit: (cb: (name: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string) => cb(name)
    ipcRenderer.on('den:agent-exit', handler)
    return () => ipcRenderer.removeListener('den:agent-exit', handler)
  },
  ptyStart:  (name: string, cols: number, rows: number) => ipcRenderer.invoke('den:pty-start', name, cols, rows),
  ptyWrite:  (name: string, data: string)               => ipcRenderer.invoke('den:pty-write', name, data),
  ptyResize: (name: string, cols: number, rows: number) => ipcRenderer.invoke('den:pty-resize', name, cols, rows),
  ptyStop:   (name: string)                             => ipcRenderer.invoke('den:pty-stop', name),

  onPtyOutput: (cb: (name: string, data: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string, data: string) => cb(name, data)
    ipcRenderer.on('den:pty-output', handler)
    return () => ipcRenderer.removeListener('den:pty-output', handler)
  },
  onPtyExit: (cb: (name: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string) => cb(name)
    ipcRenderer.on('den:pty-exit', handler)
    return () => ipcRenderer.removeListener('den:pty-exit', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('den', api)
  } catch (e) {
    console.error(e)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.den = api
}
