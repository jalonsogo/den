import { create } from 'zustand'
import { applyAccent, ensureRamp, savedAccents, writeSavedAccents, type SavedAccent } from './lib/accent'
import type { Sandbox, PageType, TabType, ModalType, LogLine, FileEntry, SecretService, PolicyBlock, AgentState, PromptConfig, Template } from './types'

type ThemePref = 'light' | 'dark' | 'system'
const prefersDark = (): boolean => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
const resolveTheme = (pref: ThemePref): 'light' | 'dark' => (pref === 'system' ? (prefersDark() ? 'dark' : 'light') : pref)
const initialThemePref = (localStorage.getItem('minipit:themePref') as ThemePref) ?? 'system'

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  sandboxId: string | null
  // When set, the menu targets a project (workspace path) instead of a sandbox.
  workspace?: string | null
}

interface AppState {
  sandboxes: Sandbox[]
  activeSandboxId: string | null
  activePage: PageType
  activeTab: TabType
  modal: ModalType
  // Reusable input dialog (openPrompt/closePrompt). Null = closed.
  prompt: PromptConfig | null
  // Template shown in the inspect/details modal. Null = closed.
  inspectTemplate: Template | null
  contextMenu: ContextMenuState
  files: Record<string, FileEntry[]>
  deletingIds: string[]
  // Sandboxes the user just stopped, id → timestamp. `sbx stop` can return
  // before the runtime finishes transitioning, so a poll may still report the
  // sandbox as running; we hold it "stopped" for a short grace window so it
  // doesn't flicker back on (see setSandboxes).
  stopHolds: Record<string, number>
  secretTarget: SecretService | null
  newSandboxWorkspace: string | null
  newSandboxTemplate: string | null
  // When set, the kit modal ('new-kit') opens as a visual EDITOR for this kit
  // instead of creating a new one. Cleared when the modal closes.
  editKit: { dir: string; name: string } | null
  activeProject: string | null
  themePref: 'light' | 'dark' | 'system'
  theme: 'light' | 'dark'   // resolved from themePref (system → OS preference)
  sidebarCollapsed: boolean
  accent: string
  accentColor: string
  customAccents: SavedAccent[]
  termTheme: string
  projectColors: Record<string, string>
  projectIcons: Record<string, string>
  projectNames: Record<string, string>
  // Host-side git summary per workspace path (lazy-loaded, cached).
  gitInfo: Record<string, { isRepo: boolean; branch?: string; remote?: string; remoteUrl?: string }>
  // Uncommitted-change counts per sandbox name (running sandboxes only).
  sandboxChanges: Record<string, number>
  // Sidebar element visibility toggles (Settings → General). subLineMode picks
  // whether the sandbox sub-line shows the agent status or the project name.
  display: { agentBadge: boolean; sandboxSub: boolean; projectCounts: boolean; gitBranch: boolean; changeBadge: boolean; subLineMode: 'status' | 'project' }
  pickerOpen: boolean
  // Signal for the sidebar project avatar to open its customize picker (set by
  // the project right-click menu). Cleared once the picker opens.
  customizeProject: string | null
  customProjects: string[]
  // Network-policy denials, newest-first per sandbox name, with a per-sandbox
  // "seen" watermark so attention badges clear once the user looks.
  policyBlocks: Record<string, PolicyBlock[]>
  blocksSeenAt: Record<string, number>
  toasts: PolicyBlock[]
  // Per-sandbox agent state (working / waiting); absent = unknown/stopped.
  agentActivity: Record<string, AgentState>
  // Mixin-kit names auto-added to every new sandbox (marked in the Kits page).
  defaultKits: string[]
  // Name of a just-created sandbox to briefly flash in the sidebar. Auto-clears.
  highlightSandbox: string | null
  // Sandbox to focus when opening the Logs page (from a sandbox's Logs action).
  logsSandbox: string | null
  // Sandbox id to return to from the Logs page (set when opened from a sandbox).
  logsReturn: string | null

