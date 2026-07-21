import { useEffect, useRef, useState } from 'react'
import { GitPullRequest, GitMerge, GitCommitHorizontal, GitBranch, RefreshCw, ExternalLink } from 'lucide-react'
import type { Sandbox, ReviewSummary, PullRequest } from '../types'
import { ChangesList } from './ChangesList'
import { FieldSelect } from './FieldSelect'
import { useStore } from '../store'

// The Changes tab's review surface: the review diff (branch diff for clone mode,
// working-tree diff for direct mount), a file list with per-file +/-, and a
// fixed bottom action bar with the total stat plus Merge / Open PR / delete.
export function ChangesReview({ sandbox, stopped, onContext }: {
  sandbox: Sandbox
  stopped: boolean
  onContext: (e: React.MouseEvent, relPath: string, name: string) => void
}) {
  const updateSandbox = useStore((s) => s.updateSandbox)
  const [review, setReview] = useState<ReviewSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [prOpen, setPrOpen] = useState(false)
  const [branches, setBranches] = useState<string[]>([])
  const [base, setBase] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState<null | 'pr' | 'merge' | 'commit'>(null)
  const [pr, setPr] = useState<PullRequest | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [deleteAfter, setDeleteAfter] = useState(false)
  const [commitOpen, setCommitOpen] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  // Files ticked to include in a commit ("exclude from commit" = untick).
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const load = () => {
    if (stopped) return
    setLoading(true); setMsg(null); setPr(null); setPrOpen(false); setCommitOpen(false)
    window.minipit?.reviewSummary(sandbox.name, sandbox.workspace)
      .then((r) => setReview(r ?? null))
      .catch((e) => setReview({ ok: false, error: e instanceof Error ? e.message : 'Failed to load changes.' }))
      .finally(() => setLoading(false))
  }
  // Load on mount / when the sandbox changes (the tab remounts on activation).
  useEffect(load, [sandbox.id, sandbox.workspace, stopped])

  // Let other panels (e.g. the Files context menu after "Add to .gitignore")
  // ask this surface to reload. A ref keeps the listener bound to the latest load.
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    const onRefresh = () => loadRef.current()
    window.addEventListener('den:refresh-changes', onRefresh)
    return () => window.removeEventListener('den:refresh-changes', onRefresh)
  }, [])

  const files = review?.files ?? []
  const branchMode = review?.mode === 'branch'
  const worktreeMode = review?.mode === 'worktree'
  const reviewBranch = branchMode ? (review?.branch ?? null) : null

  // Default to committing everything; re-seed whenever the review reloads.
  useEffect(() => {
    setSelected(worktreeMode ? new Set(files.map((f) => f.path)) : new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review])
  const toggle = (p: string) =>
    setSelected((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n })
  const allSelected = files.length > 0 && selected.size === files.length
  const statFor = (path: string) => {
    const f = files.find((x) => x.path === path)
    return f ? { added: f.added, deleted: f.deleted, binary: f.binary } : undefined
  }
  const openFile = (rel: string, name: string) =>
    window.minipit?.openFileWindow(sandbox.name, `${sandbox.workspace}/${rel}`, name, true, reviewBranch)

  const startPr = async () => {
    setPrOpen(true); setMsg(null)
    const b = (await window.minipit?.listBranches(sandbox.workspace).catch(() => [] as string[])) ?? []
    setBranches(b)
    const defBase = b.includes('main') ? 'main' : b.includes('master') ? 'master' : (b[0] ?? 'main')
    setBase(defBase)
    if (review?.branch) {
      const d = await window.minipit?.prDefaults(sandbox.workspace, review.branch, defBase).catch(() => null)
      if (d) { setTitle(d.title); setBody(d.body) }
    }
  }

  const createPr = async () => {
    if (!review?.branch || !title.trim()) return
    setBusy('pr'); setMsg(null)
    const r = await window.minipit?.sandboxOpenPr(sandbox.workspace, review.branch, { base, title: title.trim(), body })
      .catch(() => null)
    setBusy(null)
    if (r?.ok) { setPr(r); setPrOpen(false) }
    else setMsg({ ok: false, text: r?.error || 'Failed to open PR.' })
  }

  const merge = async () => {
    if (!review?.branch) return
    setBusy('merge'); setMsg(null)
    const r = await window.minipit?.sandboxMergeBranch(sandbox.workspace, review.branch)
      .catch(() => null)
    setBusy(null)
    if (r?.ok) {
      setMsg({ ok: true, text: `Merged into ${r.base ?? 'your branch'}.` })
      if (deleteAfter) { updateSandbox(sandbox.id, { status: 'deleting' }); window.minipit?.deleteSandbox(sandbox.name).catch(() => {}) }
    } else {
      setMsg({ ok: false, text: r?.error || 'Merge failed.' })
    }
  }

  const commit = async () => {
    if (!commitMsg.trim() || selected.size === 0) return
    setBusy('commit'); setMsg(null)
    // Stage-all when everything's ticked; otherwise commit only the ticked paths.
    const only = allSelected ? undefined : Array.from(selected)
    const r = await window.minipit?.sandboxCommit(sandbox.workspace, commitMsg.trim(), only).catch(() => null)
    setBusy(null)
    if (r?.ok) {
      setCommitOpen(false); setCommitMsg('')
      setMsg({ ok: true, text: only ? `Committed ${only.length} file${only.length > 1 ? 's' : ''}.` : 'Changes committed.' })
      load()
    } else setMsg({ ok: false, text: r?.error || 'Commit failed.' })
  }

  if (stopped) return <div className="files-empty">Sandbox is stopped</div>

  return (
    <div className="changes-review">
      {review?.ok && (
        <div className="changes-actions">
          {/* Summary line: branch + net stat, with refresh pinned right. */}
          <div className="ca-summary">
            {review.branch && (
              <span className="ca-branch" title={review.branch}>
                <GitBranch size={11} />{review.branch}
              </span>
            )}
            <span className="ca-stat">
              <span className="changes-add">+{review.added ?? 0}</span>
              <span className="changes-del">−{review.deleted ?? 0}</span>
            </span>
            <div className="ca-bar-spacer" />
            <button className="btn btn-ghost btn-sm" style={{ padding: '3px 5px' }} onClick={load} title="Refresh">
              <RefreshCw size={12} />
            </button>
          </div>
          {/* Action row: sits on its own line so the buttons can breathe. */}
          {!pr && !prOpen && !commitOpen && (
            <div className="ca-actions">
              {review.mode === 'worktree' ? (
                <>
                  <button className="btn btn-default btn-sm" onClick={() => { setCommitOpen(true); setCommitMsg(''); setMsg(null) }} disabled={busy !== null}>
                    <GitCommitHorizontal size={13} /> Commit…
                  </button>
                  {review.hasRemote && (
                    <button className="btn btn-default btn-sm" onClick={startPr} disabled={busy !== null}>
                      <GitPullRequest size={13} /> Open PR…
                    </button>
                  )}
                </>
              ) : (
                <>
                  <label className="ca-delete"><input type="checkbox" checked={deleteAfter} onChange={(e) => setDeleteAfter(e.target.checked)} /> Delete after</label>
                  <div className="ca-bar-spacer" />
                  {review.hasRemote && (
                    <button className="btn btn-default btn-sm" onClick={startPr} disabled={busy !== null}>
                      <GitPullRequest size={13} /> Open PR…
                    </button>
                  )}
                  <button className="btn btn-primary btn-sm" onClick={merge} disabled={busy !== null}>
                    <GitMerge size={13} /> {busy === 'merge' ? 'Merging…' : 'Merge…'}
                  </button>
                </>
              )}
            </div>
          )}

          {pr && (
            <div className="ca-pr">
              <GitPullRequest size={14} />
              <span className="ca-pr-title">
                {pr.number ? `#${pr.number} ` : ''}{pr.title ?? 'Pull request'}{pr.state ? ` · ${pr.state.toLowerCase()}` : ''}
              </span>
              {pr.url && (
                <button className="btn btn-default btn-sm" onClick={() => window.minipit?.openPath(pr.url!)}>
                  <ExternalLink size={12} /> Open
                </button>
              )}
            </div>
          )}
          {prOpen && (
            <div className="ca-prform">
              <label className="flabel">Base branch</label>
              <FieldSelect value={base} options={branches.map((b) => ({ value: b, label: b }))} onChange={setBase} ariaLabel="Base branch" />
              <label className="flabel">Title</label>
              <input className="finput" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pull request title" />
              <label className="flabel">Description</label>
              <textarea className="finput ca-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Optional description" />
              <div className="ca-prform-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setPrOpen(false)} disabled={busy === 'pr'}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={createPr} disabled={busy === 'pr' || !title.trim()}>
                  {busy === 'pr' ? 'Creating…' : 'Create PR'}
                </button>
              </div>
            </div>
          )}
          {commitOpen && (
            <div className="ca-prform">
              <label className="flabel">Commit message</label>
              <textarea className="finput ca-body" value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} rows={3} placeholder="Describe the change" autoFocus />
              <div className="ca-commit-note">
                {selected.size === 0
                  ? 'Tick at least one file below to commit.'
                  : allSelected
                    ? `Committing all ${files.length} file${files.length > 1 ? 's' : ''}. Untick any below to leave them uncommitted.`
                    : `Committing ${selected.size} of ${files.length} files — the rest stay uncommitted.`}
              </div>
              <div className="ca-prform-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setCommitOpen(false)} disabled={busy === 'commit'}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={commit} disabled={busy === 'commit' || !commitMsg.trim() || selected.size === 0}>
                  {busy === 'commit' ? 'Committing…' : allSelected ? 'Commit' : `Commit ${selected.size}`}
                </button>
              </div>
            </div>
          )}
          {msg && <div className={`ca-msg${msg.ok ? ' ok' : ' err'}`}>{msg.text}</div>}
        </div>
      )}

      <div className="changes-scroll">
        {loading && !review ? (
          <div className="files-empty">Loading changes…</div>
        ) : !review?.ok ? (
          <div className="files-empty">{review?.error ?? 'No changes.'}</div>
        ) : files.length === 0 ? (
          <div className="changes-empty">No changes to review.</div>
        ) : (
          <ChangesList
            changes={files}
            statFor={statFor}
            allowDeleted={branchMode}
            onOpen={openFile}
            onContext={onContext}
            // Only surface the per-file tick boxes while a commit is being
            // composed — otherwise the list is just a clean set of changed files.
            selection={worktreeMode && commitOpen ? { selected, onToggle: toggle } : undefined}
          />
        )}
      </div>
    </div>
  )
}
