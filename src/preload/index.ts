import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // UI density = a browser zoom factor applied to the whole window (scales every
  // element uniformly). Renderer-side webFrame call, so no IPC round-trip.
  setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
  listSandboxes: ()                     => ipcRenderer.invoke('minipit:list-sandboxes'),
  createSandbox: (config: unknown)      => ipcRenderer.invoke('minipit:create-sandbox', config),
  runSandbox:    (name: string)         => ipcRenderer.invoke('minipit:run-sandbox', name),
  stopSandbox:   (name: string)         => ipcRenderer.invoke('minipit:stop-sandbox', name),
  deleteSandbox: (name: string)         => ipcRenderer.invoke('minipit:delete-sandbox', name),
  getPorts:      (name: string)         => ipcRenderer.invoke('minipit:get-ports', name),
  portPublish:   (name: string, spec: string) => ipcRenderer.invoke('minipit:port-publish', name, spec),
  portUnpublish: (name: string, spec: string) => ipcRenderer.invoke('minipit:port-unpublish', name, spec),
  listFiles:     (name: string, relPath: string) => ipcRenderer.invoke('minipit:list-files', name, relPath),
  gitStatus:     (name: string, workspace: string) => ipcRenderer.invoke('minipit:git-status', name, workspace),
  isGitRepo:     (dir: string)          => ipcRenderer.invoke('minipit:is-git-repo', dir),
  gitInfo:       (dir: string)          => ipcRenderer.invoke('minipit:git-info', dir),
  gitInit:       (dir: string)          => ipcRenderer.invoke('minipit:git-init', dir),
  readFile:      (name: string, path: string) => ipcRenderer.invoke('minipit:read-file', name, path),
  readFileBytes: (name: string, path: string) => ipcRenderer.invoke('minipit:read-file-bytes', name, path),
  gitDiffFile:   (name: string, path: string) => ipcRenderer.invoke('minipit:git-diff-file', name, path),
  reviewSummary: (name: string, repoDir: string) => ipcRenderer.invoke('minipit:review-summary', name, repoDir),
  reviewFileDiff: (name: string, repoDir: string, branch: string | null, path: string) => ipcRenderer.invoke('minipit:review-file-diff', name, repoDir, branch, path),
  listBranches:  (repoDir: string) => ipcRenderer.invoke('minipit:list-branches', repoDir),
  prDefaults:    (repoDir: string, branch: string, base: string) => ipcRenderer.invoke('minipit:pr-defaults', repoDir, branch, base),
  sandboxCommit: (repoDir: string, message: string, paths?: string[]) => ipcRenderer.invoke('minipit:sandbox-commit', repoDir, message, paths),
  gitIgnoreAdd:  (name: string, repoDir: string, patterns: string[]) => ipcRenderer.invoke('minipit:git-ignore-add', name, repoDir, patterns),
  writeFile:     (name: string, path: string, content: string) => ipcRenderer.invoke('minipit:write-file', name, path, content),
  openPath:      (path: string)         => ipcRenderer.invoke('minipit:open-path', path),
  openFileWindow:(name: string, path: string, fileName: string, diff?: boolean, reviewBranch?: string | null) => ipcRenderer.invoke('minipit:open-file-window', name, path, fileName, diff, reviewBranch),
  deletePath:    (name: string, path: string) => ipcRenderer.invoke('minipit:delete-path', name, path),
  copyInto:      (name: string, destDir: string, files: { name: string; bytes: Uint8Array }[]) => ipcRenderer.invoke('minipit:copy-into', name, destDir, files),
  downloadFrom:  (name: string, path: string) => ipcRenderer.invoke('minipit:download-from', name, path),
  signOut:       ()                     => ipcRenderer.invoke('minipit:sign-out'),
  generatePalette: (hex: string, size?: number) => ipcRenderer.invoke('minipit:generate-palette', hex, size),
  listTemplates: ()                     => ipcRenderer.invoke('minipit:list-templates'),
  removeTemplate:(ref: string)          => ipcRenderer.invoke('minipit:remove-template', ref),
  templatePush:  (ref: string)          => ipcRenderer.invoke('minipit:template-push', ref),
  storageUsage: ()                      => ipcRenderer.invoke('minipit:storage-usage'),
  createKit:     (name: string, spec: string, files?: string[]) => ipcRenderer.invoke('minipit:create-kit', name, spec, files),
  pickFiles:     ()                     => ipcRenderer.invoke('minipit:pick-files'),
  listKits:      ()                     => ipcRenderer.invoke('minipit:list-kits'),
  kitAdd:        (sandbox: string, dir: string) => ipcRenderer.invoke('minipit:kit-add', sandbox, dir),
  appliedKits:   (sandbox: string)      => ipcRenderer.invoke('minipit:applied-kits', sandbox),
  readKit:       (dir: string)          => ipcRenderer.invoke('minipit:read-kit', dir),
  updateKit:     (dir: string, spec: string, files?: string[]) => ipcRenderer.invoke('minipit:update-kit', dir, spec, files),
  removeKit:     (dir: string)          => ipcRenderer.invoke('minipit:remove-kit', dir),
  kitPush:       (dir: string, ref: string) => ipcRenderer.invoke('minipit:kit-push', dir, ref),
  kitValidate:   (dir: string)          => ipcRenderer.invoke('minipit:kit-validate', dir),
  kitPack:       (dir: string, name: string) => ipcRenderer.invoke('minipit:kit-pack', dir, name),
  saveSnapshot:  (name: string, tag: string) => ipcRenderer.invoke('minipit:save-snapshot', name, tag),
  kitImport:     (ref: string)          => ipcRenderer.invoke('minipit:kit-import', ref),
  listContribKits: ()                   => ipcRenderer.invoke('minipit:list-contrib-kits'),
  importContribKit: (dir: string)       => ipcRenderer.invoke('minipit:import-contrib-kit', dir),
  dockerAccount: ()                     => ipcRenderer.invoke('minipit:docker-account'),
  dockerLogin:   ()                     => ipcRenderer.invoke('minipit:docker-login'),
  dockerLogout:  ()                     => ipcRenderer.invoke('minipit:docker-logout'),
  listSecrets:   ()                     => ipcRenderer.invoke('minipit:list-secrets'),
  secretImport:  ()                     => ipcRenderer.invoke('minipit:secret-import'),
  setSecret:     (service: string, value: string, scope?: string) => ipcRenderer.invoke('minipit:set-secret', service, value, scope),
  setSecretOp:   (service: string, ref: string, scope?: string)   => ipcRenderer.invoke('minipit:set-secret-op', service, ref, scope),
  opAvailable:   ()                     => ipcRenderer.invoke('minipit:op-available'),
  removeSecret:  (service: string, scope?: string) => ipcRenderer.invoke('minipit:remove-secret', service, scope),
  anthropicOAuth:()                     => ipcRenderer.invoke('minipit:anthropic-oauth'),
  oauthSecret:   (service: string)      => ipcRenderer.invoke('minipit:oauth-secret', service),
  openInFinder:  (path: string)         => ipcRenderer.invoke('minipit:open-in-finder', path),
  exec:          (name: string, cmd: string) => ipcRenderer.invoke('minipit:exec', name, cmd),
  listLogs:      ()                     => ipcRenderer.invoke('minipit:list-logs'),
  startLogTail:  (path: string)         => ipcRenderer.invoke('minipit:start-log-tail', path),
  stopLogTail:   ()                     => ipcRenderer.invoke('minipit:stop-log-tail'),
  sandboxLog:    (name: string, which: 'kit' | 'sandbox') => ipcRenderer.invoke('minipit:sandbox-log', name, which),
  onLogTail: (cb: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
    ipcRenderer.on('minipit:log-tail', handler)
    return () => ipcRenderer.removeListener('minipit:log-tail', handler)
  },
  getSettings:   ()                     => ipcRenderer.invoke('minipit:get-settings'),
  saveSettings:  (s: unknown)           => ipcRenderer.invoke('minipit:save-settings', s),
  sbxVersion:    (path?: string)        => ipcRenderer.invoke('minipit:sbx-version', path),
  sbxReleases:   ()                     => ipcRenderer.invoke('minipit:sbx-releases'),
  sbxInstallInfo: ()                    => ipcRenderer.invoke('minipit:sbx-install-info'),
  sbxUpdate:     (action: string)       => ipcRenderer.invoke('minipit:sbx-update', action),
  sbxSettingSet: (key: string, value: string) => ipcRenderer.invoke('minipit:sbx-setting-set', key, value),
  sbxReset:      (preserveSecrets: boolean) => ipcRenderer.invoke('minipit:sbx-reset', preserveSecrets),
  diagnose:      (mode?: 'text' | 'json' | 'github-issue' | 'upload') => ipcRenderer.invoke('minipit:diagnose', mode),
  daemonRestart: ()                     => ipcRenderer.invoke('minipit:daemon-restart'),
  daemonStatus:  ()                     => ipcRenderer.invoke('minipit:daemon-status'),
  daemonLogLevel:(level?: string)       => ipcRenderer.invoke('minipit:daemon-log-level', level),
  sbxInspect:    (name: string)         => ipcRenderer.invoke('minipit:sbx-inspect', name),
  setRuntimeEnv: (key: string, value: string | boolean | null) => ipcRenderer.invoke('minipit:set-runtime-env', key, value),
  onDiagnoseOutput: (cb: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
    ipcRenderer.on('minipit:diagnose-output', handler)
    return () => ipcRenderer.removeListener('minipit:diagnose-output', handler)
  },
  onDaemonOutput: (cb: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
    ipcRenderer.on('minipit:daemon-output', handler)
    return () => ipcRenderer.removeListener('minipit:daemon-output', handler)
  },
  networkPolicy: (name?: string)        => ipcRenderer.invoke('minipit:network-policy', name),
  policyLog:     (name?: string)        => ipcRenderer.invoke('minipit:policy-log', name),
  policyCheck:   (resource: string, name?: string) => ipcRenderer.invoke('minipit:policy-check', resource, name),
  policyAllow:   (name: string, resources: string) => ipcRenderer.invoke('minipit:policy-allow', name, resources),
  policyDeny:    (name: string, resources: string) => ipcRenderer.invoke('minipit:policy-deny', name, resources),
  policyRm:      (name: string, resource: string) => ipcRenderer.invoke('minipit:policy-rm', name, resource),
  policySetDefault: (preset: string)    => ipcRenderer.invoke('minipit:policy-set-default', preset),
  policyReset:   (preset: string)       => ipcRenderer.invoke('minipit:policy-reset', preset),
  onRuntimeOutput: (cb: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
    ipcRenderer.on('minipit:runtime-output', handler)
    return () => ipcRenderer.removeListener('minipit:runtime-output', handler)
  },
  onCreateOutput: (cb: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
    ipcRenderer.on('minipit:create-output', handler)
    return () => ipcRenderer.removeListener('minipit:create-output', handler)
  },
  onLoginOutput: (cb: (chunk: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
    ipcRenderer.on('minipit:login-output', handler)
    return () => ipcRenderer.removeListener('minipit:login-output', handler)
  },
  showOpenDialog:()                     => ipcRenderer.invoke('minipit:show-open-dialog'),
  defaultWorkspace: ()                  => ipcRenderer.invoke('minipit:default-workspace'),
  projectConfigSync: (local: unknown)   => ipcRenderer.invoke('minipit:project-config-sync', local),
  projectConfigSet: (field: string, workspace: string, value: string | null) => ipcRenderer.invoke('minipit:project-config-set', field, workspace, value),
  sandboxIsolation: ()                  => ipcRenderer.invoke('minipit:sandbox-isolation'),
  groupsGet: ()                         => ipcRenderer.invoke('minipit:groups-get'),
  groupsSet: (groups: unknown)          => ipcRenderer.invoke('minipit:groups-set', groups),
  sandboxFetchWork: (name: string, repoDir: string) => ipcRenderer.invoke('minipit:sandbox-fetch-work', name, repoDir),
  sandboxOpenPr: (repoDir: string, branch: string, opts?: { base?: string; title?: string; body?: string }) => ipcRenderer.invoke('minipit:sandbox-open-pr', repoDir, branch, opts),
  sandboxMergeBranch: (repoDir: string, branch: string) => ipcRenderer.invoke('minipit:sandbox-merge-branch', repoDir, branch),
  autoSyncGet: ()                       => ipcRenderer.invoke('minipit:auto-sync-get'),
  autoSyncSet: (name: string, on: boolean) => ipcRenderer.invoke('minipit:auto-sync-set', name, on),
  mountsGet:   (name: string)           => ipcRenderer.invoke('minipit:mounts-get', name),
  sbxMount:    (name: string, host: string, target: string, ro: boolean) => ipcRenderer.invoke('minipit:sbx-mount', name, host, target, ro),
  sbxUmount:   (name: string, host: string, target: string) => ipcRenderer.invoke('minipit:sbx-umount', name, host, target),

  onSandboxesUpdated: (cb: (sandboxes: unknown[]) => void) => {
    const handler = (_: Electron.IpcRendererEvent, s: unknown[]) => cb(s)
    ipcRenderer.on('minipit:sandboxes-updated', handler)
    return () => ipcRenderer.removeListener('minipit:sandboxes-updated', handler)
  },
  onLogLine: (cb: (name: string, line: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string, line: unknown) => cb(name, line)
    ipcRenderer.on('minipit:log-line', handler)
    return () => ipcRenderer.removeListener('minipit:log-line', handler)
  },
  onPolicyBlock: (cb: (block: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, block: unknown) => cb(block)
    ipcRenderer.on('minipit:policy-block', handler)
    return () => ipcRenderer.removeListener('minipit:policy-block', handler)
  },
  onAgentActivity: (cb: (name: string, state: 'working' | 'waiting' | null) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string, state: 'working' | 'waiting' | null) => cb(name, state)
    ipcRenderer.on('minipit:agent-activity', handler)
    return () => ipcRenderer.removeListener('minipit:agent-activity', handler)
  },
  onAgentAttention: (cb: (name: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string) => cb(name)
    ipcRenderer.on('minipit:agent-attention', handler)
    return () => ipcRenderer.removeListener('minipit:agent-attention', handler)
  },
  onFilesChanged: (cb: (name: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string) => cb(name)
    ipcRenderer.on('minipit:files-changed', handler)
    return () => ipcRenderer.removeListener('minipit:files-changed', handler)
  },
  onNavigate: (cb: (page: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, page: string) => cb(page)
    ipcRenderer.on('minipit:navigate', handler)
    return () => ipcRenderer.removeListener('minipit:navigate', handler)
  },
  onOpenSandbox: (cb: (name: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string) => cb(name)
    ipcRenderer.on('minipit:open-sandbox', handler)
    return () => ipcRenderer.removeListener('minipit:open-sandbox', handler)
  },
  onOpenModal: (cb: (modal: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, modal: string) => cb(modal)
    ipcRenderer.on('minipit:open-modal', handler)
    return () => ipcRenderer.removeListener('minipit:open-modal', handler)
  },
  onSetTab: (cb: (tab: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, tab: string) => cb(tab)
    ipcRenderer.on('minipit:set-tab', handler)
    return () => ipcRenderer.removeListener('minipit:set-tab', handler)
  },
  onStopActive: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('minipit:stop-active', handler)
    return () => ipcRenderer.removeListener('minipit:stop-active', handler)
  },

  agentWrite: (name: string, data: string) => ipcRenderer.invoke('minipit:agent-write', name, data),
  agentDropFile: (name: string, fileName: string, bytes: Uint8Array): Promise<string | null> =>
    ipcRenderer.invoke('minipit:agent-drop-file', name, fileName, bytes),
  agentResize: (name: string, cols: number, rows: number) => ipcRenderer.invoke('minipit:agent-resize', name, cols, rows),
  agentEnsure: (name: string, cols: number, rows: number) => ipcRenderer.invoke('minipit:agent-ensure', name, cols, rows),
  onAgentOutput: (cb: (name: string, data: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string, data: string) => cb(name, data)
    ipcRenderer.on('minipit:agent-output', handler)
    return () => ipcRenderer.removeListener('minipit:agent-output', handler)
  },
  onAgentExit: (cb: (name: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string) => cb(name)
    ipcRenderer.on('minipit:agent-exit', handler)
    return () => ipcRenderer.removeListener('minipit:agent-exit', handler)
  },
  ptyStart:  (name: string, cols: number, rows: number) => ipcRenderer.invoke('minipit:pty-start', name, cols, rows),
  ptyWrite:  (name: string, data: string)               => ipcRenderer.invoke('minipit:pty-write', name, data),
  ptyResize: (name: string, cols: number, rows: number) => ipcRenderer.invoke('minipit:pty-resize', name, cols, rows),
  ptyStop:   (name: string)                             => ipcRenderer.invoke('minipit:pty-stop', name),

  onPtyOutput: (cb: (name: string, data: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string, data: string) => cb(name, data)
    ipcRenderer.on('minipit:pty-output', handler)
    return () => ipcRenderer.removeListener('minipit:pty-output', handler)
  },
  onPtyExit: (cb: (name: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, name: string) => cb(name)
    ipcRenderer.on('minipit:pty-exit', handler)
    return () => ipcRenderer.removeListener('minipit:pty-exit', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('minipit', api)
  } catch (e) {
    console.error(e)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.minipit = api
}
