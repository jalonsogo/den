export type SandboxStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'deleting' | 'creating'

// Exact agent identifiers accepted by the sbx CLI (see `sbx run --help`).
export type AgentType =
  | 'claude'
  | 'claude-bedrock'
  | 'codex'
  | 'copilot'
  | 'cursor'
  | 'docker-agent'
  | 'droid'
  | 'gemini'
  | 'kiro'
  | 'opencode'
  | 'shell'

// Canonical ordering + display labels, matching the sbx agent identifiers.
export const AGENTS: { id: AgentType; label: string }[] = [
  { id: 'claude',         label: 'Claude Code' },
  { id: 'claude-bedrock', label: 'Claude (Bedrock)' },
  { id: 'codex',          label: 'Codex' },
  { id: 'copilot',        label: 'Copilot' },
  { id: 'cursor',         label: 'Cursor' },
  { id: 'docker-agent',   label: 'Docker Agent' },
  { id: 'droid',          label: 'Droid' },
  { id: 'gemini',         label: 'Gemini' },
  { id: 'kiro',           label: 'Kiro' },
  { id: 'opencode',       label: 'OpenCode' },
  { id: 'shell',          label: 'Shell' }
]
export type LogLevel = 'success' | 'info' | 'command' | 'error' | 'prompt'
export type PageType = 'sandbox' | 'sandboxes' | 'projects' | 'templates' | 'mixins' | 'kits' | 'settings' | 'logs'
export type TabType = 'terminal' | 'info'
export type ModalType = 'new-sandbox' | 'new-secret' | 'new-kit' | null

// A named collection of sandboxes. Groups carry only a name (no folder, colour,
// or icon); a sandbox belongs to at most one group.
export interface Group {
  id: string
  name: string
}

export interface Port {
  host: number
  container: number
  // May carry an address-family suffix (TCP4/UDP4/TCP6/UDP6) so unpublish can
  // reproduce the exact spec sbx reported. Strip the suffix for display.
  protocol: 'TCP' | 'UDP' | 'TCP4' | 'UDP4' | 'TCP6' | 'UDP6'
  // Host bind address as reported by sbx (e.g. 127.0.0.1 or 0.0.0.0). Needed to
  // unpublish a network-exposed (0.0.0.0) binding, since an omitted host IP
  // defaults to loopback and would miss it.
  hostIp?: string
  active: boolean
}

export interface LogLine {
  time: string
  message: string
  level: LogLevel
}

export interface FileChange {
  path: string
  status: 'new' | 'modified' | 'deleted' | 'renamed'
}

export interface FileEntry {
  name: string
  type: 'file' | 'dir'
  ext?: string
  size?: string
  badge?: 'm' | 'n'
  children?: FileEntry[]
  open?: boolean
}

export interface Sandbox {
  id: string
  name: string
  status: SandboxStatus
  agent: AgentType
  workspace: string
  additionalWorkspaces?: { path: string; readonly: boolean }[]
  branch?: string
  memory?: string
  uptimeSeconds?: number
  ports: Port[]
  logs: LogLine[]
}

// Services accepted by `sbx secret set` (see `sbx secret set --help`).
export type SecretService =
  | 'anthropic'
  | 'openai'
  | 'bedrock'
  | 'aws'
  | 'github'
  | 'google'
  | 'cursor'
  | 'droid'
  | 'groq'
  | 'mistral'
  | 'nebius'
  | 'openrouter'
  | 'xai'

export const SECRET_SERVICES: { id: SecretService; label: string }[] = [
  { id: 'anthropic',  label: 'Anthropic' },
  { id: 'openai',     label: 'OpenAI' },
  { id: 'google',     label: 'Google' },
  { id: 'github',     label: 'GitHub' },
  { id: 'bedrock',    label: 'Amazon Bedrock' },
  { id: 'aws',        label: 'AWS' },
  { id: 'cursor',     label: 'Cursor' },
  { id: 'droid',      label: 'Droid' },
  { id: 'groq',       label: 'Groq' },
  { id: 'mistral',    label: 'Mistral' },
  { id: 'nebius',     label: 'Nebius' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'xai',        label: 'xAI' }
]

