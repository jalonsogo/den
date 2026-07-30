import { useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useStore } from './store'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { HomePage } from './components/HomePage'
import { SandboxDetail } from './components/SandboxDetail'
import { TemplatesPage } from './components/TemplatesPage'
import { KitsPage } from './components/KitsPage'
import { SettingsPage } from './components/SettingsPage'
import { LogsPanel } from './components/LogsPanel'
import { ContextMenu } from './components/ContextMenu'
import { PolicyBlockToaster } from './components/PolicyBlockToaster'
import { playFinalizeSound, playAskSound } from './lib/sound'
import { termTheme as resolveTermTheme } from './lib/termThemes'
import { NewSandboxModal } from './components/modals/NewSandboxModal'
import { NewSecretModal } from './components/modals/NewSecretModal'
import { NewKitModal } from './components/modals/NewKitModal'
import { CommandPalette } from './components/CommandPalette'
import { PromptModal } from './components/modals/PromptModal'
import { TemplateInspectModal } from './components/modals/TemplateInspectModal'
import type { Sandbox, LogLine, PolicyBlock, SandboxError } from './types'

export function App() {
  const { activePage, modal, setSandboxes, setModal, setActivePage, setActiveTab, appendLog, updateSandbox, setActiveSandboxId, addPolicyBlock, setAgentActivity, syncProjectConfig, loadSandboxIsolation, loadAutoSync } = useStore()

  // Mirror the TERMINAL theme's light/dark polarity to main so it can set Claude
  // Code's own theme (themeId) to match. The agent paints into xterm, so what
  // decides whether its text is readable is the terminal background — not the app
  // chrome. Those two can disagree (a dark term theme picked in a light app, or
  // the reverse), and the agent has to follow the terminal. Applied at the next
  // agent launch; a session that's already running keeps its palette.
  const appTheme = useStore((s) => s.theme)
  const termThemeId = useStore((s) => s.termTheme)
  const termMode = resolveTermTheme(termThemeId, appTheme).mode
  useEffect(() => { window.minipit?.setTermMode(termMode) }, [termMode])

  // Mirror which sandbox is open so the Sandboxes menu can mark it and put the
  // keyboard accelerators on that sandbox's own items — a menu item saying
  // "Stop Sandbox" can't tell you which one it means.
  // Same reason as the theme mirror: the Sandboxes menu is built in main, so it
  // needs to know which terminal "Connect in Terminal" should use.
  const terminalAppId = useStore((s) => s.terminalApp)
  useEffect(() => { window.minipit?.setTerminalApp?.(terminalAppId) }, [terminalAppId])

  const activeSandboxId = useStore((s) => s.activeSandboxId)
  const activeSandboxName = useStore(
    (s) => s.sandboxes.find((x) => x.id === s.activeSandboxId)?.name ?? null
  )
  useEffect(() => {
    window.minipit?.setActiveSandbox?.(activeSandboxName)
  }, [activeSandboxName, activeSandboxId])

  useEffect(() => {
    // Initial load
    window.minipit?.listSandboxes().then((s) => setSandboxes(s as Sandbox[]))
    // Pull durable per-sandbox appearance (color/icon) + group membership from
    // the main-process store, migrating any localStorage cache on first run.
    syncProjectConfig()
    // Per-sandbox working-tree isolation (for the shared-folder warning).
    loadSandboxIsolation()
    // Per-sandbox auto-sync-to-review-branch toggle (clone mode).
    loadAutoSync()
    // Named sandbox groups.
    useStore.getState().loadGroups()
    // Signed-in Docker Hub account (username/email/orgs) for the account menu.
    useStore.getState().loadDockerAccount()

    // Live updates from main process
    const unsub1 = window.minipit?.onSandboxesUpdated((s) => {
      const list = s as Sandbox[]
      setSandboxes(list)
      // A create/delete changes the isolation map — keep it fresh.
      loadSandboxIsolation()
      // A recorded start failure is stale once the sandbox is up (or gone).
      // Doing it here covers every entry point — header, tray, palette, restart —
      // rather than each one having to remember to clear it.
      const st = useStore.getState()
      for (const name of Object.keys(st.sandboxErrors)) {
        const sb = list.find((x) => x.name === name)
        if (!sb || sb.status === 'running') st.clearSandboxError(name)
      }
    })

    // Stream real log lines from sbx processes
    const unsub2 = window.minipit?.onLogLine((name: string, line: LogLine) => {
      appendLog(name, line)
      // If we got a log line, the sandbox must be running
      updateSandbox(name, { status: 'running' })
    })

    const unsubBlock = window.minipit?.onPolicyBlock?.((b) => addPolicyBlock(b as PolicyBlock))

    // `sbx run` refused the launch. `runSandbox` is fire-and-forget (it can't
    // report this), and the optimistic "starting"/"running" would otherwise sit
    // there forever — so record the reason and put the sandbox back to stopped.
    const unsubErr = window.minipit?.onSandboxError?.((e) => {
      const err = e as SandboxError
      useStore.getState().setSandboxError(err)
      updateSandbox(err.sandbox, { status: 'stopped', uptimeSeconds: undefined })
    })

    // The agent needs the user (question / permission / idle): play the distinct
    // "ask" cue. This event is sent just before the matching activity→waiting, so
    // we note it and let the activity handler skip the finish cue for it.
    const askedAt: Record<string, number> = {}
    const unsubAttn = window.minipit?.onAgentAttention?.((name) => {
      askedAt[name] = Date.now()
      playAskSound()
    })

    // Agent activity: track state and chime on every working → waiting finalize,
    // unless an attention cue just fired for this sandbox (it's a question, not a
    // finished turn).
    const unsubAct = window.minipit?.onAgentActivity?.((name, state) => {
      const prev = useStore.getState().agentActivity[name]
      setAgentActivity(name, state)
      if (state === 'waiting' && prev === 'working') {
        if (Date.now() - (askedAt[name] ?? 0) < 1500) return
        playFinalizeSound()
      }
    })

    const unsub3 = window.minipit?.onNavigate((page) =>
      setActivePage(page as import('./types').PageType)
    )
    const unsub4 = window.minipit?.onOpenModal((m) =>
      setModal(m as 'new-sandbox' | 'new-secret')
    )
    const unsub5 = window.minipit?.onSetTab((tab) =>
      setActiveTab(tab as 'terminal' | 'info')
    )
    // A sandbox's files changed → refresh its uncommitted-change count.
    const unsubFiles = window.minipit?.onFilesChanged?.((name) => {
      const sb = useStore.getState().sandboxes.find((s) => s.name === name)
      if (sb) useStore.getState().refreshSandboxChanges(name, sb.workspace)
    })

    // Menu-bar (tray) quick-open: jump to a sandbox.
    const unsub6 = window.minipit?.onOpenSandbox((name) => setActiveSandboxId(name))

    // A menu action aimed at a specific sandbox by name. Run here rather than in
    // main so the sidebar reflects the transition immediately (main would have to
    // wait for the next poll to show "stopping"/"starting").
    const unsubAction = window.minipit?.onSandboxAction?.((name, action) => {
      const s = useStore.getState()
      const sb = s.sandboxes.find((x) => x.name === name)
      if (!sb) return
      switch (action) {
        case 'open':
          s.setActiveSandboxId(sb.id)
          break
        case 'start':
          s.updateSandbox(sb.id, { status: 'starting' })
          window.minipit?.runSandbox(name)
            .then(() => s.updateSandbox(sb.id, { status: 'running' }))
            .catch(() => s.updateSandbox(sb.id, { status: 'stopped' }))
          break
        case 'stop':
          s.updateSandbox(sb.id, { status: 'stopping' })
          window.minipit?.stopSandbox(name)
            .then(() => s.updateSandbox(sb.id, { status: 'stopped', uptimeSeconds: undefined }))
            .catch(() => s.updateSandbox(sb.id, { status: 'running' }))
          break
        case 'restart':
          s.updateSandbox(sb.id, { status: 'stopping' })
          ;(async () => {
            try {
              await window.minipit?.stopSandbox(name)
              await window.minipit?.runSandbox(name)
              s.updateSandbox(sb.id, { status: 'running' })
            } catch { s.updateSandbox(sb.id, { status: 'running' }) }
          })()
          break
        case 'logs':
          // logsReturn is what the Logs page's back button uses to come back here.
          s.setLogsSandbox(name)
          s.setLogsReturn(sb.id)
          s.setActivePage('logs')
          break
      }
    })

    return () => {
      unsub1?.()
      unsub2?.()
      unsubBlock?.()
      unsubErr?.()
      unsubAttn?.()
      unsubAct?.()
      unsub3?.()
      unsub4?.()
      unsub5?.()
      unsub6?.()
      unsubAction?.()
      unsubFiles?.()
    }
  }, [])

  // Cmd shortcuts. Cmd (not Ctrl) so terminal/shell control keys are untouched.
  // Sandbox actions act on the open sandbox; New Sandbox works anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      const k = e.key.toLowerCase()
      const s = useStore.getState()

      if (k === 'k') { e.preventDefault(); s.setPaletteOpen(!s.paletteOpen); return }
      if (k === 'n') { e.preventDefault(); s.setModal('new-sandbox'); return }
      if (typing || s.activePage !== 'sandbox') return

      const sb = s.sandboxes.find((x) => x.id === s.activeSandboxId)
      if (!sb) return
      const running = sb.status === 'running'

      switch (k) {
        case 's':
          if (running) { e.preventDefault(); s.updateSandbox(sb.id, { status: 'stopping' })
            window.minipit?.stopSandbox(sb.name)
              .then(() => s.updateSandbox(sb.id, { status: 'stopped', uptimeSeconds: undefined }))
              .catch(() => s.updateSandbox(sb.id, { status: 'running' })) }
          break
        case 'r':
          e.preventDefault(); s.updateSandbox(sb.id, { status: 'stopping' })
          ;(async () => {
            try { await window.minipit?.stopSandbox(sb.name); await window.minipit?.runSandbox(sb.name); s.updateSandbox(sb.id, { status: 'running' }) }
            catch { s.updateSandbox(sb.id, { status: 'running' }) }
          })()
          break
        case 'x':
          e.preventDefault()
          if (confirm(`Delete sandbox "${sb.name}"? This can't be undone.`)) {
            s.updateSandbox(sb.id, { status: 'deleting' })
            window.minipit?.deleteSandbox(sb.name).catch(() => {})
          }
          break
        case 'l':
          e.preventDefault(); s.setLogsSandbox(sb.name); s.setLogsReturn(sb.id); s.setActivePage('logs'); break
        case 'f':
          e.preventDefault(); window.dispatchEvent(new CustomEvent('den:toggle-dock', { detail: 'files' })); break
        case 'i':
          e.preventDefault(); window.dispatchEvent(new CustomEvent('den:toggle-dock', { detail: 'info' })); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app-root" onContextMenu={(e) => e.preventDefault()}>
      <Toolbar />
      <div className="body">
        <Sidebar />
        <div className="content">
          {activePage === 'sandboxes' && <HomePage />}
          {activePage === 'sandbox'   && <SandboxDetail />}
          {activePage === 'templates' && <TemplatesPage />}
          {activePage === 'mixins'    && <KitsPage variant="mixin" />}
          {activePage === 'kits'      && <KitsPage variant="sandbox" />}
          {activePage === 'settings'  && <SettingsPage />}
          {activePage === 'logs'      && <LogsPage />}

          {modal === 'new-sandbox' && <NewSandboxModal />}
          {modal === 'new-secret'  && <NewSecretModal />}
          {modal === 'new-kit'     && <NewKitModal />}
        </div>
      </div>
      <ContextMenu />
      <PromptModal />
      <TemplateInspectModal />
      <PolicyBlockToaster />
      <CommandPalette />
    </div>
  )
}

// The Logs page. When opened from a sandbox's "Logs" action it shows a back
// button that returns to that sandbox.
function LogsPage() {
  const logsReturn = useStore((s) => s.logsReturn)
  const setActiveSandboxId = useStore((s) => s.setActiveSandboxId)
  const backName = useStore((s) => s.sandboxes.find((x) => x.id === logsReturn)?.name)

  return (
    <div className="page">
      <div className="page-hdr">
        {logsReturn && (
          <button className="btn btn-ghost btn-sm" onClick={() => setActiveSandboxId(logsReturn)}>
            <ArrowLeft size={14} /> {backName ?? 'Back'}
          </button>
        )}
        <span className="page-title">Logs</span>
      </div>
      <LogsPanel />
    </div>
  )
}
