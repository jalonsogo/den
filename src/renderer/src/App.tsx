import { useEffect } from 'react'
import { useStore } from './store'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { HomePage } from './components/HomePage'
import { ProjectsPage } from './components/ProjectsPage'
import { SandboxesPage } from './components/SandboxesPage'
import { SandboxDetail } from './components/SandboxDetail'
import { TemplatesPage } from './components/TemplatesPage'
import { KitsPage } from './components/KitsPage'
import { SettingsPage } from './components/SettingsPage'
import { ContextMenu } from './components/ContextMenu'
import { PolicyBlockToaster } from './components/PolicyBlockToaster'
import { playFinalizeSound } from './lib/sound'
import { NewSandboxModal } from './components/modals/NewSandboxModal'
import { NewSecretModal } from './components/modals/NewSecretModal'
import { NewKitModal } from './components/modals/NewKitModal'
import type { Sandbox, LogLine, PolicyBlock } from './types'

export function App() {
  const { activePage, modal, setSandboxes, setModal, setActivePage, setActiveTab, appendLog, updateSandbox, setActiveSandboxId, setActiveProject, loadProjects, addPolicyBlock, setAgentActivity } = useStore()

  useEffect(() => {
    // Initial load
    window.minipit?.listSandboxes().then((s) => setSandboxes(s as Sandbox[]))
    loadProjects()

    // Live updates from main process
    const unsub1 = window.minipit?.onSandboxesUpdated((s) => {
      setSandboxes(s as Sandbox[])
    })

    // Stream real log lines from sbx processes
    const unsub2 = window.minipit?.onLogLine((name: string, line: LogLine) => {
      appendLog(name, line)
      // If we got a log line, the sandbox must be running
      updateSandbox(name, { status: 'running' })
    })

    const unsubBlock = window.minipit?.onPolicyBlock?.((b) => addPolicyBlock(b as PolicyBlock))

    // Agent activity: track state and chime on every working → waiting finalize.
    const unsubAct = window.minipit?.onAgentActivity?.((name, state) => {
      const prev = useStore.getState().agentActivity[name]
      setAgentActivity(name, state)
      if (state === 'waiting' && prev === 'working') playFinalizeSound()
    })

    const unsub3 = window.minipit?.onNavigate((page) =>
      setActivePage(page as 'sandbox' | 'settings')
    )
    const unsub4 = window.minipit?.onOpenModal((m) =>
      setModal(m as 'new-sandbox' | 'new-secret')
    )
    const unsub5 = window.minipit?.onSetTab((tab) =>
      setActiveTab(tab as 'terminal' | 'info')
    )
    // Menu-bar (tray) quick-open: jump to a sandbox or a project.
    const unsub6 = window.minipit?.onOpenSandbox((name) => setActiveSandboxId(name))
    const unsub7 = window.minipit?.onOpenProject((workspace) => {
      setActiveProject(workspace)
      setActivePage('projects')
    })

    return () => {
      unsub1?.()
      unsub2?.()
      unsubBlock?.()
      unsubAct?.()
      unsub3?.()
      unsub4?.()
      unsub5?.()
      unsub6?.()
      unsub7?.()
    }
  }, [])

  return (
    <div className="app-root" onContextMenu={(e) => e.preventDefault()}>
      <Toolbar />
      <div className="body">
        <Sidebar />
        <div className="content">
          {activePage === 'home'      && <HomePage />}
          {activePage === 'projects'  && <ProjectsPage />}
          {activePage === 'sandboxes' && <SandboxesPage />}
          {activePage === 'sandbox'   && <SandboxDetail />}
          {activePage === 'templates' && <TemplatesPage />}
          {activePage === 'mixins'    && <KitsPage variant="mixin" />}
          {activePage === 'kits'      && <KitsPage variant="sandbox" />}
          {activePage === 'settings'  && <SettingsPage />}

          {modal === 'new-sandbox' && <NewSandboxModal />}
          {modal === 'new-secret'  && <NewSecretModal />}
          {modal === 'new-kit'     && <NewKitModal />}
        </div>
      </div>
      <ContextMenu />
      <PolicyBlockToaster />
    </div>
  )
}
