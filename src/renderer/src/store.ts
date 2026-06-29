import { create } from 'zustand'
import { applyAccent, ensureRamp, savedAccents, writeSavedAccents, type SavedAccent } from './lib/accent'
import type { Sandbox, PageType, TabType, ModalType, LogLine, FileEntry, SecretService } from './types'

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  sandboxId: string | null
}

interface AppState {
  sandboxes: Sandbox[]
  activeSandboxId: string | null
  activePage: PageType
  activeTab: TabType
  modal: ModalType
  contextMenu: ContextMenuState
  files: Record<string, FileEntry[]>
  deletingIds: string[]
  secretTarget: SecretService | null
  newSandboxWorkspace: string | null
  newSandboxTemplate: string | null
  activeProject: string | null
  theme: 'light' | 'dark'
  sidebarCollapsed: boolean
  accent: string
  accentColor: string
  customAccents: SavedAccent[]
  termTheme: string
  projectColors: Record<string, string>
  projectIcons: Record<string, string>
  pickerOpen: boolean
  customProjects: string[]

  setSandboxes:       (sandboxes: Sandbox[]) => void
  setSecretTarget:    (service: SecretService | null) => void
  setNewSandboxWorkspace: (path: string | null) => void
  setNewSandboxTemplate: (ref: string | null) => void
  setActiveProject:   (workspace: string | null) => void
  toggleTheme:        () => void
  toggleSidebar:      () => void
  setAccent:          (id: string) => void
  setCustomAccent:    (hex: string) => void
  saveCustomAccent:   (hex: string) => void
  removeCustomAccent: (id: string) => void
  setTermTheme:       (id: string) => void
  setProjectColor:    (workspace: string, hex: string | null) => void
  setProjectIcon:     (workspace: string, icon: string | null) => void
  setPickerOpen:      (open: boolean) => void
  loadProjects:       () => void
  addProject:         () => Promise<string | null>
  removeProject:      (dir: string) => void
  setDeleting:        (id: string, on: boolean) => void
  updateSandbox:      (id: string, updates: Partial<Sandbox>) => void
  setActiveSandboxId: (id: string | null) => void
  setActivePage:      (page: PageType) => void
  setActiveTab:       (tab: TabType) => void
  setModal:           (modal: ModalType) => void
  appendLog:          (sandboxId: string, line: LogLine) => void
  setContextMenu:     (state: Partial<ContextMenuState>) => void
  setFiles:           (sandboxId: string, files: FileEntry[]) => void
}

export const useStore = create<AppState>((set) => ({
  sandboxes: [],
  activeSandboxId: null,
  activePage: 'home',
  activeTab: 'terminal',
  modal: null,
  contextMenu: { visible: false, x: 0, y: 0, sandboxId: null },
  files: {},
  deletingIds: [],
  secretTarget: null,
  newSandboxWorkspace: null,
  newSandboxTemplate: null,
  activeProject: null,
  theme: (localStorage.getItem('minipit:theme') === 'dark' ? 'dark' : 'light'),
  sidebarCollapsed: localStorage.getItem('minipit:sidebarCollapsed') === '1',
  accent: localStorage.getItem('minipit:accent') ?? 'graphite',
  accentColor: localStorage.getItem('minipit:accentColor') ?? '#3b82f6',
  customAccents: savedAccents(),
  termTheme: localStorage.getItem('minipit:termTheme') ?? 'minipit',
  projectColors: (() => {
    try { return JSON.parse(localStorage.getItem('minipit:projectColors') ?? '{}') ?? {} } catch { return {} }
  })(),
  projectIcons: (() => {
    try { return JSON.parse(localStorage.getItem('minipit:projectIcons') ?? '{}') ?? {} } catch { return {} }
  })(),
  pickerOpen: false,
  customProjects: [],

  setSecretTarget: (service) => set({ secretTarget: service }),

  setNewSandboxWorkspace: (path) => set({ newSandboxWorkspace: path }),

  setNewSandboxTemplate: (ref) => set({ newSandboxTemplate: ref }),

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
      // If the removed swatch was active, fall back to graphite.
      if (state.accent === id) {
        localStorage.setItem('minipit:accent', 'graphite')
        applyAccent('graphite')
        return { customAccents: list, accent: 'graphite' }
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
      localStorage.setItem('minipit:projectColors', JSON.stringify(next))
      return { projectColors: next }
    }),

  setProjectIcon: (workspace, icon) =>
    set((state) => {
      const next = { ...state.projectIcons }
      if (icon) next[workspace] = icon
      else delete next[workspace]
      localStorage.setItem('minipit:projectIcons', JSON.stringify(next))
      return { projectIcons: next }
    }),

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

  removeProject: (dir) => {
    window.minipit?.removeProject(dir).catch(() => {})
    set((s) => ({ customProjects: s.customProjects.filter((d) => d !== dir) }))
  },

  toggleTheme: () =>
    set((state) => {
      const theme = state.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem('minipit:theme', theme)
      document.documentElement.setAttribute('data-theme', theme)
      // Re-apply the accent so any GUI tint matches the new mode.
      applyAccent(state.accent, state.accentColor)
      return { theme }
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

      const sandboxes = incoming.map((s) => ({
        ...s,
        logs: logsById[s.id] ?? [],
        status: deletingIds.includes(s.id) ? ('deleting' as const) : s.status
      }))

      const activeStillExists = sandboxes.some((s) => s.id === state.activeSandboxId)
      const activeSandboxId = activeStillExists
        ? state.activeSandboxId
        : (sandboxes[0]?.id ?? null)

      return { sandboxes, activeSandboxId, deletingIds }
    }),

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
    set((state) => ({
      sandboxes: state.sandboxes.map((s) => (s.id === id ? { ...s, ...updates } : s))
    })),

  setActiveSandboxId: (id) => set({ activeSandboxId: id, activePage: 'sandbox', activeTab: 'terminal' }),

  setActivePage: (page) => set({ activePage: page }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setModal: (modal) => set({ modal }),

  appendLog: (sandboxId, line) =>
    set((state) => ({
      sandboxes: state.sandboxes.map((s) =>
        s.id === sandboxId ? { ...s, logs: [...s.logs, line] } : s
      )
    })),

  setContextMenu: (ctx) =>
    set((state) => ({ contextMenu: { ...state.contextMenu, ...ctx } })),

  setFiles: (sandboxId, files) =>
    set((state) => ({ files: { ...state.files, [sandboxId]: files } }))
}))
