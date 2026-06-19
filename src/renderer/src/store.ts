import { create } from 'zustand'
import { applyAccent } from './lib/accent'
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
  termTheme: string

  setSandboxes:       (sandboxes: Sandbox[]) => void
  setSecretTarget:    (service: SecretService | null) => void
  setNewSandboxWorkspace: (path: string | null) => void
  setNewSandboxTemplate: (ref: string | null) => void
  setActiveProject:   (workspace: string | null) => void
  toggleTheme:        () => void
  toggleSidebar:      () => void
  setAccent:          (id: string) => void
  setCustomAccent:    (hex: string) => void
  setTermTheme:       (id: string) => void
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
  termTheme: localStorage.getItem('minipit:termTheme') ?? 'minipit',

  setSecretTarget: (service) => set({ secretTarget: service }),

  setNewSandboxWorkspace: (path) => set({ newSandboxWorkspace: path }),

  setNewSandboxTemplate: (ref) => set({ newSandboxTemplate: ref }),

  setActiveProject: (workspace) => set({ activeProject: workspace }),

  setAccent: (id) =>
    set((state) => {
      localStorage.setItem('minipit:accent', id)
      applyAccent(id, state.accentColor)
      return { accent: id }
    }),

  setCustomAccent: (hex) =>
    set(() => {
      localStorage.setItem('minipit:accent', 'custom')
      localStorage.setItem('minipit:accentColor', hex)
      applyAccent('custom', hex)
      return { accent: 'custom', accentColor: hex }
    }),

  setTermTheme: (id) =>
    set(() => {
      localStorage.setItem('minipit:termTheme', id)
      return { termTheme: id }
    }),

  toggleTheme: () =>
    set((state) => {
      const theme = state.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem('minipit:theme', theme)
      document.documentElement.setAttribute('data-theme', theme)
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
