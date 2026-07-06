import { useStore } from '../store'
import type { Sandbox } from '../types'

// Clone-mode "feature" integrate flow, shared by the context menu and the
// sandbox header. Review-first: fetch the sandbox's work to a local branch,
// then open a PR (preferred when there's a remote) or merge. Optionally delete
// the sandbox afterward. Nothing lands without a confirm.
export async function bringSandboxToHost(sandbox: Sandbox, deleteAfter: boolean): Promise<void> {
  const { updateSandbox } = useStore.getState()
  const ws = sandbox.workspace
  const res = await window.minipit?.sandboxFetchWork(sandbox.name, ws).catch(() => null)
  if (!res?.ok || !res.branch) { alert(res?.error || 'Could not fetch the sandbox\'s changes.'); return }
  const branch = res.branch
  let done = false
  if (res.hasRemote) {
    if (confirm(`Fetched changes to "${branch}".\n\nOpen a pull request? (Cancel keeps the branch for review.)`)) {
      const pr = await window.minipit?.sandboxOpenPr(ws, branch).catch(() => null)
      if (pr?.ok && pr.url) { window.minipit?.openPath(pr.url); done = true }
      else if (pr?.ok) { alert(`Pushed "${branch}". Open a PR from your git host.`); done = true }
      else alert(pr?.error || 'Push / PR failed.')
    }
  } else if (confirm(`Fetched changes to "${branch}".\n\nMerge into your current branch? (Cancel keeps the branch.)`)) {
    const m = await window.minipit?.sandboxMergeBranch(ws, branch).catch(() => null)
    if (m?.ok) { alert(`Merged "${branch}"${m.base ? ` into ${m.base}` : ''}.`); done = true }
    else alert(m?.error || 'Merge failed.')
  }
  if (done && deleteAfter && confirm(`Delete the sandbox "${sandbox.name}" now?`)) {
    updateSandbox(sandbox.id, { status: 'deleting' })
    window.minipit?.deleteSandbox(sandbox.name).catch(() => {})
  }
}
