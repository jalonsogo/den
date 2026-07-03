import { useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useStore } from './store'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { HomePage } from './components/HomePage'
import { ProjectsPage } from './components/ProjectsPage'
import { SandboxDetail } from './components/SandboxDetail'
import { TemplatesPage } from './components/TemplatesPage'
import { KitsPage } from './components/KitsPage'
import { SettingsPage } from './components/SettingsPage'
import { LogsPanel } from './components/LogsPanel'
import { ContextMenu } from './components/ContextMenu'
import { PolicyBlockToaster } from './components/PolicyBlockToaster'
import { playFinalizeSound, playAskSound } from './lib/sound'
import { NewSandboxModal } from './components/modals/NewSandboxModal'
import { NewSecretModal } from './components/modals/NewSecretModal'
import { NewKitModal } from './components/modals/NewKitModal'
import { PromptModal } from './components/modals/PromptModal'
import { TemplateInspectModal } from './components/modals/TemplateInspectModal'
import type { Sandbox, LogLine, PolicyBlock } from './types'

export function App() {
  const { activePage, modal, setSandboxes, setModal, setActivePage, setActiveTab, appendLog, updateSandbox, setActiveSandboxId, setActiveProject, loadProjects, addPolicyBlock, setAgentActivity, syncProjectConfig, loadSandboxIsolation } = useStore()

  useEffect(() => {
    // Initial load
    window.minipit?.listSandboxes().then((s) => setSandboxes(s as Sandbox[]))
    loadProjects()
    // Pull durable per-project appearance from the main-process store (and
    // migrate any localStorage-cached config into it on first run).
    syncProjectConfig()
    // Per-sandbox working-tree isolation (for the shared-folder warning).
    loadSandboxIsolation()
    // Named sandbox groups.
    useStore.getState().loadGroups()

    // Live updates from main process
    const unsub1 = window.minipit?.onSandboxesUpdated((s) => {
      setSandboxes(s as Sandbox[])
      // A create/delete changes the isolation map — keep it fresh.
      loadSandboxIsolation()
    })

    // Stream real log lines from sbx processes
    const unsub2 = window.minipit?.onLogLine((name: string, line: LogLine) => {
      appendLog(name, line)
      // If we got a log line, the sandbox must be running
      updateSandbox(name, { status: 'running' })
    })

    const unsubBlock = window.minipit?.onPolicyBlock?.((b) => addPolicyBlock(b as PolicyBlock))

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

    // Menu-bar (tray) quick-open: jump to a sandbox or a project.
    const unsub6 = window.minipit?.onOpenSandbox((name) => setActiveSandboxId(name))
    const unsub7 = window.minipit?.onOpenProject((workspace) => {
      setActiveProject(workspace)
      setActivePage('projects')
    })
    // Menu-bar "New Project…": run the same pick-folder flow as the sidebar.
    const unsub8 = window.minipit?.onNewProject?.(() => {
      useStore.getState().addProject().then((dir) => {
        if (dir) { setActiveProject(dir); setActivePage('projects') }
      })
    })

    return () => {
      unsub1?.()
      unsub2?.()
      unsubBlock?.()
      unsubAttn?.()
      unsubAct?.()
      unsub3?.()
      unsub4?.()
      unsub5?.()
      unsub6?.()
      unsub7?.()
      unsub8?.()
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
          {activePage === 'projects'  && <ProjectsPage />}
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
