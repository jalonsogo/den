export type SandboxStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'deleting'

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
export type PageType = 'home' | 'sandbox' | 'projects' | 'templates' | 'mixins' | 'kits' | 'settings'
export type TabType = 'terminal' | 'info'
export type ModalType = 'new-sandbox' | 'new-secret' | 'new-kit' | null

export interface Port {
  host: number
  container: number
  protocol: 'TCP' | 'UDP'
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
      listFiles(name: string, relPath: string): Promise<FileEntry[]>
      gitStatus(name: string, workspace: string): Promise<{ isRepo: boolean; changes: FileChange[] }>
      readFile(name: string, path: string): Promise<string>
      writeFile(name: string, path: string, content: string): Promise<void>
      openPath(path: string): Promise<string>
      openFileWindow(name: string, path: string, fileName: string): Promise<void>
      deletePath(name: string, path: string): Promise<void>
      signOut(): Promise<void>
      generatePalette(hex: string, size?: number): Promise<string[]>
      listTemplates(): Promise<Template[]>
      removeTemplate(ref: string): Promise<void>
      createKit(name: string, spec: string): Promise<{ dir: string; zip: string; output: string }>
      listKits(): Promise<{ name: string; kind: string; dir: string; hasZip: boolean }[]>
      kitAdd(sandbox: string, dir: string): Promise<{ ok: boolean; output?: string; error?: string }>
      removeKit(dir: string): Promise<void>
      listSecrets(): Promise<StoredSecret[]>
      setSecret(service: string, value: string): Promise<void>
      removeSecret(service: string): Promise<void>
      anthropicOAuth(): Promise<{ ok: true }>
      oauthSecret(service: string): Promise<{ ok: true }>
      openInFinder(path: string): Promise<void>
      exec(name: string, cmd: string): Promise<string>
      listLogs(): Promise<{ name: string; path: string }[]>
      startLogTail(path: string): Promise<void>
      stopLogTail(): Promise<void>
      onLogTail(cb: (chunk: string) => void): () => void
      getSettings(): Promise<AppSettings>
      saveSettings(settings: Partial<AppSettings>): Promise<void>
      sbxVersion(path?: string): Promise<{ ok: boolean; raw?: string; version?: string; error?: string }>
      sbxReleases(): Promise<SbxRelease[]>
      sbxInstallInfo(): Promise<SbxInstallInfo>
      sbxUpdate(action: 'update' | 'redownload'): Promise<{ ok: boolean; code: number }>
      onRuntimeOutput(cb: (chunk: string) => void): () => void
      networkPolicy(name?: string): Promise<NetworkPolicy>
      policyAllow(name: string, resources: string): Promise<{ ok: boolean; output?: string; error?: string }>
      showOpenDialog(): Promise<string | null>
      listProjects(): Promise<string[]>
      addProject(): Promise<string | null>
      removeProject(dir: string, deleteFolder?: boolean): Promise<{ ok: boolean; error?: string }>
      defaultWorkspace(): Promise<string>
      onSandboxesUpdated(cb: (sandboxes: Sandbox[]) => void): () => void
      onLogLine(cb: (name: string, line: LogLine) => void): () => void
      onNavigate(cb: (page: string) => void): () => void
      onOpenSandbox(cb: (name: string) => void): () => void
      onOpenProject(cb: (workspace: string) => void): () => void
      onOpenModal(cb: (modal: string) => void): () => void
      onSetTab(cb: (tab: string) => void): () => void
      onStopActive(cb: () => void): () => void
      agentWrite(name: string, data: string): Promise<void>
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