// Shown by default on the Secrets page; the rest are revealed via "Show all".
export const COMMON_SECRET_SERVICES: SecretService[] = ['anthropic', 'openai', 'google', 'github']

// The SCOPE value sbx prints (and we pass back) for a global secret. Any other
// value is a sandbox name — the secret applies to that one sandbox only.
export const GLOBAL_SCOPE = '(global)'

export function isGlobalScope(scope: string | null | undefined): boolean {
  return !scope || scope === GLOBAL_SCOPE
}

export function serviceLabel(id: string): string {
  return SECRET_SERVICES.find((s) => s.id === id)?.label ?? id
}

export interface StoredSecret {
  scope: string   // "(global)" or a sandbox name
  type: string    // "service" | "registry"
  name: string    // service name, e.g. "github"
  masked: string  // masked preview, e.g. "ghp-x********"
}

export interface Template {
  id: string
  repository: string
  tag: string
  flavor: string
  createdAt: string
}

// Config for the reusable prompt modal (openPrompt in the store). onSubmit may
// throw to keep the modal open and surface the thrown message as an error.
export interface PromptConfig {
  title: string
  message?: string
  label?: string
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  onSubmit: (value: string) => void | Promise<void>
}

// Whether an agent is mid-task or waiting on the user. `null` clears it (agent
// process exited).
export type AgentState = 'working' | 'waiting'

// A network-policy denial — an agent's request that was blocked. Surfaced so
// the user can allow the host in one click.
export interface PolicyBlock {
  sandbox: string
  host: string
  rule?: string
  reason?: string
  at: number
  source: 'log' | 'output'
}

export interface StorageSection {
  count: number
  bytes: number | null
}

export interface StorageUsage {
  ok: boolean
  sandboxes: StorageSection
  templates: StorageSection
  error?: string
}

export interface SbxRelease {
  version: string
  name: string
  body: string
  url: string
  date: string
  prerelease: boolean
}

export interface PolicyRule {
  provenance: string
  appliesTo: string
  rule: string
  type: string
  decision: string
  resources: string[]
}

export interface NetworkPolicy {
  ok: boolean
  governance?: string | null
  sync?: string | null
  rules?: PolicyRule[]
  raw?: string
  error?: string
}

export interface SbxInstallInfo {
  manager: 'brew' | 'winget' | 'apt' | 'manual'
  real: string
  canAutoUpdate: boolean
  releasesUrl: string
  updateCmd: string
  redownloadCmd: string
}

export interface AppSettings {
  sbxPath: string
  pollFocused: string
  pollBackground: string
  launchAtLogin: boolean
  menuBarOnly: boolean
  notifyOnExit: boolean
  notifyOnError: boolean
  keepAwake: boolean
  imagePaste?: boolean
}

