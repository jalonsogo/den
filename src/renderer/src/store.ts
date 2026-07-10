import { create } from 'zustand'
import { applyTheme, DEFAULT_THEME } from './lib/themes'
import type { Sandbox, PageType, TabType, ModalType, LogLine, FileEntry, SecretService, PolicyBlock, AgentState, PromptConfig, Template, Group } from './types'

type ThemePref = 'light' | 'dark' | 'system'
const prefersDark = (): boolean => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
const resolveTheme = (pref: ThemePref): 'light' | 'dark' => (pref === 'system' ? (prefersDark() ? 'dark' : 'light') : pref)
const initialThemePref = (localStorage.getItem('minipit:themePref') as ThemePref) ?? 'system'

// UI density → a whole-window zoom factor (scales every element at once).
// 'custom' uses a user-set multiplier (densityCustom).
export type Density = 'default' | 'comfortable' | 'custom'
const DENSITY_FIXED: Record<'default' | 'comfortable', number> = { default: 1, comfortable: 1.1 }
export const densityFactor = (d: Density, custom: number): number => (d === 'custom' ? custom : DENSITY_FIXED[d])
const clampFactor = (n: number): number => Math.min(2, Math.max(0.5, Number.isFinite(n) ? n : 1))
const storedDensity = localStorage.getItem('minipit:density')
const initialDensity: Density = storedDensity === 'comfortable' || storedDensity === 'custom' ? storedDensity : 'default'
const initialDensityCustom = clampFactor(Number(localStorage.getItem('minipit:densityCustom')) || 1.2)

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  sandboxId: string | null
  // When set, the menu targets a project (workspace path) instead of a sandbox.
  workspace?: string | null
  // When set, the menu targets a named group.
  groupId?: string | null
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
  // Scope the secret modal targets when editing: '(global)' or a sandbox name.
  // Null when adding a new secret (the modal then lets the user pick the scope).
  secretScopeTarget: string | null
  newSandboxWorkspace: string | null
  newSandboxTemplate: string | null
  // When set, the New Sandbox modal pre-selects this group (used by the group
  // header's "New sandbox…"). Cleared when the modal closes.
  newSandboxGroup: string | null
  // When true, the New Sandbox modal opens in "feature" mode: isolation (--clone)
  // is forced on and the UI is framed as starting an isolated feature.
  newSandboxFeature: boolean
  // When set, the kit modal ('new-kit') opens as a visual EDITOR for this kit
  // instead of creating a new one. Cleared when the modal closes.
  editKit: { dir: string; name: string } | null
  themePref: 'light' | 'dark' | 'system'
  theme: 'light' | 'dark'   // resolved from themePref (system → OS preference)
  // What a left-click on a file does: open the in-app previewer or hand off to
  // the host's default app.
  fileOpenMode: 'preview' | 'system'
  density: Density
  densityCustom: number
  sidebarCollapsed: boolean
  // Selected color theme id (drives the full palette: surfaces + accent).
  accent: string
  termTheme: string
  // Per-sandbox custom icon key (by sandbox name); absent → two-letter initials.
  sandboxIcons: Record<string, string>
  // Per-sandbox custom colour (by name); absent → the default neutral avatar.
  sandboxColors: Record<string, string>
  // Named sandbox groups + membership (sandbox name → group id; one group max).
  groups: Group[]
  sandboxGroups: Record<string, string>
  // Manual sandbox order (by name) for Order-by: Manual. Groups' own order is the
  // `groups` array order. Both are user-arranged via drag.
  sandboxOrder: string[]
  // Per-sandbox working-tree isolation (by name): true = --clone (own tree),
  // false = direct mount of the host folder. Used to warn about shared folders.
  sandboxIsolation: Record<string, boolean>
  // Per-sandbox "auto-sync to review branch" toggle (clone mode only): true =
  // on each workspace change, fetch the sandbox's clone into `sandbox/<name>`.
  sandboxAutoSync: Record<string, boolean>
  // Host-side git summary per workspace path (lazy-loaded, cached).
  gitInfo: Record<string, { isRepo: boolean; branch?: string; remote?: string; remoteUrl?: string }>
  // Uncommitted-change counts per sandbox name (running sandboxes only).
  sandboxChanges: Record<string, number>
  // Sidebar element visibility toggles (Settings → General). subLineMode picks
  // whether the sandbox sub-line shows the agent status or the project name.
  display: { agentBadge: boolean; sandboxSub: boolean; projectCounts: boolean; gitBranch: boolean; changeBadge: boolean; subLineMode: 'status' | 'project' }
  pickerOpen: boolean
  // Signal for a sandbox's icon picker (the detail-view avatar listens).
  customizeSandbox: string | null
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
  setSecretTarget:    (service: SecretService | null, scope?: string | null) => void
  setNewSandboxWorkspace: (path: string | null) => void
  setNewSandboxTemplate: (ref: string | null) => void
  setNewSandboxGroup: (id: string | null) => void
  setNewSandboxFeature: (v: boolean) => void
  setEditKit: (kit: { dir: string; name: string } | null) => void
  setThemePref:       (pref: 'light' | 'dark' | 'system') => void
  setFileOpenMode:    (mode: 'preview' | 'system') => void
  setDensity:         (density: Density) => void
  setDensityCustom:   (factor: number) => void
  toggleSidebar:      () => void
  setAccent:          (id: string) => void
  setTermTheme:       (id: string) => void
  setSandboxIcon:     (name: string, iconKey: string | null) => void
  setSandboxColor:    (name: string, hex: string | null) => void
  setCustomizeSandbox:(name: string | null) => void
  syncProjectConfig:  () => void
  loadSandboxIsolation: () => void
  loadAutoSync:       () => void
  setAutoSync:        (name: string, on: boolean) => void
  loadGroups:         () => void
  createGroup:        (name: string) => string
  renameGroup:        (id: string, name: string) => void
  deleteGroup:        (id: string, deleteSandboxes: boolean) => void
  setSandboxGroup:    (name: string, groupId: string | null) => void
  reorderGroups:      (dragId: string, beforeId: string | null) => void
  reorderSandbox:     (dragName: string, beforeName: string | null) => void
  loadGitInfo:        (workspace: string, force?: boolean) => void
  refreshSandboxChanges: (name: string, workspace: string) => void
  setDisplay:         (key: 'agentBadge' | 'sandboxSub' | 'projectCounts' | 'gitBranch' | 'changeBadge', value: boolean) => void
  setSubLineMode:     (mode: 'status' | 'project') => void
  setPickerOpen:      (open: boolean) => void
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
  activePage: 'sandboxes',
  activeTab: 'terminal',
  modal: null,
  prompt: null,
  inspectTemplate: null,
  contextMenu: { visible: false, x: 0, y: 0, sandboxId: null, workspace: null },
  files: {},
  deletingIds: [],
  stopHolds: {},
  secretTarget: null,
  secretScopeTarget: null,
  newSandboxWorkspace: null,
  newSandboxTemplate: null,
  newSandboxGroup: null,
  newSandboxFeature: false,
  editKit: null,
  themePref: initialThemePref,
  theme: resolveTheme(initialThemePref),
  fileOpenMode: (localStorage.getItem('minipit:fileOpenMode') as 'preview' | 'system') ?? 'preview',
  density: initialDensity,
  densityCustom: initialDensityCustom,
  sidebarCollapsed: localStorage.getItem('minipit:sidebarCollapsed') === '1',
  accent: localStorage.getItem('minipit:accent') ?? DEFAULT_THEME,
  termTheme: localStorage.getItem('minipit:termTheme') ?? 'minipit',
  sandboxIcons: (() => {
    try { return JSON.parse(localStorage.getItem('minipit:sandboxIcons') ?? '{}') ?? {} } catch { return {} }
  })(),
  sandboxColors: (() => {
    try { return JSON.parse(localStorage.getItem('minipit:sandboxColors') ?? '{}') ?? {} } catch { return {} }
  })(),
  groups: [],
  sandboxGroups: (() => {
    try { return JSON.parse(localStorage.getItem('minipit:sandboxGroups') ?? '{}') ?? {} } catch { return {} }
  })(),
  sandboxOrder: (() => {
    try { return JSON.parse(localStorage.getItem('minipit:sandboxOrder') ?? '[]') ?? [] } catch { return [] }
  })(),
  sandboxIsolation: {},
  sandboxAutoSync: {},
  gitInfo: {},
  sandboxChanges: {},
  display: (() => {
    const d = { agentBadge: true, sandboxSub: true, projectCounts: true, gitBranch: true, changeBadge: true, subLineMode: 'status' as const }
    try { return { ...d, ...JSON.parse(localStorage.getItem('minipit:display') ?? '{}') } } catch { return d }
  })(),
  pickerOpen: false,
  customizeSandbox: null,
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

  setSecretTarget: (service, scope = null) => set({ secretTarget: service, secretScopeTarget: scope }),

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
  setNewSandboxGroup: (id) => set({ newSandboxGroup: id }),
  setNewSandboxFeature: (v) => set({ newSandboxFeature: v }),

  setNewSandboxTemplate: (ref) => set({ newSandboxTemplate: ref }),

  setEditKit: (kit) => set({ editKit: kit }),


  // Pick a color theme — applies its full palette (surfaces + accent) for the
  // active light/dark mode.
  setAccent: (id) =>
    set((state) => {
      localStorage.setItem('minipit:accent', id)
      applyTheme(id, state.theme)
      return { accent: id }
    }),

  setTermTheme: (id) =>
    set(() => {
      localStorage.setItem('minipit:termTheme', id)
      return { termTheme: id }
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
      sandboxIcons: readLS('minipit:sandboxIcons'),
      sandboxColors: readLS('minipit:sandboxColors'),
      sandboxGroups: readLS('minipit:sandboxGroups')
    }
    window.minipit?.projectConfigSync(local).then((cfg) => {
      if (!cfg) return
      localStorage.setItem('minipit:sandboxIcons', JSON.stringify(cfg.sandboxIcons))
      localStorage.setItem('minipit:sandboxColors', JSON.stringify(cfg.sandboxColors))
      localStorage.setItem('minipit:sandboxGroups', JSON.stringify(cfg.sandboxGroups))
      set({ sandboxIcons: cfg.sandboxIcons, sandboxColors: cfg.sandboxColors, sandboxGroups: cfg.sandboxGroups })
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

  setCustomizeSandbox: (name) => set({ customizeSandbox: name }),

  loadSandboxIsolation: () => {
    window.minipit?.sandboxIsolation()
      .then((m) => set({ sandboxIsolation: m ?? {} }))
      .catch(() => {})
  },

  loadAutoSync: () => {
    window.minipit?.autoSyncGet()
      .then((m) => set({ sandboxAutoSync: m ?? {} }))
      .catch(() => {})
  },

  setAutoSync: (name, on) => {
    // Optimistic: reflect the toggle immediately, then persist in main.
    set((s) => ({ sandboxAutoSync: { ...s.sandboxAutoSync, [name]: on } }))
    window.minipit?.autoSyncSet(name, on).catch(() => {})
  },

  setSandboxIcon: (name, iconKey) =>
    set((state) => {
      const next = { ...state.sandboxIcons }
      if (iconKey) next[name] = iconKey
      else delete next[name]
      localStorage.setItem('minipit:sandboxIcons', JSON.stringify(next))
      window.minipit?.projectConfigSet('sandboxIcons', name, iconKey ?? null)
      return { sandboxIcons: next }
    }),

  setSandboxColor: (name, hex) =>
    set((state) => {
      const next = { ...state.sandboxColors }
      if (hex) next[name] = hex
      else delete next[name]
      localStorage.setItem('minipit:sandboxColors', JSON.stringify(next))
      window.minipit?.projectConfigSet('sandboxColors', name, hex ?? null)
      return { sandboxColors: next }
    }),

  // ── Groups ────────────────────────────────────────────────────────────────
  loadGroups: () => {
    window.minipit?.groupsGet().then((g) => set({ groups: g ?? [] })).catch(() => {})
  },

  createGroup: (name) => {
    const id = `g-${Date.now().toString(36)}-${Math.round(Math.random() * 1e9).toString(36)}`
    const groups = [...useStore.getState().groups, { id, name: name.trim() || 'Group' }]
    set({ groups })
    window.minipit?.groupsSet(groups)
    return id
  },

  renameGroup: (id, name) => {
    const groups = useStore.getState().groups.map((g) => (g.id === id ? { ...g, name: name.trim() || g.name } : g))
    set({ groups })
    window.minipit?.groupsSet(groups)
  },

  deleteGroup: (id, deleteSandboxes) => {
    const state = useStore.getState()
    const members = Object.entries(state.sandboxGroups).filter(([, gid]) => gid === id).map(([n]) => n)
    // Drop the group + clear its members' membership (persist each removal).
    const groups = state.groups.filter((g) => g.id !== id)
    const nextMap = { ...state.sandboxGroups }
    for (const n of members) { delete nextMap[n]; window.minipit?.projectConfigSet('sandboxGroups', n, null) }
    localStorage.setItem('minipit:sandboxGroups', JSON.stringify(nextMap))
    set({ groups, sandboxGroups: nextMap })
    window.minipit?.groupsSet(groups)
    if (deleteSandboxes) {
      for (const n of members) {
        const sb = state.sandboxes.find((s) => s.name === n)
        if (sb) useStore.getState().updateSandbox(sb.id, { status: 'deleting' })
        window.minipit?.deleteSandbox(n).catch(() => {})
      }
    }
  },

  setSandboxGroup: (name, groupId) =>
    set((state) => {
      const next = { ...state.sandboxGroups }
      if (groupId) next[name] = groupId
      else delete next[name]
      localStorage.setItem('minipit:sandboxGroups', JSON.stringify(next))
      window.minipit?.projectConfigSet('sandboxGroups', name, groupId ?? null)
      return { sandboxGroups: next }
    }),

  // Move group `dragId` to just before `beforeId` (null = end); persist order.
  reorderGroups: (dragId, beforeId) => {
    const cur = useStore.getState().groups
    const dragged = cur.find((g) => g.id === dragId)
    if (!dragged) return
    const rest = cur.filter((g) => g.id !== dragId)
    const idx = beforeId ? rest.findIndex((g) => g.id === beforeId) : -1
    const next = idx < 0 ? [...rest, dragged] : [...rest.slice(0, idx), dragged, ...rest.slice(idx)]
    set({ groups: next })
    window.minipit?.groupsSet(next)
  },

  // Move sandbox `dragName` before `beforeName` (null = end) in the manual order.
  // Names not yet in the order are appended in their current listing order first.
  reorderSandbox: (dragName, beforeName) => {
    const s = useStore.getState()
    const base = [...new Set([...s.sandboxOrder, ...s.sandboxes.map((x) => x.name)])].filter((n) => s.sandboxes.some((x) => x.name === n))
    const rest = base.filter((n) => n !== dragName)
    const idx = beforeName ? rest.indexOf(beforeName) : -1
    const next = idx < 0 ? [...rest, dragName] : [...rest.slice(0, idx), dragName, ...rest.slice(idx)]
    localStorage.setItem('minipit:sandboxOrder', JSON.stringify(next))
    set({ sandboxOrder: next })
  },

  setPickerOpen: (open) => set({ pickerOpen: open }),

  setThemePref: (pref) =>
    set((state) => {
      localStorage.setItem('minipit:themePref', pref)
      const theme = resolveTheme(pref)
      document.documentElement.setAttribute('data-theme', theme)
      // Re-apply the color theme so its palette matches the new light/dark mode.
      applyTheme(state.accent, theme)
      return { themePref: pref, theme }
    }),

  setFileOpenMode: (mode) => {
    localStorage.setItem('minipit:fileOpenMode', mode)
    set({ fileOpenMode: mode })
  },

  setDensity: (density) =>
    set((s) => {
      localStorage.setItem('minipit:density', density)
      window.minipit?.setZoomFactor(densityFactor(density, s.densityCustom))
      return { density }
    }),

  setDensityCustom: (factor) =>
    set((s) => {
      const f = clampFactor(factor)
      localStorage.setItem('minipit:densityCustom', String(f))
      if (s.density === 'custom') window.minipit?.setZoomFactor(f)
      return { densityCustom: f }
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
  const { themePref, accent } = useStore.getState()
  if (themePref !== 'system') return
  const theme = resolveTheme('system')
  document.documentElement.setAttribute('data-theme', theme)
  applyTheme(accent, theme)
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