  setSandboxes:       (sandboxes: Sandbox[]) => void
  addCreatingSandbox: (sandbox: Sandbox) => void
  removeCreatingSandbox: (name: string) => void
  setHighlightSandbox: (name: string | null) => void
  toggleDefaultKit:   (name: string) => void
  setSecretTarget:    (service: SecretService | null) => void
  setNewSandboxWorkspace: (path: string | null) => void
  setNewSandboxTemplate: (ref: string | null) => void
  setEditKit: (kit: { dir: string; name: string } | null) => void
  setActiveProject:   (workspace: string | null) => void
  setThemePref:       (pref: 'light' | 'dark' | 'system') => void
  toggleSidebar:      () => void
  setAccent:          (id: string) => void
  setCustomAccent:    (hex: string) => void
  saveCustomAccent:   (hex: string) => void
  removeCustomAccent: (id: string) => void
  setTermTheme:       (id: string) => void
  setProjectColor:    (workspace: string, hex: string | null) => void
  setProjectIcon:     (workspace: string, icon: string | null) => void
  setProjectName:     (workspace: string, name: string | null) => void
  syncProjectConfig:  () => void
  loadGitInfo:        (workspace: string, force?: boolean) => void
  refreshSandboxChanges: (name: string, workspace: string) => void
  setDisplay:         (key: 'agentBadge' | 'sandboxSub' | 'projectCounts' | 'gitBranch' | 'changeBadge', value: boolean) => void
  setSubLineMode:     (mode: 'status' | 'project') => void
  setCustomizeProject:(workspace: string | null) => void
  setPickerOpen:      (open: boolean) => void
  loadProjects:       () => void
  addProject:         () => Promise<string | null>
  removeProject:      (dir: string, deleteFolder?: boolean) => void
  setDeleting:        (id: string, on: boolean) => void
  updateSandbox:      (id: string, updates: Partial<Sandbox>) => void
  setActiveSandboxId: (id: string | null) => void
  setActivePage:      (page: PageType) => void
  setLogsSandbox:     (name: string | null) => void
  setLogsReturn:      (id: string | null) => void
  setActiveTab:       (tab: TabType) => void
  setModal:           (modal: ModalType) => void
  openPrompt:         (config: PromptConfig) => void
  closePrompt:        () => void
  setInspectTemplate: (t: Template | null) => void
  appendLog:          (sandboxId: string, line: LogLine) => void
  setContextMenu:     (state: Partial<ContextMenuState>) => void
  setFiles:           (sandboxId: string, files: FileEntry[]) => void
  addPolicyBlock:     (block: PolicyBlock) => void
  ackPolicyBlocks:    (sandboxName: string) => void
  dismissToast:       (block: PolicyBlock) => void
  setAgentActivity:   (name: string, state: AgentState | null) => void
}