declare global {
  interface Window {
    minipit: {
      listSandboxes(): Promise<Sandbox[]>
      createSandbox(config: unknown): Promise<string>
      runSandbox(name: string): Promise<void>
      stopSandbox(name: string): Promise<void>
      deleteSandbox(name: string): Promise<void>
      getPorts(name: string): Promise<Port[]>
      portPublish(name: string, spec: string): Promise<{ ok: boolean; output?: string; error?: string }>
      portUnpublish(name: string, spec: string): Promise<{ ok: boolean; output?: string; error?: string }>
      listFiles(name: string, relPath: string): Promise<FileEntry[]>
      gitStatus(name: string, workspace: string): Promise<{ isRepo: boolean; changes: FileChange[] }>
      isGitRepo(dir: string): Promise<boolean>
      gitInfo(dir: string): Promise<{ isRepo: boolean; branch?: string; remote?: string; remoteUrl?: string }>
      gitInit(dir: string): Promise<{ ok: boolean; error?: string }>
      readFile(name: string, path: string): Promise<string>
      readFileBytes(name: string, path: string): Promise<{ base64: string; size: number }>
      gitDiffFile(name: string, path: string): Promise<{ diff: string }>
      writeFile(name: string, path: string, content: string): Promise<void>
      openPath(path: string): Promise<string>
      openFileWindow(name: string, path: string, fileName: string, diff?: boolean): Promise<void>
      deletePath(name: string, path: string): Promise<void>
      copyInto(name: string, destDir: string, files: { name: string; bytes: Uint8Array }[]): Promise<{ name: string; ok: boolean; error?: string }[]>
      downloadFrom(name: string, path: string): Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>
      signOut(): Promise<void>
      generatePalette(hex: string, size?: number): Promise<string[]>
      listTemplates(): Promise<Template[]>
      removeTemplate(ref: string): Promise<void>
      templatePush(ref: string): Promise<{ ok: boolean; output?: string; error?: string }>
      createKit(name: string, spec: string, files?: string[]): Promise<{ dir: string; zip: string; output: string }>
      pickFiles(): Promise<string[]>
      listKits(): Promise<{ name: string; kind: string; dir: string; hasZip: boolean }[]>
      kitAdd(sandbox: string, dir: string): Promise<{ ok: boolean; output?: string; error?: string }>
      appliedKits(sandbox: string): Promise<string[]>
      readKit(dir: string): Promise<string>
      updateKit(dir: string, spec: string, files?: string[]): Promise<{ ok: boolean; output?: string; error?: string }>
      removeKit(dir: string): Promise<void>
      kitPush(dir: string, ref: string): Promise<{ ok: boolean; output?: string; error?: string }>
      kitValidate(dir: string): Promise<{ ok: boolean; output?: string; error?: string }>
      kitPack(dir: string, name: string): Promise<{ ok: boolean; path?: string; canceled?: boolean; output?: string; error?: string }>
      saveSnapshot(name: string, tag: string): Promise<{ ok: boolean; output?: string; error?: string }>
      kitImport(ref: string): Promise<{ ok: boolean; name?: string; error?: string }>
      listContribKits(): Promise<{ ok: boolean; kits?: { dir: string; spec: string }[]; error?: string }>
      importContribKit(dir: string): Promise<{ ok: boolean; name?: string; error?: string }>
      dockerAccount(): Promise<{ loggedIn: boolean; username?: string; email?: string; gravatar?: string }>
      dockerLogin(): Promise<{ ok: boolean; output?: string; error?: string }>
      onLoginOutput(cb: (chunk: string) => void): () => void
      listSecrets(): Promise<StoredSecret[]>
      setSecret(service: string, value: string, scope?: string): Promise<void>
      setSecretOp(service: string, ref: string, scope?: string): Promise<void>
      opAvailable(): Promise<boolean>
      removeSecret(service: string, scope?: string): Promise<void>
      anthropicOAuth(): Promise<{ ok: true }>
      oauthSecret(service: string): Promise<{ ok: true }>
      openInFinder(path: string): Promise<void>
      exec(name: string, cmd: string): Promise<string>
      listLogs(): Promise<{ name: string; path: string }[]>
      startLogTail(path: string): Promise<void>
      stopLogTail(): Promise<void>
      sandboxLog(name: string, which: 'kit' | 'sandbox'): Promise<{ ok: boolean; text: string; error?: string }>
      onLogTail(cb: (chunk: string) => void): () => void
      getSettings(): Promise<AppSettings>
      saveSettings(settings: Partial<AppSettings>): Promise<void>
      storageUsage(): Promise<StorageUsage>
      sbxVersion(path?: string): Promise<{ ok: boolean; raw?: string; version?: string; error?: string }>
      sbxReleases(): Promise<SbxRelease[]>
      sbxInstallInfo(): Promise<SbxInstallInfo>
      sbxUpdate(action: 'update' | 'redownload'): Promise<{ ok: boolean; code: number }>
      sbxSettingSet(key: string, value: string): Promise<{ ok: boolean; output?: string; error?: string }>
      sbxReset(preserveSecrets: boolean): Promise<{ ok: boolean; output?: string; error?: string }>
      onRuntimeOutput(cb: (chunk: string) => void): () => void
      onCreateOutput(cb: (chunk: string) => void): () => void
      diagnose(mode?: 'text' | 'json' | 'github-issue' | 'upload'): Promise<{ ok: boolean; output?: string; error?: string }>
      daemonRestart(): Promise<{ ok: boolean; error?: string }>
      onDiagnoseOutput(cb: (chunk: string) => void): () => void
      onDaemonOutput(cb: (chunk: string) => void): () => void
      networkPolicy(name?: string): Promise<NetworkPolicy>
      policyLog(name?: string): Promise<PolicyBlock[]>
      policyAllow(name: string, resources: string): Promise<{ ok: boolean; output?: string; error?: string }>
      policyDeny(name: string, resources: string): Promise<{ ok: boolean; output?: string; error?: string }>
      policyRm(name: string, resource: string): Promise<{ ok: boolean; output?: string; error?: string }>
      policySetDefault(preset: string): Promise<{ ok: boolean; output?: string; error?: string }>
      policyReset(preset: string): Promise<{ ok: boolean; output?: string; error?: string }>
      showOpenDialog(): Promise<string | null>
      defaultWorkspace(): Promise<string>
      projectConfigSync(local: Record<string, Record<string, string>>): Promise<{ sandboxIcons: Record<string, string>; sandboxColors: Record<string, string>; sandboxGroups: Record<string, string> }>
      projectConfigSet(field: 'sandboxIcons' | 'sandboxColors' | 'sandboxGroups', name: string, value: string | null): Promise<void>
      groupsGet(): Promise<{ id: string; name: string }[]>
      groupsSet(groups: { id: string; name: string }[]): Promise<void>
      sandboxIsolation(): Promise<Record<string, boolean>>
      sandboxFetchWork(name: string, repoDir: string): Promise<{ ok: boolean; branch?: string; hasRemote?: boolean; error?: string }>
      sandboxOpenPr(repoDir: string, branch: string): Promise<{ ok: boolean; url?: string; pushedOnly?: boolean; error?: string }>
      sandboxMergeBranch(repoDir: string, branch: string): Promise<{ ok: boolean; base?: string; output?: string; conflict?: boolean; error?: string }>
      autoSyncGet(): Promise<Record<string, boolean>>
      autoSyncSet(name: string, on: boolean): Promise<boolean>
      onSandboxesUpdated(cb: (sandboxes: Sandbox[]) => void): () => void
      onLogLine(cb: (name: string, line: LogLine) => void): () => void
      onPolicyBlock(cb: (block: PolicyBlock) => void): () => void
      onAgentActivity(cb: (name: string, state: AgentState | null) => void): () => void
      onAgentAttention(cb: (name: string) => void): () => void
      onFilesChanged(cb: (name: string) => void): () => void
      onNavigate(cb: (page: string) => void): () => void
      onOpenSandbox(cb: (name: string) => void): () => void
      onOpenModal(cb: (modal: string) => void): () => void
      onSetTab(cb: (tab: string) => void): () => void
      onStopActive(cb: () => void): () => void
      agentWrite(name: string, data: string): Promise<void>
      agentDropFile(name: string, fileName: string, bytes: Uint8Array): Promise<string | null>
      agentResize(name: string, cols: number, rows: number): Promise<void>
      agentEnsure(name: string, cols: number, rows: number): Promise<void>
      onAgentOutput(cb: (name: string, data: string) => void): () => void
      onAgentExit(cb: (name: string) => void): () => void
      ptyStart(name: string, cols: number, rows: number): Promise<void>
      ptyWrite(name: string, data: string): Promise<void>
      ptyResize(name: string, cols: number, rows: number): Promise<void>
      ptyStop(name: string): Promise<void>
      onPtyOutput(cb: (name: string, data: string) => void): () => void
      onPtyExit(cb: (name: string) => void): () => void
    }
  }
}
