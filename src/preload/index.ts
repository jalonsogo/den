import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  listSandboxes: ()                     => ipcRenderer.invoke('minipit:list-sandboxes'),
  createSandbox: (config: unknown)      => ipcRenderer.invoke('minipit:create-sandbox', config),
  runSandbox:    (name: string)         => ipcRenderer.invoke('minipit:run-sandbox', name),
  stopSandbox:   (name: string)         => ipcRenderer.invoke('minipit:stop-sandbox', name),
  deleteSandbox: (name: string)         => ipcRenderer.invoke('minipit:delete-sandbox', name),
  getPorts:      (name: string)         => ipcRenderer.invoke('minipit:get-ports', name),
  listFiles:     (name: string, relPath: string) => ipcRenderer.invoke('minipit:list-files', name, relPath),
  gitStatus:     (name: string, workspace: string) => ipcRenderer.invoke('minipit:git-status', name, workspace),
  readFile:      (name: string, path: string) => ipcRenderer.invoke('minipit:read-file', name, path),
  writeFile:     (name: string, path: string, content: string) => ipcRenderer.invoke('minipit:write-file', name, path, content),
  openPath:      (path: string)         => ipcRenderer.invoke('minipit:open-path', path),
  openFileWindow:(name: string, path: string, fileName: string) => ipcRenderer.invoke('minipit:open-file-window', name, path, fileName),
  deletePath:    (name: string, path: string) => ipcRenderer.invoke('minipit:delete-path', name, path),
  signOut:       ()                     => ipcRenderer.invoke('minipit:sign-out'),
  generatePalette: (hex: string, size?: number) => ipcRenderer.invoke('minipit:generate-palette', hex, size),
  listTemplates: ()                     => ipcRenderer.invoke('minipit:list-templates'),
  removeTemplate:(ref: string)          => ipcRenderer.invoke('minipit:remove-template', ref),
  createKit:     (name: string, spec: string, files?: string[]) => ipcRenderer.invoke('minipit:create-kit', name, spec, files),
  pickFiles:     ()                     => ipcRenderer.invoke('minipit:pick-files'),
  listKits:      ()                     => ipcRenderer.invoke('minipit:list-kits'),
  kitAdd:        (sandbox: string, dir: string) => ipcRenderer.invoke('minipit:kit-add', sandbox, dir),
  appliedKits:   (sandbox: string)      => ipcRenderer.invoke('minipit:applied-kits', sandbox),
  readKit:       (dir: string)          => ipcRenderer.invoke('minipit:read-kit', dir),
  updateKit:     (dir: string, spec: string) => ipcRenderer.invoke('minipit:update-kit', dir, spec),
  removeKit:     (dir: string)          => ipcRenderer.invoke('minipit:remove-kit', dir),
  kitPush:       (dir: string, ref: string) => ipcRenderer.invoke('minipit:kit-push', dir, ref),
  kitImport:     (ref: string)          => ipcRenderer.invoke('minipit:kit-import', ref),
  dockerAccount: ()                     => ipcRenderer.invoke('minipit:docker-account'),
  listSecrets:   ()                     => ipcRenderer.invoke('minipit:list-secrets'),
  setSecret:     (service: string, value: string) => ipcRenderer.invoke('minipit:set-secret', service, value),
  removeSecret:  (service: string)      => ipcRenderer.invoke('minipit:remove-secret', service),
  anthropicOAuth:()                     => ipcRenderer.invoke('minipit:anthropic-oauth'),
  oauthSecret:   (service: string)      => ipcRenderer.invoke('minipit:oauth-secret', service),
  openInFinder:  (path: string)         => ipcRenderer.invoke('minipit:open-in-finder', path),
  exec:          (name: string, cmd: string) => ipcRenderer.invoke('minipit:exec', name, cmd),
  listLogs:      ()                     => ipcRenderer.invoke('minipit:list-logs'),
  startLogTail:  (path: string)         => ipcRenderer.invoke('minipit:start-log-tail', path),
  stopLogTail:   ()                     => ipcRenderer.invoke('minipit:stop-log-tail'),
  sandboxKitLog: (name: string)         => ipcRenderer.invoke('minipit:sandbox-kit-log', name),
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
  networkPolicy: (name?: string)        => ipcRenderer.invoke('minipit:network-policy', name),
  policyAllow:   (name: string, resources: string) => ipcRenderer.invoke('minipit:policy-allow', name, resources),
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
  showOpenDialog:()                     => ipcRenderer.invoke('minipit:show-open-dialog'),
  listProjects:  ()                     => ipcRenderer.invoke('minipit:list-projects'),
  addProject:    ()                     => ipcRenderer.invoke('minipit:add-project'),
  removeProject: (dir: string, deleteFolder?: boolean) => ipcRenderer.invoke('minipit:remove-project', dir, deleteFolder),
  defaultWorkspace: ()                  => ipcRenderer.invoke('minipit:default-workspace'),

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
  onOpenProject: (cb: (workspace: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, workspace: string) => cb(workspace)
    ipcRenderer.on('minipit:open-project', handler)
    return () => ipcRenderer.removeListener('minipit:open-project', handler)
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