export const useStore = create<AppState>((set) => ({
  sandboxes: [],
  activeSandboxId: null,
  activePage: 'home',
  activeTab: 'terminal',
  modal: null,
  prompt: null,
  inspectTemplate: null,
  contextMenu: { visible: false, x: 0, y: 0, sandboxId: null, workspace: null },
  files: {},
  deletingIds: [],
  stopHolds: {},
  secretTarget: null,
  newSandboxWorkspace: null,
  newSandboxTemplate: null,
  editKit: null,
  activeProject: null,
  themePref: initialThemePref,
  theme: resolveTheme(initialThemePref),
  sidebarCollapsed: localStorage.getItem('minipit:sidebarCollapsed') === '1',
  accent: localStorage.getItem('minipit:accent') ?? 'blue',
  accentColor: localStorage.getItem('minipit:accentColor') ?? '#3b82f6',
  customAccents: savedAccents(),
  termTheme: localStorage.getItem('minipit:termTheme') ?? 'minipit',
  projectColors: (() => {
    try { return JSON.parse(localStorage.getItem('minipit:projectColors') ?? '{}') ?? {} } catch { return {} }
  })(),
  projectIcons: (() => {
    try { return JSON.parse(localStorage.getItem('minipit:projectIcons') ?? '{}') ?? {} } catch { return {} }
  })(),
  projectNames: (() => {
    try { return JSON.parse(localStorage.getItem('minipit:projectNames') ?? '{}') ?? {} } catch { return {} }
  })(),
  gitInfo: {},
  sandboxChanges: {},
  display: (() => {
    const d = { agentBadge: true, sandboxSub: true, projectCounts: true, gitBranch: true, changeBadge: true, subLineMode: 'status' as const }
    try { return { ...d, ...JSON.parse(localStorage.getItem('minipit:display') ?? '{}') } } catch { return d }
  })(),
  pickerOpen: false,
  customizeProject: null,
  customProjects: [],
  policyBlocks: {},
  blocksSeenAt: {},
  toasts: [],
  agentActivity: {},
  highlightSandbox: null,
  logsSandbox: null,
  logsReturn: null,
  defaultKits: (() => {
    try { return JSON.parse(localStorage.getItem('minipit:defaultKits') ?? '[]') ?? [] } catch { return [] }
  })(),

  setSecretTarget: (service) => set({ secretTarget: service }),

  // Star/unstar a mixin kit as a "default" — new sandboxes pre-select these.
  toggleDefaultKit: (name) =>
    set((state) => {
      const next = state.defaultKits.includes(name)
        ? state.defaultKits.filter((n) => n !== name)
        : [...state.defaultKits, name]
      localStorage.setItem('minipit:defaultKits', JSON.stringify(next))
      return { defaultKits: next }
    }),

  setNewSandboxWorkspace: (path) => set({ newSandboxWorkspace: path }),

  setNewSandboxTemplate: (ref) => set({ newSandboxTemplate: ref }),

  setEditKit: (kit) => set({ editKit: kit }),

  setActiveProject: (workspace) => set({ activeProject: workspace }),

  setAccent: (id) =>
    set((state) => {
      localStorage.setItem('minipit:accent', id)
      applyAccent(id, state.accentColor)
      // Saved custom swatches are ramp-driven; ensure the ramp is built/cached.
      const saved = state.customAccents.find((s) => s.id === id)
      if (saved) ensureRamp(saved.hex).then(() => applyAccent(id)).catch(() => {})
      return { accent: id }
    }),

  setCustomAccent: (hex) =>
    set(() => {
      localStorage.setItem('minipit:accent', 'custom')
      localStorage.setItem('minipit:accentColor', hex)
      applyAccent('custom', hex)
      // Generate the ramp (async, in main) then re-apply so the harmonized
      // mid-tone drives --primary instead of the raw picked hex.
      ensureRamp(hex).then(() => applyAccent('custom', hex)).catch(() => {})
      return { accent: 'custom', accentColor: hex }
    }),

  // Persist the current picker color as a reusable swatch and make it active.
  saveCustomAccent: (hex) =>
    set((state) => {
      const id = `custom-${hex.replace('#', '').toLowerCase()}`
      const list = state.customAccents.some((s) => s.id === id)
        ? state.customAccents
        : [...state.customAccents, { id, hex }]
      writeSavedAccents(list)
      localStorage.setItem('minipit:accent', id)
      ensureRamp(hex).then(() => applyAccent(id)).catch(() => applyAccent(id))
      applyAccent(id)
      return { customAccents: list, accent: id, accentColor: hex }
    }),

  removeCustomAccent: (id) =>
    set((state) => {
      const list = state.customAccents.filter((s) => s.id !== id)
      writeSavedAccents(list)
      // If the removed swatch was active, fall back to the default accent.
      if (state.accent === id) {
        localStorage.setItem('minipit:accent', 'blue')
        applyAccent('blue')
        return { customAccents: list, accent: 'blue' }
      }
      return { customAccents: list }
    }),

  setTermTheme: (id) =>
    set(() => {
      localStorage.setItem('minipit:termTheme', id)
      return { termTheme: id }
    }),

  setProjectColor: (workspace, hex) =>
    set((state) => {
      const next = { ...state.projectColors }
      if (hex) next[workspace] = hex
      else delete next[workspace]
      // localStorage is a per-origin cache for instant paint; the file-based
      // electron-store (via IPC) is the durable source of truth.
      localStorage.setItem('minipit:projectColors', JSON.stringify(next))
      window.minipit?.projectConfigSet('colors', workspace, hex ?? null)
      return { projectColors: next }
    }),

  setProjectIcon: (workspace, icon) =>
    set((state) => {
      const next = { ...state.projectIcons }
      if (icon) next[workspace] = icon
      else delete next[workspace]
      localStorage.setItem('minipit:projectIcons', JSON.stringify(next))
      window.minipit?.projectConfigSet('icons', workspace, icon ?? null)
      return { projectIcons: next }
    }),

  // Merge this origin's localStorage cache into the durable store (store wins),
  // then hydrate the in-memory maps + refresh the cache from the authoritative
  // result. Called once at startup — this is what makes config survive a
  // dev-server port change (and thus a new localStorage origin).
  syncProjectConfig: () => {
    const readLS = (k: string): Record<string, string> => {
      try { return JSON.parse(localStorage.getItem(k) ?? '{}') ?? {} } catch { return {} }
    }
    const local = {
      colors: readLS('minipit:projectColors'),
      icons: readLS('minipit:projectIcons'),
      names: readLS('minipit:projectNames')
    }
    window.minipit?.projectConfigSync(local).then((cfg) => {
      if (!cfg) return
      localStorage.setItem('minipit:projectColors', JSON.stringify(cfg.colors))
      localStorage.setItem('minipit:projectIcons', JSON.stringify(cfg.icons))
      localStorage.setItem('minipit:projectNames', JSON.stringify(cfg.names))
      set({ projectColors: cfg.colors, projectIcons: cfg.icons, projectNames: cfg.names })
    }).catch(() => {})
  },

  loadGitInfo: (workspace, force) => {
    if (!workspace) return
    if (!force && useStore.getState().gitInfo[workspace]) return
    window.minipit?.gitInfo(workspace)
      .then((info) => set((s) => ({ gitInfo: { ...s.gitInfo, [workspace]: info ?? { isRepo: false } } })))
      .catch(() => {})
  },

  refreshSandboxChanges: (name, workspace) => {
    window.minipit?.gitStatus(name, workspace)
      .then((r) => set((s) => ({ sandboxChanges: { ...s.sandboxChanges, [name]: r?.isRepo ? r.changes.length : 0 } })))
      .catch(() => {})
  },

  setProjectName: (workspace, name) =>
    set((state) => {
      const next = { ...state.projectNames }
      const trimmed = name?.trim()
      if (trimmed) next[workspace] = trimmed
      else delete next[workspace]
      localStorage.setItem('minipit:projectNames', JSON.stringify(next))
      window.minipit?.projectConfigSet('names', workspace, trimmed ?? null)
      return { projectNames: next }
    }),

  setDisplay: (key, value) =>
    set((state) => {
      const next = { ...state.display, [key]: value }
      localStorage.setItem('minipit:display', JSON.stringify(next))
      return { display: next }
    }),

  setSubLineMode: (mode) =>
    set((state) => {
      const next = { ...state.display, subLineMode: mode }
      localStorage.setItem('minipit:display', JSON.stringify(next))
      return { display: next }
    }),

  setCustomizeProject: (workspace) => set({ customizeProject: workspace }),

  setPickerOpen: (open) => set({ pickerOpen: open }),

  loadProjects: async () => {
    const p = await window.minipit?.listProjects().catch(() => [])
    set({ customProjects: p ?? [] })
  },

  addProject: async () => {
    const dir = await window.minipit?.addProject().catch(() => null)
    if (dir) {
      set((s) => ({ customProjects: s.customProjects.includes(dir) ? s.customProjects : [...s.customProjects, dir] }))
    }
    return dir ?? null
  },

  removeProject: (dir, deleteFolder) => {
    window.minipit?.removeProject(dir, deleteFolder).catch(() => {})
    set((s) => ({ customProjects: s.customProjects.filter((d) => d !== dir) }))
  },

  setThemePref: (pref) =>
    set((state) => {
      localStorage.setItem('minipit:themePref', pref)
      const theme = resolveTheme(pref)
      document.documentElement.setAttribute('data-theme', theme)
      // Re-apply the accent so any GUI tint matches the new mode.
      applyAccent(state.accent, state.accentColor)
      return { themePref: pref, theme }
    }),

  toggleSidebar: () =>
    set((state) => {
      const sidebarCollapsed = !state.sidebarCollapsed
      localStorage.setItem('minipit:sidebarCollapsed', sidebarCollapsed ? '1' : '0')
      return { sidebarCollapsed }
    }),

  // Merge incoming list with existing logs so real-time lines aren't wiped
  setSandboxes: (incoming) =>
    set((state) => {
      const logsById: Record<string, LogLine[]> = {}
      for (const s of state.sandboxes) logsById[s.id] = s.logs

      // Keep showing "deleting" across polls; drop ids that are already gone.
      const presentIds = new Set(incoming.map((s) => s.id))
      const deletingIds = state.deletingIds.filter((id) => presentIds.has(id))

      // Hold a just-stopped sandbox as "stopped" for a short grace window: `sbx
      // stop` can return before the runtime settles, so an in-flight poll may
      // still list it as running and flip it back on. Release the hold as soon
      // as a poll agrees it's down, or once the window lapses (so an external
      // restart still surfaces).
      const STOP_GRACE_MS = 15000
      const now = Date.now()
      const stopHolds = { ...state.stopHolds }

      const sandboxes = incoming.map((s) => {
        let status = deletingIds.includes(s.id) ? ('deleting' as const) : s.status
        const heldAt = stopHolds[s.id]
        if (heldAt !== undefined) {
          if (s.status !== 'running') delete stopHolds[s.id]            // confirmed down
          else if (now - heldAt < STOP_GRACE_MS) status = 'stopped'     // stale running → keep stopped
          else delete stopHolds[s.id]                                   // grace lapsed → trust poll
        }
        return { ...s, logs: logsById[s.id] ?? [], status }
      })
      for (const id of Object.keys(stopHolds)) if (!presentIds.has(id)) delete stopHolds[id]

      // Keep optimistic "creating" placeholders visible across polls until the
      // real sandbox (same name) shows up in the incoming list.
      const incomingNames = new Set(incoming.map((s) => s.name))
      const creatingHold = state.sandboxes.filter(
        (s) => s.status === 'creating' && !incomingNames.has(s.name)
      )
      const merged = [...creatingHold, ...sandboxes]

      const activeStillExists = merged.some((s) => s.id === state.activeSandboxId)
      const activeSandboxId = activeStillExists
        ? state.activeSandboxId
        : (merged[0]?.id ?? null)

      // Activity ("Working…"/"Waiting") only makes sense for a running agent.
      // Drop it for anything not running (stopped externally, after a den
      // restart, etc.) so a stale state can't linger on a stopped sandbox.
      const runningNames = new Set(sandboxes.filter((s) => s.status === 'running').map((s) => s.name))
      const agentActivity = Object.fromEntries(
        Object.entries(state.agentActivity).filter(([name]) => runningNames.has(name))
      )

      return { sandboxes: merged, activeSandboxId, deletingIds, agentActivity, stopHolds }
    }),

  addCreatingSandbox: (sandbox) =>
    set((state) => ({
      sandboxes: state.sandboxes.some((s) => s.name === sandbox.name)
        ? state.sandboxes
        : [sandbox, ...state.sandboxes]
    })),

  removeCreatingSandbox: (name) =>
    set((state) => ({
      sandboxes: state.sandboxes.filter((s) => !(s.status === 'creating' && s.name === name))
    })),

  setHighlightSandbox: (name) => {
    set({ highlightSandbox: name })
    // Auto-clear so the flash is momentary (and doesn't re-trigger on re-render).
    if (name) setTimeout(() => set((s) => (s.highlightSandbox === name ? { highlightSandbox: null } : {})), 4000)
  },

  setDeleting: (id, on) =>
    set((state) => ({
      deletingIds: on
        ? [...new Set([...state.deletingIds, id])]
        : state.deletingIds.filter((x) => x !== id),
      sandboxes: state.sandboxes.map((s) =>
        s.id === id && on ? { ...s, status: 'deleting' } : s
      )
    })),

  updateSandbox: (id, updates) =>
    set((state) => {
      const sandboxes = state.sandboxes.map((s) => (s.id === id ? { ...s, ...updates } : s))
      // Stopping/stopping/deleting: clear any lingering "Working…"/"Waiting".
      let agentActivity = state.agentActivity
      if (updates.status && updates.status !== 'running') {
        const sb = sandboxes.find((s) => s.id === id)
        if (sb && agentActivity[sb.name] !== undefined) {
          agentActivity = { ...agentActivity }
          delete agentActivity[sb.name]
        }
      }
      // Track a user-initiated stop so a stale poll can't flip it back to
      // running; a start/run clears the hold immediately.
      let stopHolds = state.stopHolds
      if (updates.status === 'stopping' || updates.status === 'stopped') {
        stopHolds = { ...stopHolds, [id]: Date.now() }
      } else if ((updates.status === 'running' || updates.status === 'starting') && stopHolds[id] !== undefined) {
        stopHolds = { ...stopHolds }
        delete stopHolds[id]
      }
      return { sandboxes, agentActivity, stopHolds }
    }),

  setActiveSandboxId: (id) => set({ activeSandboxId: id, activePage: 'sandbox', activeTab: 'terminal', logsReturn: null }),

  setActivePage: (page) => set((s) => ({ activePage: page, logsReturn: page === 'logs' ? s.logsReturn : null })),

  setLogsSandbox: (name) => set({ logsSandbox: name }),

  setLogsReturn: (id) => set({ logsReturn: id }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setModal: (modal) => set({ modal }),

  openPrompt: (config) => set({ prompt: config }),
  closePrompt: () => set({ prompt: null }),
  setInspectTemplate: (t) => set({ inspectTemplate: t }),

  appendLog: (sandboxId, line) =>
    set((state) => ({
      sandboxes: state.sandboxes.map((s) =>
        s.id === sandboxId ? { ...s, logs: [...s.logs, line] } : s
      )
    })),

  setContextMenu: (ctx) =>
    set((state) => ({ contextMenu: { ...state.contextMenu, ...ctx } })),

  setFiles: (sandboxId, files) =>
    set((state) => ({ files: { ...state.files, [sandboxId]: files } })),

  addPolicyBlock: (block) =>
    set((state) => {
      if (!block.sandbox || !block.host) return {}
      const list = state.policyBlocks[block.sandbox] ?? []
      // Collapse repeats of the same host within a minute (both detectors can
      // report the same denial); otherwise prepend, newest-first.
      const recent = list.find((b) => b.host === block.host && Math.abs(b.at - block.at) < 60_000)
      const nextList = recent
        ? list.map((b) => (b === recent ? { ...b, at: Math.max(b.at, block.at) } : b))
        : [block, ...list].slice(0, 50)
      // Toast only for genuinely new denials, not collapsed repeats.
      const toasts = recent
        ? state.toasts
        : [block, ...state.toasts.filter((t) => !(t.sandbox === block.sandbox && t.host === block.host))].slice(0, 4)
      return { policyBlocks: { ...state.policyBlocks, [block.sandbox]: nextList }, toasts }
    }),

  ackPolicyBlocks: (sandboxName) =>
    set((state) => ({ blocksSeenAt: { ...state.blocksSeenAt, [sandboxName]: Date.now() } })),

  dismissToast: (block) =>
    set((state) => ({
      toasts: state.toasts.filter(
        (t) => !(t.sandbox === block.sandbox && t.host === block.host && t.at === block.at)
      )
    })),

  setAgentActivity: (name, state) =>
    set((s) => {
      const next = { ...s.agentActivity }
      if (state === null) delete next[name]
      else next[name] = state
      return { agentActivity: next }
    })
}))

// When the theme preference is "system", follow the OS appearance live.
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const { themePref, accent, accentColor } = useStore.getState()
  if (themePref !== 'system') return
  const theme = resolveTheme('system')
  document.documentElement.setAttribute('data-theme', theme)
  applyAccent(accent, accentColor)
  useStore.setState({ theme })
})

// Denials for a sandbox the user hasn't looked at yet — drives attention badges.
export function unackedBlockCount(
  blocks: Record<string, PolicyBlock[]>,
  seenAt: Record<string, number>,
  name: string
): number {
  const seen = seenAt[name] ?? 0
  return (blocks[name] ?? []).filter((b) => b.at > seen).length
}

// Display name for a project: the user's rename alias if set, else the folder
// basename of the workspace path.
export function projectDisplayName(names: Record<string, string>, workspace: string): string {
  return names[workspace]?.trim() || workspace.split('/').pop() || workspace
}
